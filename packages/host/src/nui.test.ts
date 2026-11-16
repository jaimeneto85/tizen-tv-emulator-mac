import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PROFILES, resolveEngine, type ResolvedEngine } from '@tvemu/engine';
import type { Engine, EngineStartOptions, InstalledApp, KeyAction, NuiOp } from '@tvemu/protocol';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';
import { createHost } from './host.js';
import { chunkFrameOps, rewriteLocalUrlsForFrame } from './nui-runtime.js';
import { isProcessAlive } from './run-file.js';

async function tryResolveIntegrationEngine(): Promise<ResolvedEngine | null> {
    const tempHome = path.join(os.tmpdir(), 'tvemu-host-nui-int-probe');
    try {
        return await resolveEngine(69, { home: tempHome });
    } catch {
        return null;
    }
}

async function waitForCondition(
    predicate: () => Promise<boolean> | boolean,
    timeoutMs = 5000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function createFakeEngine(): {
    engine: Engine;
    navigatedUrls: string[];
    evaluatedExpressions: string[];
    triggerBridge: (json: string) => void;
} {
    let bindingListener: ((msg: { id: number; api: string; method: string; args: unknown[] }) => void) | null = null;
    const state = {
        navigatedUrls: [] as string[],
        evaluatedExpressions: [] as string[],
        triggerBridge(json: string): void {
            bindingListener?.(JSON.parse(json) as { id: number; api: string; method: string; args: unknown[] });
        },
        engine: {
            async start(_opts: EngineStartOptions): Promise<void> {},
            async navigate(url: string): Promise<void> {
                state.navigatedUrls.push(url);
            },
            async dispatchKey(_code: number, _keyName: string, _action: KeyAction): Promise<void> {},
            async evaluate<T>(expr: string): Promise<T> {
                state.evaluatedExpressions.push(expr);
                return undefined as T;
            },
            onBindingCall(listener: (msg: { id: number; api: string; method: string; args: unknown[] }) => void): void {
                bindingListener = listener;
            },
            async resolveBinding(): Promise<void> {},
            async emitEvent(): Promise<void> {},
            async screenshot(): Promise<Buffer> {
                return Buffer.alloc(0);
            },
            onExit(): void {},
            async stop(): Promise<void> {},
        } satisfies Engine,
    };
    return state;
}

async function installFakeTpkApp(home: string, packageId = 'org.demo.nui', appId = 'org.demo.nui.app'): Promise<InstalledApp> {
    const installDir = path.join(home, 'apps', packageId);
    const contentDir = path.join(installDir, 'content');
    await mkdir(path.join(contentDir, 'bin'), { recursive: true });
    await writeFile(path.join(contentDir, 'bin', 'Demo.Tv.dll'), 'stub-dll');
    const app: InstalledApp = {
        installDir,
        installedAt: new Date().toISOString(),
        manifest: {
            widgetId: packageId,
            appId,
            packageId,
            name: 'Demo NUI App',
            version: '1.0.0',
            requiredVersion: '11.0',
            contentSrc: 'Demo.Tv.dll',
            icon: null,
            privileges: [],
            features: [],
            contentSecurityPolicy: null,
            accessOrigins: [],
            settings: {},
            profile: 'tv',
            kind: 'tpk',
            exec: 'Demo.Tv.dll',
            appType: 'dotnet-nui',
            apiVersion: '11.0',
        },
    };
    await writeFile(path.join(installDir, 'manifest.json'), JSON.stringify(app, null, 4));
    return app;
}

const FAKE_NUI_SCRIPT = `
import net from 'node:net';
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'inspect') {
    const missing = process.env.FAKE_INSPECT_MISSING ? JSON.parse(process.env.FAKE_INSPECT_MISSING) : [];
    const report = { supported: ['Tizen.NUI.Window::get_Default()'], missing };
    process.stdout.write(JSON.stringify(report));
    process.exit(missing.length > 0 ? 2 : 0);
}

const endpoint = process.env.TVEMU_NUI_ENDPOINT;
const token = process.env.TVEMU_NUI_TOKEN;
const logFile = process.env.FAKE_NUI_LOG;
const pidFile = process.env.FAKE_NUI_PID;
const mode = process.env.FAKE_NUI_MODE || 'normal';

if (pidFile) {
    fs.writeFileSync(pidFile, String(process.pid));
}

function record(entry) {
    if (logFile) {
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\\n');
    }
}

if (mode === 'crash') {
    process.stderr.write('line-1\\nline-2\\nfatal crash detail\\n');
    process.exit(42);
}

const [host, portStr] = endpoint.split(':');
const socket = net.createConnection({ host, port: Number(portStr) }, () => {
    const sentToken = mode === 'bad-token' ? 'wrong-token' : token;
    socket.write(JSON.stringify({ t: 'hello', v: 1, token: sentToken }) + '\\n');
});

let buf = '';
let focused = 1;
socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        record(msg);
        if (msg.t === 'welcome') {
            socket.write(JSON.stringify({ t: 'ready' }) + '\\n');
            socket.write(JSON.stringify({
                t: 'frame',
                ops: [
                    ['window', { bg: [0.08, 0.1, 0.14, 1] }],
                    ['create', 1, 'view'],
                    ['set', 1, { x: 80, y: 80, w: 300, h: 120, bg: [0.2, 0.4, 0.8, 1], borderWidth: 4, borderColor: [1, 1, 0, 1], name: 'box1' }],
                    ['insert', 0, 1, 0],
                    ['create', 2, 'view'],
                    ['set', 2, { x: 420, y: 80, w: 300, h: 120, bg: [0.2, 0.3, 0.4, 1], name: 'box2' }],
                    ['insert', 0, 2, 1],
                    ['create', 3, 'text'],
                    ['set', 3, { x: 80, y: 240, w: 640, h: 60, text: 'initial', textColor: [1, 1, 1, 1], pixelSize: 28, name: 'status' }],
                    ['insert', 0, 3, 2],
                    ['create', 4, 'field'],
                    ['set', 4, { x: 80, y: 330, w: 500, h: 64, bg: [1, 1, 1, 1], textColor: [0, 0, 0, 1], placeholder: 'Type here', pixelSize: 24, name: 'input' }],
                    ['insert', 0, 4, 3],
                    ['focus', 1],
                ],
            }) + '\\n');
        } else if (msg.t === 'key' && msg.state === 'down') {
            if (msg.key === 'ArrowRight') {
                focused = 2;
                socket.write(JSON.stringify({
                    t: 'frame',
                    ops: [
                        ['set', 1, { borderWidth: 0 }],
                        ['set', 2, { borderWidth: 4, borderColor: [1, 1, 0, 1] }],
                        ['focus', 2],
                    ],
                }) + '\\n');
            } else if (msg.key === 'ArrowDown') {
                focused = 4;
                socket.write(JSON.stringify({
                    t: 'frame',
                    ops: [
                        ['focus', 4],
                        ['ime', 4, { panel: 'normal', hidden: false }],
                    ],
                }) + '\\n');
            } else if (msg.key === 'Back') {
                socket.write(JSON.stringify({ t: 'exit', code: 0, reason: 'app-exit' }) + '\\n');
                socket.end(() => process.exit(0));
            }
        } else if (msg.t === 'text') {
            socket.write(JSON.stringify({
                t: 'frame',
                ops: [['set', 3, { text: 'typed:' + msg.value }]],
            }) + '\\n');
        } else if (msg.t === 'lifecycle' && msg.event === 'terminate') {
            if (mode !== 'ignore-terminate') {
                socket.write(JSON.stringify({ t: 'exit', code: 0, reason: 'app-exit' }) + '\\n');
                socket.end(() => process.exit(0));
            }
        }
    }
});

socket.on('close', () => {
    if (mode !== 'ignore-terminate') {
        process.exit(3);
    }
});
`;

describe('NUI host and CLI support', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('rewrites local image URLs inside contentDir and chunks large frames', () => {
        const contentDir = path.join('/tmp', 'apps', 'org.demo', 'content');
        const ops: NuiOp[] = [
            ['set', 1, { url: path.join(contentDir, 'res', 'logo.png') }],
            ['set', 2, { url: 'https://cdn.example/banner.png' }],
            ['set', 3, { url: '/outside/secret.png' }],
        ];
        const rewritten = rewriteLocalUrlsForFrame(ops, contentDir, 'org.demo');
        expect(rewritten[0]).toEqual(['set', 1, { url: '/app/org.demo/res/logo.png' }]);
        expect(rewritten[1]).toEqual(['set', 2, { url: 'https://cdn.example/banner.png' }]);
        expect(rewritten[2]).toEqual(['set', 3, { url: '/outside/secret.png' }]);

        const manyOps: NuiOp[] = [];
        for (let i = 1; i <= 50; i++) {
            manyOps.push(['set', i, { text: 'x'.repeat(200) }]);
        }
        const chunks = chunkFrameOps(manyOps, 2000);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.flat()).toEqual(manyOps);
    });

    it('fails with exact build hint when Tvemu.NuiHost.dll is missing', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-nui-missing-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        await installFakeTpkApp(home);
        const fakeEngine = createFakeEngine();

        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            env: { ...process.env, TVEMU_NUI_HOST: path.join(root, 'missing', 'Tvemu.NuiHost.dll') },
            createEngine: () => fakeEngine.engine,
        });
        await host.start();
        try {
            await expect(host.launch('org.demo.nui.app')).rejects.toThrow(
                'run: dotnet build dotnet/Tvemu.sln -c Release',
            );
        } finally {
            await host.stop();
        }
    });

    it('reports dotnet, NUI runtime, app kind in list, and runs tvemu inspect', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-nui-cli-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fakeScript = path.join(root, 'fake-nui.mjs');
        await writeFile(fakeScript, FAKE_NUI_SCRIPT);
        await installFakeTpkApp(home);

        const out: string[] = [];
        const err: string[] = [];
        const io = {
            stdout: (line: string) => out.push(line),
            stderr: (line: string) => err.push(line),
        };
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            TVEMU_HOME: home,
            TVEMU_NUI_COMMAND: process.execPath,
            TVEMU_NUI_HOST: fakeScript,
        };

        expect(await runCli(['list'], io, env)).toBe(0);
        expect(out.at(-1)).toContain('tpk\torg.demo.nui.app\torg.demo.nui');

        out.length = 0;
        expect(await runCli(['doctor'], io, env)).toBe(0);
        const doctorText = out.join('\n');
        expect(doctorText).toContain(`dotnet: ${process.version}`);
        expect(doctorText).toContain(`NUI runtime: built (${fakeScript})`);

        out.length = 0;
        expect(await runCli(['inspect', 'org.demo.nui.app'], io, env)).toBe(0);
        expect(out.join('\n')).toContain('Supported: 1');

        out.length = 0;
        const exitWithMissing = await runCli(['inspect', 'org.demo.nui.app'], io, {
            ...env,
            FAKE_INSPECT_MISSING: JSON.stringify(['Tizen.NUI.Missing::Foo()']),
        });
        expect(exitWithMissing).toBe(2);
        expect(out.join('\n')).toContain('Missing: 1');
        expect(out.join('\n')).toContain('Tizen.NUI.Missing::Foo()');

        const tpkFile = path.join(root, 'sample.tpk');
        const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns="http://tizen.org/ns/packages" package="org.file.inspect" version="1.0.0" api-version="11.0">
    <profile name="tv"/>
    <ui-application appid="org.file.inspect.app" exec="FileApp.dll" type="dotnet-nui">
        <label>File Inspect</label>
    </ui-application>
