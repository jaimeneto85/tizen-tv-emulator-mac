import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PROFILES, resolveEngine, type ResolvedEngine } from '@tvemu/engine';
import type { RemoteUiServerMessage } from '@tvemu/protocol';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createHost } from './host.js';

async function tryResolveIntegrationEngine(): Promise<ResolvedEngine | null> {
    const tempHome = path.join(os.tmpdir(), 'tvemu-host-integration-probe');
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

const resolvedEngine = await tryResolveIntegrationEngine();
const integrationSuite = resolvedEngine ? describe : describe.skip;

integrationSuite('real Chromium host integration', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('installs a fixture wgt, launches headless, handles bridge calls, delivers Enter and Back, captures PNG, and terminates', async () => {
        if (!resolvedEngine) {
            return;
        }
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-int-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');

        const configXml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
    id="http://example.com/SmokePkg.App" version="1.0.0">
    <tizen:application id="SmokePkg.App" package="SmokePkg" required_version="5.5"/>
    <access origin="*" subdomains="true"/>
    <content src="index.html"/>
    <name>Smoke Fixture</name>
</widget>`;

        const indexHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>ready</title></head>
<body style="margin:0;background:#102a43;color:#ffffff;font-family:sans-serif;">
<h1>tvemu fixture</h1>
<script>
window.__keyCodes = [];
window.__bridgeReplies = [];
window.__tvemuReceive = function (json) {
    window.__bridgeReplies.push(JSON.parse(json));
};
window.addEventListener('keydown', function (e) {
    window.__keyCodes.push(e.keyCode);
    document.title = 'keys:' + window.__keyCodes.join(',');
});
if (typeof window.__tvemuSend === 'function') {
    window.__tvemuSend(JSON.stringify({ id: 1, api: 'tvinputdevice', method: 'keysChanged', args: [['ColorF0Red']] }));
    window.__tvemuSend(JSON.stringify({ id: 2, api: 'console', method: 'log', args: ['log', 'fixture-ready'] }));
}
</script>
</body>
</html>`;

        const wgtPath = path.join(root, 'fixture.wgt');
        await writeFile(
            wgtPath,
            zipSync({
                'config.xml': strToU8(configXml),
                'index.html': strToU8(indexHtml),
            }),
        );

        const logs: string[] = [];
        const profile = DEFAULT_PROFILES[0]!;
        const host = createHost({
            home,
            profile,
            headless: true,
            scale: 0.5,
            sdbPort: false,
            log: (line) => logs.push(line),
        });

        await host.start();
        try {
            const installed = await host.installWgt(wgtPath);
            expect(installed.manifest.appId).toBe('SmokePkg.App');

            await host.launch(installed.manifest.appId);

            await new Promise((resolve) => setTimeout(resolve, 150));

            const injectedProfileName = await host.evaluate<string>('window.__tvemuProfile && window.__tvemuProfile.name');
            const injectedAppId = await host.evaluate<string>('window.__tvemuManifest && window.__tvemuManifest.appId');
            expect(injectedProfileName).toBe(profile.name);
            expect(injectedAppId).toBe('SmokePkg.App');

            const replies = await host.evaluate<Array<{ id: number; ok: boolean }>>('window.__bridgeReplies');
            expect(replies).toContainEqual({ id: 1, ok: true });
            expect(replies).toContainEqual({ id: 2, ok: true });
            expect(logs).toContain('[app:log] fixture-ready');

            await host.sendKey('Enter');
            await host.sendKey('Back');

            const title = await host.evaluate<string>('document.title');
            expect(title).toBe('keys:13,10009');

            const png = await host.screenshot();
            expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
            expect(png.length).toBeGreaterThan(1000);

            console.log(
                `[host-integration] source=${resolvedEngine.source} version=${resolvedEngine.version} title=${title} pngBytes=${png.length}`,
            );

            await host.terminate(installed.manifest.appId);
            expect(await host.runningApp()).toBeNull();
            const idleTitle = await host.evaluate<string>('document.title');
            expect(idleTitle).toContain(profile.label);
        } finally {
            await host.stop();
        }
    }, 30000);

    it('runs a fixture wgt end-to-end with @tvemu/tizen-api key filtering, productinfo, remote state, and Back exit', async () => {
        if (!resolvedEngine) {
            return;
        }
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-host-e2e-api-'));
        tempDirs.push(root);
        const home = path.join(root, 'home');

        const configXml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
    id="http://example.com/ApiE2ePkg.App" version="1.0.0">
    <tizen:application id="ApiE2ePkg.App" package="ApiE2ePkg" required_version="5.5"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <tizen:privilege name="http://developer.samsung.com/privilege/productinfo"/>
    <access origin="*" subdomains="true"/>
    <content src="index.html"/>
    <name>API E2E Fixture</name>
</widget>`;

        const indexHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>api-e2e</title></head>
<body style="margin:0;background:#0f172a;color:#f8fafc;font-family:sans-serif;">
<h1>api e2e</h1>
<script>
window.__keyCodes = [];
window.__model = webapis.productinfo.getModel();
window.__registerMediaPlayPause = function () {
    tizen.tvinputdevice.registerKey('MediaPlayPause');
};
window.addEventListener('keydown', function (e) {
    window.__keyCodes.push(e.keyCode);
    document.title = 'keys:' + window.__keyCodes.join(',');
    if (e.keyCode === 10009) {
        tizen.application.getCurrentApplication().exit();
    }
});
</script>
</body>
</html>`;

        const wgtPath = path.join(root, 'api-e2e.wgt');
        await writeFile(
            wgtPath,
            zipSync({
                'config.xml': strToU8(configXml),
                'index.html': strToU8(indexHtml),
            }),
        );

        const logs: string[] = [];
        const profile = DEFAULT_PROFILES[0]!;
        const host = createHost({
            home,
            profile,
            headless: true,
            scale: 0.5,
            sdbPort: false,
            log: (line) => logs.push(line),
        });

        await host.start();
        const ws = new WebSocket(host.urls().remote.replace('http://', 'ws://') + 'ws');
        const wsMessages: RemoteUiServerMessage[] = [];
        ws.on('message', (data) => {
            wsMessages.push(JSON.parse(data.toString()) as RemoteUiServerMessage);
        });
        await new Promise<void>((resolve) => ws.once('open', resolve));

        try {
            const installed = await host.installWgt(wgtPath);
            await host.launch(installed.manifest.appId);
            await new Promise((resolve) => setTimeout(resolve, 150));

            const model = await host.evaluate<string>('window.__model');
            expect(model).toBe(profile.model);

            await host.sendKey('MediaPlayPause');
            await host.sendKey('Enter');
            await new Promise((resolve) => setTimeout(resolve, 80));

            const beforeReg = await host.evaluate<number[]>('window.__keyCodes');
            expect(beforeReg).toEqual([13]);

            await host.evaluate<void>('window.__registerMediaPlayPause()');
            await waitForCondition(() =>
                wsMessages.some(
                    (msg) => msg.type === 'state' && msg.registeredKeys.includes('MediaPlayPause'),
                ),
            );

            await host.sendKey('MediaPlayPause');
            await new Promise((resolve) => setTimeout(resolve, 80));

            const afterReg = await host.evaluate<number[]>('window.__keyCodes');
            expect(afterReg).toEqual([13, 10252]);

            await host.sendKey('Back');
            await waitForCondition(async () => (await host.runningApp()) === null);
            await waitForCondition(() =>
                wsMessages.some((msg) => msg.type === 'state' && msg.running === null && msg.registeredKeys.length === 0),
            );

            const idleTitle = await host.evaluate<string>('document.title');
            expect(idleTitle).toContain(profile.label);

            console.log(
                `[host-e2e-api] source=${resolvedEngine.source} version=${resolvedEngine.version} ` +
                `exact=${resolvedEngine.exact} model=${model} beforeReg=${JSON.stringify(beforeReg)} ` +
                `afterReg=${JSON.stringify(afterReg)}`,
            );
        } finally {
            ws.close();
            await host.stop();
        }
    }, 30000);
});
