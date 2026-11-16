import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arrowKeysToward, buildTypeExpression, findFocusTargets, formatUiSnapshot, isFocusOn, snapshotContainsText, snapshotFocusContains, type UiSnapshot } from './agent.js';
import { chooseVideoBackend, createNativeVideo, resolveVideoPlaneHelper } from './native-video.js';
import { applyOriginMap, parseOriginMap } from './nui-runtime.js';

const rect = { x: 10, y: 20, w: 300, h: 40 };
const snapshot: UiSnapshot = {
    url: 'http://127.0.0.1:1/nui/',
    title: 'Sample',
    screen: { w: 1920, h: 1080 },
    focus: { kind: 'view', text: 'Play video', rect },
    editing: false,
    keyboard: null,
    texts: [
        { text: 'Play video', rect, focused: true },
        { text: 'Settings', rect, focused: false },
    ],
    fields: [{ label: 'E-mail', value: 'someone@example.com', type: 'email', rect, focused: false, editing: false }],
    images: [{ src: 'http://127.0.0.1:1/cover.png', rect, loaded: false }],
    videos: [{ src: 'http://127.0.0.1:1/clip.mp4', rect, paused: false, ended: false, positionMs: 1500, durationMs: 8000, readyState: 4, error: null }],
};

describe('agent screen description', () => {
    it('marks the focused entry and reports fields, images and videos', () => {
        const text = formatUiSnapshot(snapshot);
        expect(text).toContain('focus: view "Play video"');
        expect(text).toMatch(/^> Play video/m);
        expect(text).toMatch(/^ {2}Settings/m);
        expect(text).toContain('E-mail: "someone@example.com"');
        expect(text).toContain('cover.png');
        expect(text).toContain('clip.mp4');
    });

    it('reports the on-screen keyboard only while it is open', () => {
        expect(formatUiSnapshot(snapshot)).not.toContain('keyboard:');
        expect(formatUiSnapshot({ ...snapshot, keyboard: 'q' })).toContain('keyboard: open, highlighted key "q"');
    });

    it('matches text and focus without regard to case', () => {
        expect(snapshotContainsText(snapshot, 'settings')).toBe(true);
        expect(snapshotContainsText(snapshot, 'SOMEONE@')).toBe(true);
        expect(snapshotContainsText(snapshot, 'missing')).toBe(false);
        expect(snapshotFocusContains(snapshot, 'play')).toBe(true);
        expect(snapshotFocusContains({ ...snapshot, focus: null }, 'play')).toBe(false);
    });

    it('embeds typed text as data, never as code', () => {
        const expression = buildTypeExpression('"); alert(1); ("', 'replace');
        expect(expression).toContain(JSON.stringify('"); alert(1); ("'));
        expect(() => new Function(`return ${expression}`)).not.toThrow();
    });
});

describe('focus navigation planning', () => {
    const at = (x: number, y: number) => ({ x, y, w: 200, h: 60 });
    const screen: UiSnapshot = {
        ...snapshot,
        focus: { kind: 'view', text: 'Home', rect: at(100, 300) },
        texts: [
            { text: 'Library', rect: at(100, 20), focused: false },
            { text: 'Home', rect: at(100, 300), focused: true },
            { text: 'Library', rect: at(900, 300), focused: false },
            { text: 'Library settings', rect: at(100, 800), focused: false },
        ],
        fields: [],
    };

    it('prefers exact matches and tries later elements before headings', () => {
        expect(findFocusTargets(screen, 'library')).toEqual([at(900, 300), at(100, 20)]);
        expect(findFocusTargets(screen, 'settings')).toEqual([at(100, 800)]);
        expect(findFocusTargets(screen, 'absent')).toEqual([]);
    });

    it('heads along the dominant axis first and keeps the other directions as fallbacks', () => {
        expect(arrowKeysToward(screen, at(900, 300))).toEqual(['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']);
        expect(arrowKeysToward(screen, at(100, 800))).toEqual(['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp']);
        expect(arrowKeysToward(screen, at(100, 20))[0]).toBe('ArrowUp');
    });

    it('knows when the focus already covers the target', () => {
        expect(isFocusOn(screen, at(100, 300))).toBe(true);
        expect(isFocusOn(screen, at(900, 300))).toBe(false);
    });
});