</manifest>`;
        await writeFile(tpkFile, zipSync({
            'tizen-manifest.xml': strToU8(manifestXml),
            'bin/FileApp.dll': strToU8('dll'),
        }));
        out.length = 0;
        expect(await runCli(['inspect', tpkFile], io, env)).toBe(0);
        expect(out.join('\n')).toContain('Package: org.file.inspect (org.file.inspect.app)');
        expect(err).toEqual([]);
    });

    it('logs crash stderr tail and kills stubborn runtime on stop()', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-nui-crash-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fakeScript = path.join(root, 'fake-nui.mjs');
        await writeFile(fakeScript, FAKE_NUI_SCRIPT);
        await installFakeTpkApp(home);

        const logs: string[] = [];
        const fakeEngine = createFakeEngine();
        const crashHost = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            env: {
                ...process.env,
                TVEMU_NUI_COMMAND: process.execPath,
                TVEMU_NUI_HOST: fakeScript,
                FAKE_NUI_MODE: 'crash',
            },
            log: (line) => logs.push(line),
            createEngine: () => fakeEngine.engine,
        });

        await crashHost.start();
        try {
            await crashHost.launch('org.demo.nui.app');
            await waitForCondition(async () => (await crashHost.runningApp()) === null);
            expect(logs.some((line) => line.includes('fatal crash detail'))).toBe(true);
            expect(logs.some((line) => line.includes('code=42'))).toBe(true);
        } finally {
            await crashHost.stop();
        }
    });

    it('kills stubborn NUI child on host.stop() without leaving an orphan process', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-nui-orphan-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fakeScript = path.join(root, 'fake-nui.mjs');
        const pidFile = path.join(root, 'runtime.pid');
        await writeFile(fakeScript, FAKE_NUI_SCRIPT);
        await installFakeTpkApp(home);

        const fakeEngine = createFakeEngine();
        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            env: {
                ...process.env,
                TVEMU_NUI_COMMAND: process.execPath,
                TVEMU_NUI_HOST: fakeScript,
                FAKE_NUI_PID: pidFile,
                FAKE_NUI_MODE: 'ignore-terminate',
            },
            createEngine: () => fakeEngine.engine,
        });

        await host.start();
        let pid = 0;
        try {
            await host.launch('org.demo.nui.app');
            await waitForCondition(async () => {
                try {
                    const text = await readFile(pidFile, 'utf8');
                    pid = Number(text.trim());
                    return Number.isInteger(pid) && pid > 0;
                } catch {
                    return false;
                }
            });
            expect(isProcessAlive(pid)).toBe(true);
        } finally {
            await host.stop();
        }
        expect(isProcessAlive(pid)).toBe(false);
    });

    it('keeps a single runtime alive when two launches overlap', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-nui-overlap-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fakeScript = path.join(root, 'fake-nui.mjs');
        await writeFile(fakeScript, FAKE_NUI_SCRIPT);
        await installFakeTpkApp(home);
        const runtimePids = (): number[] => {
            const found = spawnSync('pgrep', ['-f', fakeScript], { encoding: 'utf8' });
            return found.stdout.split('\n').filter(Boolean).map(Number);
        };

        const fakeEngine = createFakeEngine();
        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            sdbPort: false,
            env: { ...process.env, TVEMU_NUI_COMMAND: process.execPath, TVEMU_NUI_HOST: fakeScript },
            createEngine: () => fakeEngine.engine,
        });

        await host.start();
        try {
            await Promise.all([host.launch('org.demo.nui.app'), host.launch('org.demo.nui.app')]);
            await waitForCondition(async () => runtimePids().length === 1);
            expect(runtimePids()).toHaveLength(1);
        } finally {
            await host.stop();
        }
        await waitForCondition(async () => runtimePids().length === 0);
        expect(runtimePids()).toHaveLength(0);
    });
});

const resolvedEngine = await tryResolveIntegrationEngine();
const integrationSuite = resolvedEngine ? describe : describe.skip;

integrationSuite('real Chromium + fake NUI runtime integration', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('renders NUI frames in Chromium, delivers tvemu key and typed text, and exits cleanly with no orphan process', async () => {
        if (!resolvedEngine) {
            return;
        }
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-nui-e2e-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');
        const fakeScript = path.join(root, 'fake-nui.mjs');
        const logFile = path.join(root, 'runtime-events.jsonl');
        const pidFile = path.join(root, 'runtime.pid');
        await writeFile(fakeScript, FAKE_NUI_SCRIPT);
        await installFakeTpkApp(home);

        const logs: string[] = [];
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            TVEMU_HOME: home,
            TVEMU_NUI_COMMAND: process.execPath,
            TVEMU_NUI_HOST: fakeScript,
            FAKE_NUI_LOG: logFile,
            FAKE_NUI_PID: pidFile,
            FAKE_INSPECT_MISSING: JSON.stringify(['Tizen.NUI.Unused::Stub()']),
        };

        const host = createHost({
            home,
            profile: DEFAULT_PROFILES[0]!,
            headless: true,
            scale: 0.5,
            sdbPort: false,
            env,
            log: (line) => logs.push(line),
        });

        await host.start();
        let runtimePid: number | null = null;
        try {
            await host.launch('org.demo.nui.app');

            await waitForCondition(async () => {
                const snap = await host.evaluate<{ nodeCount: number; focusedId: number } | null>(
                    'window.__tvemuNui ? window.__tvemuNui.debug() : null',
                );
                return Boolean(snap && snap.nodeCount === 4 && snap.focusedId === 1);
            });
            runtimePid = Number((await readFile(pidFile, 'utf8')).trim());

            expect(logs.some((line) => line.includes('Missing NUI API: Tizen.NUI.Unused::Stub()'))).toBe(true);

            const cliOut: string[] = [];
            const cliErr: string[] = [];
            expect(
                await runCli(['key', 'ArrowRight'], {
                    stdout: (l) => cliOut.push(l),
                    stderr: (l) => cliErr.push(l),
                }, env),
            ).toBe(0);
            expect(cliErr).toEqual([]);

            await waitForCondition(async () => {
                const snap = await host.evaluate<{ focusedId: number }>('window.__tvemuNui.debug()');
                return snap.focusedId === 2;
            });

            await host.sendKey('ArrowDown');
            await waitForCondition(async () => {
                return await host.evaluate<boolean>(
                    'Boolean(document.activeElement && document.activeElement.tagName === "INPUT")',
                );
            });

            await host.evaluate<void>(`
                (function () {
                    var el = document.activeElement;
                    el.value = 'hello-tv';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                })();
            `);

            await waitForCondition(async () => {
                const snap = await host.evaluate<{ nodes: Array<{ id: number; text?: string }> }>(
                    'window.__tvemuNui.debug()',
                );
                return snap.nodes.find((n) => n.id === 3)?.text === 'typed:hello-tv';
            });

            const recorded = await readFile(logFile, 'utf8');
            expect(recorded).toContain('"t":"key"');
            expect(recorded).toContain('"key":"ArrowRight"');
            expect(recorded).toContain('"t":"text"');
            expect(recorded).toContain('"value":"hello-tv"');

            expect((await host.uiSnapshot()).keyboard).toBe('q');
            await host.sendKey('Back');
            await waitForCondition(async () => (await host.uiSnapshot()).keyboard === null);
            expect(await host.runningApp()).not.toBeNull();

            expect(
                await runCli(['key', 'Back'], {
                    stdout: (l) => cliOut.push(l),
                    stderr: (l) => cliErr.push(l),
                }, env),
            ).toBe(0);

            await waitForCondition(async () => (await host.runningApp()) === null);
            const idleTitle = await host.evaluate<string>('document.title');
            expect(idleTitle).toContain(DEFAULT_PROFILES[0]!.label);
        } finally {
            await host.stop();
        }

        if (runtimePid !== null) {
            expect(isProcessAlive(runtimePid)).toBe(false);
        }
    }, 30000);
});
