import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PROFILES } from '@tvemu/engine';
import type {
    BridgeEvent,
    BridgeRequest,
    BridgeResponse,
    Engine,
    EngineStartOptions,
    KeyAction,
    RemoteUiServerMessage,
} from '@tvemu/protocol';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createHost } from './host.js';
import {
    loadDeviceProfile,
    parseProfileSetArgs,
    selectDeviceProfile,
} from './profile.js';
import { readRunState, runFilePath, writeRunState } from './run-file.js';
import { runCli } from './cli.js';

interface FakeEngineState {
    engine: Engine;
    startOptions: EngineStartOptions | null;
    navigatedUrls: string[];
    dispatchedKeys: Array<{ code: number; keyName: string; action: KeyAction }>;
    resolvedBindings: BridgeResponse[];
    emittedEvents: BridgeEvent[];
    stopped: boolean;
    triggerBindingCall: (request: BridgeRequest) => void;
    triggerExit: (reason: string) => void;
}

function createFakeEngine(screenshotData: Buffer = Buffer.from('fake-png-bytes')): FakeEngineState {
    let bindingListener: ((message: BridgeRequest) => void) | null = null;
    let exitListener: ((reason: string) => void) | null = null;

    const state: FakeEngineState = {
        startOptions: null,
        navigatedUrls: [],
        dispatchedKeys: [],
        resolvedBindings: [],
        emittedEvents: [],
        stopped: false,
        triggerBindingCall(request: BridgeRequest): void {
            bindingListener?.(request);
        },
        triggerExit(reason: string): void {
            exitListener?.(reason);
        },
        engine: {
            async start(options: EngineStartOptions): Promise<void> {
                state.startOptions = options;
            },
            async navigate(url: string): Promise<void> {
                state.navigatedUrls.push(url);
            },
            async dispatchKey(code: number, keyName: string, action: KeyAction): Promise<void> {
                state.dispatchedKeys.push({ code, keyName, action });
            },
            async evaluate<T>(): Promise<T> {
                return undefined as T;
            },
            onBindingCall(listener: (message: BridgeRequest) => void): void {
                bindingListener = listener;
            },
            async resolveBinding(response: BridgeResponse): Promise<void> {
                state.resolvedBindings.push(response);
            },
            async emitEvent(event: BridgeEvent): Promise<void> {
                state.emittedEvents.push(event);
            },
            async screenshot(): Promise<Buffer> {
                return screenshotData;
            },
            onExit(listener: (reason: string) => void): void {
                exitListener = listener;
            },
            async stop(): Promise<void> {
                state.stopped = true;
            },
        },
    };

    return state;
}