describe('origin map', () => {
    it('routes a mapped origin to loopback and leaves the rest alone', () => {
        const map = parseOriginMap('https://api.example.com=http://127.0.0.1:4000; https://cdn.example.com=http://localhost:4001');
        expect(applyOriginMap('https://api.example.com/v1/items?page=2', map)).toBe('http://127.0.0.1:4000/v1/items?page=2');
        expect(applyOriginMap('https://cdn.example.com/a b.png', map)).toBe('http://localhost:4001/a b.png');
        expect(applyOriginMap('https://other.example.com/x', map)).toBe('https://other.example.com/x');
        expect(applyOriginMap('/app/pkg/res/a.png', map)).toBe('/app/pkg/res/a.png');
    });

    it('refuses targets that are not loopback and malformed entries', () => {
        expect(() => parseOriginMap('https://api.example.com=https://evil.example.org')).toThrow(/map-origin/);
        expect(() => parseOriginMap('nonsense')).toThrow(/map-origin/);
        expect(parseOriginMap(undefined)).toEqual([]);
    });
});

describe('video backend choice', () => {
    it('uses the browser without a helper or when asked to', () => {
        expect(chooseVideoBackend('https://example.com/a.mp4', null, {})).toBe('browser');
        expect(chooseVideoBackend('https://example.com/a.mp4', '/helper', { TVEMU_VIDEO: 'browser' })).toBe('browser');
    });

    it('sends formats Chromium cannot decode to the native plane', () => {
        expect(chooseVideoBackend('https://example.com/a.mp4', '/helper', {})).toBe('native');
        expect(chooseVideoBackend('https://example.com/live.m3u8?token=1', '/helper', {})).toBe('native');
        expect(chooseVideoBackend('https://example.com/a.webm', '/helper', {})).toBe('browser');
        expect(chooseVideoBackend('https://example.com/a.webm', '/helper', { TVEMU_VIDEO: 'native' })).toBe('native');
    });

    const helper = resolveVideoPlaneHelper();
    it.skipIf(!helper)('reports an error event for media that cannot be opened', async () => {
        const events: string[] = [];
        const video = createNativeVideo({
            helperPath: helper!,
            muted: true,
            log: () => {},
            onFrame: () => {},
            onEvent: (message) => events.push(message.event),
        });
        video.open(1, 'http://127.0.0.1:9/missing.mp4');
        video.handle({ t: 'player', id: 1, op: 'prepare' });
        await expect.poll(() => events, { timeout: 15000 }).toContain('error');
        expect(video.states()[0]?.error).toBeTruthy();
        video.dispose();
        expect(video.states()).toEqual([]);
    }, 20000);
});

describe('mcp server', () => {
    const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

    it.skipIf(!existsSync(cli))('answers initialize, tools/list and a tool call over stdio', async () => {
        const home = await mkdtemp(path.join(os.tmpdir(), 'tvemu-mcp-'));
        const child = spawn(process.execPath, [cli, 'mcp'], { env: { ...process.env, TVEMU_HOME: home }, stdio: ['pipe', 'pipe', 'ignore'] });
        const replies: Array<{ id: number; result?: any; error?: any }> = [];
        let buffer = '';
        child.stdout.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
            const parts = buffer.split('\n');
            buffer = parts.pop() ?? '';
            for (const part of parts) {
                if (part.trim()) replies.push(JSON.parse(part));
            }
        });
        const request = (id: number, method: string, params: Record<string, unknown> = {}): void => {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        };
        try {
            request(1, 'initialize', { protocolVersion: '2024-11-05' });
            request(2, 'tools/list');
            request(3, 'tools/call', { name: 'tv_status', arguments: {} });
            request(4, 'tools/call', { name: 'tv_key', arguments: { keys: ['Enter'] } });
            request(5, 'tools/call', { name: 'nope', arguments: {} });
            await expect.poll(() => replies.length, { timeout: 10000 }).toBe(5);
            const byId = new Map(replies.map((reply) => [reply.id, reply]));
            expect(byId.get(1)?.result.serverInfo.name).toBe('tvemu');
            const names = byId.get(2)?.result.tools.map((tool: { name: string }) => tool.name);
            expect(names).toEqual(expect.arrayContaining(['tv_start', 'tv_key', 'tv_type', 'tv_screen', 'tv_wait', 'tv_screenshot', 'tv_logs', 'tv_stop']));
            expect(byId.get(3)?.result.content[0].text).toMatch(/not running/i);
            expect(byId.get(4)?.result.isError).toBe(true);
            expect(byId.get(5)?.error.code).toBe(-32602);
        } finally {
            child.kill();
            await rm(home, { recursive: true, force: true });
        }
    }, 20000);
});
