import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BridgeEvent, BridgeRequest, BridgeResponse } from '@tvemu/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, createChromiumEngine, resolveEngine } from './index.js';

async function tryResolveChromium(): Promise<{ executablePath: string; source: string; version: string } | null> {
    const tempHome = path.join(os.tmpdir(), 'tvemu-integration-probe');
    try {
        return await resolveEngine(69, { home: tempHome });
    } catch {
        return null;
    }
}

const resolved = await tryResolveChromium();
const integrationSuite = resolved ? describe : describe.skip;

integrationSuite('real Chromium engine integration', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('launches headless, injects script before app, dispatches Enter & Back (10009), round-trips bridge, and captures PNG', async () => {
        if (!resolved) {
            return;
        }
        const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'tvemu-browser-'));
        tempDirs.push(userDataDir);

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Integration Test</title></head>
<body>
<button id="focus-target">Focus</button>
<script>
window.__appSawInjectedBeforeApp = Boolean(window.__injectedMarker);
window.__keyEvents = [];
window.__receivedMessages = [];
window.addEventListener('keydown', function (e) {
    window.__keyEvents.push({ type: 'keydown', keyCode: e.keyCode, which: e.which, key: e.key });
});
window.addEventListener('keyup', function (e) {
    window.__keyEvents.push({ type: 'keyup', keyCode: e.keyCode, which: e.which, key: e.key });
});
window.__tvemuReceive = function (json) {
    window.__receivedMessages.push(JSON.parse(json));
};
window.triggerBridge = function () {
    window.__tvemuSend(JSON.stringify({ id: 7, api: 'test', method: 'ping', args: ['pong'] }));
};
</script>
</body>
</html>`;

        const server = createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Unexpected server address');
        }
        const url = `http://127.0.0.1:${address.port}/`;

        const logs: string[] = [];
        const engine = createChromiumEngine({
            executablePath: resolved.executablePath,
            log: (line) => logs.push(line),
        });

        const exitReasons: string[] = [];
        engine.onExit((reason) => exitReasons.push(reason));

        const bindingCalls: BridgeRequest[] = [];
        engine.onBindingCall((msg) => bindingCalls.push(msg));

        const profile = DEFAULT_PROFILES[0]!;

        try {
            await engine.start({
                profile,
                userDataDir,
                injectedScripts: ['window.__injectedMarker = "tvemu-ok";'],
                headless: true,
                scale: 0.5,
            });

            await engine.navigate(url);

            const injectedOrder = await engine.evaluate<boolean>('window.__appSawInjectedBeforeApp');
            expect(injectedOrder).toBe(true);

            const userAgent = await engine.evaluate<string>('navigator.userAgent');
            expect(userAgent).toBe(profile.userAgent);

            const viewport = await engine.evaluate<{ width: number; height: number }>(
                '({ width: window.innerWidth, height: window.innerHeight })',
            );
            expect(viewport).toEqual({ width: 1920, height: 1080 });

            await engine.dispatchKey(13, 'Enter', 'press');
            await engine.dispatchKey(10009, 'Back', 'press');

            const keyEvents = await engine.evaluate<Array<{ type: string; keyCode: number; which: number; key: string }>>(
                'window.__keyEvents',
            );
            const keyDownCodes = keyEvents.filter((event) => event.type === 'keydown').map((event) => event.keyCode);
            expect(keyDownCodes).toContain(13);
            expect(keyDownCodes).toContain(10009);

            await engine.evaluate('console.log("tvemu-console-check"); setTimeout(function () { throw new Error("tvemu-uncaught"); }, 0);');
            await new Promise((resolve) => setTimeout(resolve, 150));
            expect(logs.some((line) => line.includes('[page:log]') && line.includes('tvemu-console-check'))).toBe(true);
            expect(logs.some((line) => line.includes('[page:exception]') && line.includes('tvemu-uncaught'))).toBe(true);

            const usedFallback = logs.some((line) => line.includes('using synthetic KeyboardEvent fallback'));
            console.log(
                `[integration] source=${resolved.source} version=${resolved.version} ` +
                `exact=${resolved.exact} keyFallback=${usedFallback}`,
            );

            await engine.evaluate('window.triggerBridge()');
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(bindingCalls).toEqual([{ id: 7, api: 'test', method: 'ping', args: ['pong'] }]);

            const reply: BridgeResponse = { id: 7, ok: true, result: { echo: 'pong' } };
            const event: BridgeEvent = { event: 'testEvent', payload: { ok: true } };
            await engine.resolveBinding(reply);
            await engine.emitEvent(event);

            const received = await engine.evaluate<unknown[]>('window.__receivedMessages');
            expect(received).toEqual([reply, event]);

            const png = await engine.screenshot();
            expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
            expect(png.length).toBeGreaterThan(1000);
        } finally {
            await engine.stop();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }

        expect(exitReasons.length).toBeGreaterThanOrEqual(1);
    }, 30000);
});