async function createSampleWgt(
    dir: string,
    options?: {
        packageId?: string;
        appId?: string;
        contentSrc?: string;
        csp?: string;
        accessOrigins?: string[];
        extraFiles?: Record<string, string | Buffer>;
    },
): Promise<string> {
    const packageId = options?.packageId ?? 'DemoPkg';
    const appId = options?.appId ?? `${packageId}.App`;
    const contentSrc = options?.contentSrc ?? 'index.html';
    const cspTag = options?.csp
        ? `<tizen:content-security-policy>${options.csp}</tizen:content-security-policy>`
        : '';
    const origins = (options?.accessOrigins ?? ['*'])
        .map((origin) => `<access origin="${origin}" subdomains="true"/>`)
        .join('\n    ');

    const configXml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
    id="http://example.com/${appId}" version="1.0.0">
    <tizen:application id="${appId}" package="${packageId}" required_version="5.5"/>
    ${origins}
    ${cspTag}
    <content src="${contentSrc}"/>
    <name>Demo App</name>
</widget>`;

    const entries: Record<string, Uint8Array> = {
        'config.xml': strToU8(configXml),
        'index.html': strToU8('<!DOCTYPE html><html><head><title>Demo</title></head><body>Hi</body></html>'),
    };
    if (options?.extraFiles) {
        for (const [name, content] of Object.entries(options.extraFiles)) {
            entries[name] = typeof content === 'string' ? strToU8(content) : new Uint8Array(content);
        }
    }

    const wgtPath = path.join(dir, `${packageId}.wgt`);
    await writeFile(wgtPath, zipSync(entries));
    return wgtPath;
}

function rawHttpGet(urlString: string, headers?: Record<string, string>): Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
}> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(urlString);
        const req = http.request(
            {
                hostname: parsed.hostname,
                port: Number(parsed.port),
                path: parsed.pathname + parsed.search,
                method: 'GET',
                headers,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    });
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}

function rawPathRequest(port: number, rawPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: rawPath,
                method: 'GET',
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf8'),
                    });
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}

async function createFakeAppBundle(
    parentDir: string,
    appName: string,
    executableName: string,
    version: string,
): Promise<string> {
    const contentsDir = path.join(parentDir, appName, 'Contents');
    const macOsDir = path.join(contentsDir, 'MacOS');
    await mkdir(macOsDir, { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${executableName}</string>
    <key>CFBundleShortVersionString</key>
    <string>${version}</string>
</dict>
</plist>`;
    await writeFile(path.join(contentsDir, 'Info.plist'), plist, 'utf8');
    const executablePath = path.join(macOsDir, executableName);
    await writeFile(executablePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    return executablePath;
}

describe('host server, key repeat, bridge routing, control auth, and run.json', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        vi.useRealTimers();
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('serves app files with MIME types, Range 206, CSP header, traversal rejection, no dir listing, and webapis.js stub', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-http-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const profile = DEFAULT_PROFILES[0]!;
        const fake = createFakeEngine();

        const host = createHost({
            home,
            profile,
            sdbPort: false,
            createEngine: () => fake.engine,
            loadTizenApiScript: async () => null,
        });

        await host.start();
        try {
            const wgtPath = await createSampleWgt(root, {
                csp: "default-src 'self'",
                extraFiles: {
                    'app.js': 'console.log(1);',
                    'media/clip.mp4': Buffer.from('0123456789ABCDEF'),
                    'sub/info.json': '{"ok":true}',
                },
            });
            await host.installWgt(wgtPath);

            const outsideSecret = path.join(root, 'secret.txt');
            await writeFile(outsideSecret, 'top-secret', 'utf8');
            await symlink(outsideSecret, path.join(home, 'apps', 'DemoPkg', 'content', 'escape.txt'));

            const remoteUrl = new URL(host.urls().remote);
            const base = `http://127.0.0.1:${remoteUrl.port}`;

            const htmlRes = await rawHttpGet(`${base}/app/DemoPkg/index.html`);
            expect(htmlRes.status).toBe(200);
            expect(htmlRes.headers['content-type']).toBe('text/html; charset=utf-8');
            expect(htmlRes.headers['content-security-policy']).toBe("default-src 'self'");

            const jsRes = await rawHttpGet(`${base}/app/DemoPkg/app.js`);
            expect(jsRes.status).toBe(200);
            expect(jsRes.headers['content-type']).toBe('application/javascript; charset=utf-8');
            expect(jsRes.headers['content-security-policy']).toBeUndefined();

            const jsonRes = await rawHttpGet(`${base}/app/DemoPkg/sub/info.json`);
            expect(jsonRes.status).toBe(200);
            expect(jsonRes.headers['content-type']).toBe('application/json; charset=utf-8');

            const rangeRes = await rawHttpGet(`${base}/app/DemoPkg/media/clip.mp4`, { Range: 'bytes=2-5' });
            expect(rangeRes.status).toBe(206);
            expect(rangeRes.headers['content-type']).toBe('video/mp4');
            expect(rangeRes.headers['content-range']).toBe('bytes 2-5/16');
            expect(rangeRes.body.toString('utf8')).toBe('2345');

            const suffixRangeRes = await rawHttpGet(`${base}/app/DemoPkg/media/clip.mp4`, { Range: 'bytes=-4' });
            expect(suffixRangeRes.status).toBe(206);
            expect(suffixRangeRes.headers['content-range']).toBe('bytes 12-15/16');
            expect(suffixRangeRes.body.toString('utf8')).toBe('CDEF');

            const badRangeRes = await rawHttpGet(`${base}/app/DemoPkg/media/clip.mp4`, { Range: 'bytes=99-120' });
            expect(badRangeRes.status).toBe(416);
            expect(badRangeRes.headers['content-range']).toBe('bytes */16');

            const stubRootRes = await rawHttpGet(`${base}/$WEBAPIS/webapis/webapis.js`);
            expect(stubRootRes.status).toBe(200);
            expect(stubRootRes.headers['content-type']).toBe('application/javascript; charset=utf-8');
            expect(stubRootRes.body.length).toBe(0);

            const stubAppRes = await rawHttpGet(`${base}/app/DemoPkg/$WEBAPIS/webapis/webapis.js`);
            expect(stubAppRes.status).toBe(200);
            expect(stubAppRes.body.length).toBe(0);

            const port = Number(remoteUrl.port);
            expect((await rawPathRequest(port, '/app/DemoPkg/../../secret.txt')).status).toBe(403);
            expect((await rawPathRequest(port, '/app/DemoPkg/%2e%2e/manifest.json')).status).toBe(403);
            expect((await rawPathRequest(port, '/app/DemoPkg/escape.txt')).status).toBe(403);
            expect((await rawPathRequest(port, '/app/DemoPkg/')).status).toBe(403);
            expect((await rawPathRequest(port, '/app/DemoPkg/media/')).status).toBe(403);

            const idleRes = await rawHttpGet(`${base}/idle`);
            expect(idleRes.status).toBe(200);
            expect(idleRes.body.toString('utf8')).toContain(profile.label);

            const remoteHtml = await rawHttpGet(`${base}/remote/`);
            expect(remoteHtml.status).toBe(200);
            expect(remoteHtml.body.toString('utf8')).toContain('tvemu Remote Control');
        } finally {
            await host.stop();
        }
    });

    it('injects profile and manifest before tizen-api and navigates to app or absolute URL', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-launch-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const profile = DEFAULT_PROFILES[0]!;
        const fake = createFakeEngine();
        const logs: string[] = [];
        let capturedCrossOrigin: boolean | null = null;

        const host = createHost({
            home,
            profile,
            sdbPort: false,
            log: (line) => logs.push(line),
            createEngine: (opts) => {
                capturedCrossOrigin = opts.allowCrossOrigin;
                return fake.engine;
            },
            loadTizenApiScript: async () => 'window.__tizenApiLoaded = true;',
        });

        await host.start();
        try {
            const wgtPath = await createSampleWgt(root, {
                packageId: 'HostedPkg',
                appId: 'HostedPkg.Main',
                contentSrc: 'https://tv.example.com/start',
                accessOrigins: ['*'],
            });
            const installed = await host.installWgt(wgtPath);
            await host.launch(installed.manifest.appId);

            expect(capturedCrossOrigin).toBe(true);
            expect(fake.startOptions?.userDataDir).toBe(path.join(home, 'profiles', profile.name));
            expect(fake.startOptions?.injectedScripts).toHaveLength(2);
            expect(fake.startOptions?.injectedScripts[0]).toContain('__tvemuProfile');
            expect(fake.startOptions?.injectedScripts[0]).toContain('__tvemuManifest');
            expect(fake.startOptions?.injectedScripts[1]).toBe('window.__tizenApiLoaded = true;');
            expect(fake.navigatedUrls[0]).toBe('https://tv.example.com/start');
            expect(host.urls().app).toBe('https://tv.example.com/start');

            await host.terminate(installed.manifest.appId);
            expect(await host.runningApp()).toBeNull();
            expect(fake.navigatedUrls.at(-1)).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/idle$/);
        } finally {
            await host.stop();
        }
    });

    it('throws actionable error with tvemu engine install <milestone> when engine is missing', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-missing-engine-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const profile = { ...DEFAULT_PROFILES[1]!, chromiumMilestone: 9999 };
        const host = createHost({
            home,
            profile,
            sdbPort: false,
            playwrightCacheDir: path.join(root, 'no-playwright-cache'),
            loadTizenApiScript: async () => null,
        });

        await host.start();
        try {
            const wgtPath = await createSampleWgt(root);
            const app = await host.installWgt(wgtPath);
            await expect(host.launch(app.manifest.appId)).rejects.toThrow(/tvemu engine install 9999/);
        } finally {
            await host.stop();
        }
    });

    it('repeats held keys after 500ms then every 100ms until key up', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-keys-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fake = createFakeEngine();
        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            createEngine: () => fake.engine,
            loadTizenApiScript: async () => null,
        });

        await host.start();
        try {
            const wgtPath = await createSampleWgt(root);
            const app = await host.installWgt(wgtPath);
            await host.launch(app.manifest.appId);

            await expect(host.sendKey('NonExistentKey')).rejects.toThrow(/Unknown remote key/);

            vi.useFakeTimers();
            await host.sendKey('arrowright', 'down');
            expect(fake.dispatchedKeys).toEqual([{ code: 39, keyName: 'ArrowRight', action: 'down' }]);

            vi.advanceTimersByTime(499);
            expect(fake.dispatchedKeys).toHaveLength(1);

            vi.advanceTimersByTime(1);
            expect(fake.dispatchedKeys).toHaveLength(2);

            vi.advanceTimersByTime(250);
            expect(fake.dispatchedKeys).toHaveLength(4);

            await host.sendKey('ArrowRight', 'up');
            expect(fake.dispatchedKeys.at(-1)).toEqual({ code: 39, keyName: 'ArrowRight', action: 'up' });

            const countAfterUp = fake.dispatchedKeys.length;
            vi.advanceTimersByTime(1000);
            expect(fake.dispatchedKeys).toHaveLength(countAfterUp);
        } finally {
            vi.useRealTimers();
            await host.stop();
        }
    });

    it('routes bridge requests and broadcasts state and logs over /remote/ws', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-bridge-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fake = createFakeEngine();
        const logs: string[] = [];

        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            log: (line) => logs.push(line),
            createEngine: () => fake.engine,
            loadTizenApiScript: async () => null,
        });

        await host.start();
        const ws = new WebSocket(host.urls().remote.replace('http://', 'ws://') + 'ws');
        const wsMessages: RemoteUiServerMessage[] = [];
        ws.on('message', (data) => {
            wsMessages.push(JSON.parse(data.toString()) as RemoteUiServerMessage);
        });
        await new Promise<void>((resolve) => ws.once('open', resolve));

        try {
            const wgtPath = await createSampleWgt(root);
            const app = await host.installWgt(wgtPath);
            await host.launch(app.manifest.appId);

            fake.triggerBindingCall({ id: 1, api: 'tvinputdevice', method: 'keysChanged', args: [['ColorF0Red', 'Info']] });
            fake.triggerBindingCall({ id: 2, api: 'console', method: 'log', args: ['warn', 'low memory'] });
            fake.triggerBindingCall({ id: 3, api: 'application', method: 'hide', args: [] });
            fake.triggerBindingCall({ id: 4, api: 'unknown', method: 'nope', args: [] });
            await new Promise((resolve) => setTimeout(resolve, 40));

            expect(fake.resolvedBindings).toContainEqual({ id: 1, ok: true });
            expect(fake.resolvedBindings).toContainEqual({ id: 2, ok: true });
            expect(fake.resolvedBindings).toContainEqual({ id: 3, ok: true });
            expect(fake.resolvedBindings).toContainEqual({
                id: 4,
                ok: false,
                error: { name: 'NotSupportedError', message: 'Unsupported bridge call: unknown.nope' },
            });

            expect(logs).toContain('[app:warn] low memory');
            expect(logs).toContain('[host] application.hide');
            expect(wsMessages.some((msg) => msg.type === 'log' && msg.level === 'warn' && msg.text === 'low memory')).toBe(true);
            expect(
                wsMessages.some(
                    (msg) => msg.type === 'state' && msg.registeredKeys.includes('ColorF0Red') && msg.registeredKeys.includes('Info'),
                ),
            ).toBe(true);

            fake.triggerBindingCall({ id: 5, api: 'application', method: 'exit', args: [] });
            await new Promise((resolve) => setTimeout(resolve, 40));
            expect(fake.resolvedBindings).toContainEqual({ id: 5, ok: true });
            expect(await host.runningApp()).toBeNull();
        } finally {
            ws.close();
            await host.stop();
        }
    });

    it('enforces control endpoint token auth and executes control commands', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-control-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const pngBytes = Buffer.from('89504e470d0a1a0a0000', 'hex');
        const fake = createFakeEngine(pngBytes);

        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            controlToken: 'secret-control-token',
            createEngine: () => fake.engine,
            loadTizenApiScript: async () => null,
        });

        await host.start();
        const runState = await readRunState(home);
        expect(runState).not.toBeNull();
        expect(runState?.token).toBe('secret-control-token');

        const baseUrl = `http://127.0.0.1:${runState!.port}`;
        const unauth = await fetch(`${baseUrl}/control/status`, { method: 'POST' });
        expect(unauth.status).toBe(401);

        const wrongToken = await fetch(`${baseUrl}/control/status`, {
            method: 'POST',
            headers: { authorization: 'Bearer wrong' },
        });
        expect(wrongToken.status).toBe(401);

        const wgtPath = await createSampleWgt(root);
        const authHeaders = {
            'content-type': 'application/json',
            authorization: 'Bearer secret-control-token',
        };

        const installRes = await fetch(`${baseUrl}/control/install`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ wgtPath }),
        });
        expect(installRes.status).toBe(200);

        const launchRes = await fetch(`${baseUrl}/control/launch`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ appId: 'DemoPkg.App' }),
        });
        expect(launchRes.status).toBe(200);

        const keyRes = await fetch(`${baseUrl}/control/key`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ key: 'Enter', action: 'press' }),
        });
        expect(keyRes.status).toBe(200);
        expect(fake.dispatchedKeys).toEqual([{ code: 13, keyName: 'Enter', action: 'press' }]);

        const shotRes = await fetch(`${baseUrl}/control/screenshot`, {
            method: 'POST',
            headers: authHeaders,
            body: '{}',
        });
        const shotJson = (await shotRes.json()) as { ok: boolean; pngBase64: string };
        expect(shotJson.ok).toBe(true);
        expect(Buffer.from(shotJson.pngBase64, 'base64')).toEqual(pngBytes);

        const stopRes = await fetch(`${baseUrl}/control/stop`, {
            method: 'POST',
            headers: authHeaders,
            body: '{}',
        });
        expect(stopRes.status).toBe(200);
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(await readRunState(home)).toBeNull();
    });

    it('detects and replaces stale run.json with dead pid and protects live pid', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-runfile-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        await mkdir(home, { recursive: true });

        await writeFile(
            runFilePath(home),
            JSON.stringify({ port: 45555, pid: 999999, token: 'stale-token' }),
            'utf8',
        );
        expect(await readRunState(home)).toBeNull();

        const fake = createFakeEngine();
        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            createEngine: () => fake.engine,
            loadTizenApiScript: async () => null,
        });
        await host.start();
        const liveState = await readRunState(home);
        expect(liveState?.pid).toBe(process.pid);
        await host.stop();
        expect(await readRunState(home)).toBeNull();

        const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });
        try {
            await writeRunState(home, { port: 45556, pid: child.pid!, token: 'child-token' });
            await expect(writeRunState(home, { port: 45557, pid: process.pid, token: 'other' })).rejects.toThrow(
                /already running/,
            );
        } finally {
            child.kill('SIGKILL');
        }
    });

    it('degrades gracefully when sdb-bridge is missing or its port is busy', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-sdb-'));
        tempDirs.push(root);
        const logs: string[] = [];
        const fake = createFakeEngine();

        const host = createHost({
            home: path.join(root, 'home1'),
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: 26101,
            log: (line) => logs.push(line),
            createEngine: () => fake.engine,
            loadTizenApiScript: async () => null,
            loadSdbBridge: async () => () => ({
                async start(): Promise<{ port: number }> {
                    throw new Error('EADDRINUSE');
                },
                async stop(): Promise<void> {},
            }),
        });

        await host.start();
        expect(logs.some((line) => line.includes('sdb bridge disabled') && line.includes('EADDRINUSE'))).toBe(true);
        await host.stop();
    });

    it('selects 2020 M69 profile by default when resolved, else newest available profile', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-profile-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const pwDir = path.join(root, 'pw-empty');
        const m69Path = await createFakeAppBundle(path.join(root, 'm69'), 'Chromium.app', 'Chromium', '69.0.3497.0');
        const m94Path = await createFakeAppBundle(path.join(root, 'm94'), 'Chromium.app', 'Chromium', '94.0.4606.0');

        const withM69 = await selectDeviceProfile(home, undefined, {
            env: { TVEMU_CHROMIUM_69: m69Path, TVEMU_CHROMIUM_94: m94Path },
            playwrightCacheDir: pwDir,
        });
        expect(withM69.profile.name).toBe('tizen-5.5');
        expect(withM69.reason).toContain('2020');
        expect(withM69.resolved?.exact).toBe(true);

        const withoutM69 = await selectDeviceProfile(home, undefined, {
            env: { TVEMU_CHROMIUM_94: m94Path },
            playwrightCacheDir: pwDir,
        });
        expect(withoutM69.profile.name).toBe('tizen-7.0');
        expect(withoutM69.reason).toContain('newest available');
        expect(withoutM69.resolved?.exact).toBe(true);

        const pwFallbackDir = path.join(root, 'pw-with-153');
        await createFakeAppBundle(
            path.join(pwFallbackDir, 'chromium-1243', 'chrome-mac-arm64'),
            'Google Chrome for Testing.app',
            'Google Chrome for Testing',
            '153.0.8010.12',
        );
        const exactOverPlaywright = await selectDeviceProfile(home, undefined, {
            env: { TVEMU_CHROMIUM_94: m94Path },
            playwrightCacheDir: pwFallbackDir,
        });
        expect(exactOverPlaywright.profile.name).toBe('tizen-7.0');
        expect(exactOverPlaywright.resolved?.exact).toBe(true);

        const approxOnly = await selectDeviceProfile(home, undefined, {
            env: {},
            playwrightCacheDir: pwFallbackDir,
        });
        expect(approxOnly.profile.name).toBe('tizen-10.0');
        expect(approxOnly.resolved?.exact).toBe(false);

        await expect(
            selectDeviceProfile(home, undefined, {
                env: {},
                playwrightCacheDir: pwFallbackDir,
                strictEngine: true,
            }),
        ).rejects.toThrow(/strict-engine/);
    });

    it('applies profile JSON overrides and --set overrides with validation', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-overrides-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        await mkdir(path.join(home, 'profiles'), { recursive: true });
        await writeFile(
            path.join(home, 'profiles', 'tizen-5.5.json'),
            JSON.stringify({
                model: 'CustomEmulator',
                country: 'BR',
                locale: 'pt_BR',
                width: 1280,
                height: 720,
            }),
            'utf8',
        );

        const cliOverrides = parseProfileSetArgs(['model=CliModel', 'cpuThrottle=2']);
        const loaded = await loadDeviceProfile(home, DEFAULT_PROFILES[0]!, cliOverrides);
        expect(loaded.model).toBe('CliModel');
        expect(loaded.country).toBe('BR');
        expect(loaded.locale).toBe('pt_BR');
        expect(loaded.width).toBe(1280);
        expect(loaded.height).toBe(720);
        expect(loaded.cpuThrottle).toBe(2);

        expect(() => parseProfileSetArgs(['missingEquals'])).toThrow(/expected key=value/);
        expect(() => parseProfileSetArgs(['unknownField=x'])).toThrow(/Unknown DeviceProfile field/);
        expect(() => parseProfileSetArgs(['width=abc'])).toThrow(/positive number/);
    });

    it('broadcasts approximate engine warning to remote UI and enforces strictEngine', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-approx-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const pwExec = await createFakeAppBundle(
            path.join(root, 'pw'),
            'Chromium.app',
            'Chromium',
            '153.0.8010.12',
        );
        const logs: string[] = [];

        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[1]!,
            sdbPort: false,
            env: { TVEMU_CHROMIUM_76: pwExec },
            log: (line) => logs.push(line),
            loadTizenApiScript: async () => null,
        });

        await host.start();
        const ws = new WebSocket(host.urls().remote.replace('http://', 'ws://') + 'ws');
        const wsMessages: RemoteUiServerMessage[] = [];
        ws.on('message', (data) => {
            wsMessages.push(JSON.parse(data.toString()) as RemoteUiServerMessage);
        });
        await new Promise<void>((resolve) => ws.once('open', resolve));
        await new Promise((resolve) => setTimeout(resolve, 50));

        try {
            expect(logs.some((line) => line.includes('APPROXIMATE') && line.includes('153.0.8010.12'))).toBe(true);
            expect(
                wsMessages.some(
                    (msg) =>
                        msg.type === 'log' &&
                        msg.level === 'warn' &&
                        msg.text.includes('APPROXIMATE') &&
                        msg.text.includes('153.0.8010.12 instead of M76'),
                ),
            ).toBe(true);
        } finally {
            ws.close();
            await host.stop();
        }

        const strictHost = createHost({
            home: path.join(root, 'home-strict'),
            profile: DEFAULT_PROFILES[1]!,
            sdbPort: false,
            strictEngine: true,
            env: { TVEMU_CHROMIUM_76: pwExec },
            loadTizenApiScript: async () => null,
        });
        await strictHost.start();
        try {
            const wgtPath = await createSampleWgt(root);
            const app = await strictHost.installWgt(wgtPath);
            await expect(strictHost.launch(app.manifest.appId)).rejects.toThrow(/Exact Chromium M76 required/);
        } finally {
            await strictHost.stop();
        }
    });

    it('reports exact vs approximate engines in tvemu profiles and diagnostics in tvemu doctor', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-doctor-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const userHome = path.join(root, 'user-home');
        const binDir = path.join(root, 'bin');
        await mkdir(binDir, { recursive: true });
        await mkdir(path.join(userHome, 'tizen-studio', 'tools'), { recursive: true });

        const pathSdb = path.join(binDir, 'sdb');
        const studioSdb = path.join(userHome, 'tizen-studio', 'tools', 'sdb');
        await writeFile(pathSdb, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        await writeFile(studioSdb, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

        const m69Exec = await createFakeAppBundle(path.join(root, 'm69'), 'Chromium.app', 'Chromium', '69.0.3497.0');
        const m153Exec = await createFakeAppBundle(path.join(root, 'm153'), 'Chromium.app', 'Chromium', '153.0.8010.12');

        const out: string[] = [];
        const err: string[] = [];
        const io = {
            stdout: (line: string) => out.push(line),
            stderr: (line: string) => err.push(line),
        };
        const env: NodeJS.ProcessEnv = {
            PATH: `${binDir}:/usr/bin:/bin`,
            HOME: userHome,
            TVEMU_HOME: home,
            TVEMU_CHROMIUM_69: m69Exec,
            TVEMU_CHROMIUM_76: m153Exec,
        };

        expect(await runCli(['profiles'], io, env)).toBe(0);
        const profilesOutput = out.join('\n');
        expect(profilesOutput).toContain('tizen-5.5');
        expect(profilesOutput).toContain('exact (env: 69.0.3497.0)');
        expect(profilesOutput).toContain('APPROXIMATE (Chromium 153.0.8010.12 instead of M76)');
        expect(profilesOutput).toContain('tizen-10.0');

        out.length = 0;
        expect(await runCli(['doctor'], io, env)).toBe(0);
        const doctorOutput = out.join('\n');
        expect(doctorOutput).toContain(`Node.js: ${process.version}`);
        expect(doctorOutput).toContain(`Arch: ${process.arch}`);
        expect(doctorOutput).toContain('Rosetta 2');
        expect(doctorOutput).toContain(`Home dir: ${home}`);
        expect(doctorOutput).toContain('Port 26101:');
        expect(doctorOutput).toContain(`Samsung sdb (PATH): ${pathSdb}`);
        expect(doctorOutput).toContain(`Samsung sdb (~/tizen-studio/tools/sdb): ${studioSdb}`);
        expect(doctorOutput).toContain('tizen-5.5\tTizen 5.5\tM69\texact');
        expect(doctorOutput).toContain('tizen-6.0\tTizen 6.0\tM76\tAPPROXIMATE (Chromium 153.0.8010.12 instead of M76');
        expect(err).toEqual([]);
    });

    it('supports offline CLI install, list, and uninstall commands', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-cli-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const wgtPath = await createSampleWgt(root, { packageId: 'CliPkg', appId: 'CliPkg.Main' });

        const out: string[] = [];
        const err: string[] = [];
        const io = {
            stdout: (line: string) => out.push(line),
            stderr: (line: string) => err.push(line),
        };
        const env = { ...process.env, TVEMU_HOME: home };

        expect(await runCli(['install', wgtPath], io, env)).toBe(0);
        expect(out.at(-1)).toContain('CliPkg.Main');

        expect(await runCli(['list'], io, env)).toBe(0);
        expect(out.at(-1)).toContain('CliPkg.Main');

        expect(await runCli(['uninstall', 'CliPkg'], io, env)).toBe(0);
        expect(out.at(-1)).toContain('Uninstalled CliPkg');

        expect(await runCli(['list'], io, env)).toBe(0);
        expect(out.at(-1)).toBe('No apps installed.');
        expect(err).toEqual([]);
    });
});
