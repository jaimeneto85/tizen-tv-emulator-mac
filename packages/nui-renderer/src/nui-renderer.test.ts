import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import type { NuiHostMessage } from '@tvemu/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nuiRendererAssetsDir } from './index.js';
import type { NuiDebugSnapshot } from './browser/nui-renderer.js';

interface Harness {
    window: JSDOM['window'] & {
        __tvemuNui: {
            apply: (json: string) => void;
            debug: () => NuiDebugSnapshot;
            destroy: () => void;
        };
        __tvemuSend: (json: string) => void;
        Hls?: unknown;
    };
    document: Document;
    events: NuiHostMessage[];
    applyFrame: (ops: unknown[]) => void;
    applyPlayer: (msg: Record<string, unknown>) => void;
    dispatchKey: (type: 'keydown' | 'keyup', keyCode: number, key: string) => KeyboardEvent;
}

function loadRenderer(options?: { hls?: unknown }): Harness {
    const assetsDir = nuiRendererAssetsDir();
    const html = readFileSync(path.join(assetsDir, 'index.html'), 'utf8');
    const script = readFileSync(path.join(assetsDir, 'nui-renderer.js'), 'utf8');
    const dom = new JSDOM(html, {
        url: 'http://127.0.0.1:8080/nui/',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
    });
    const win = dom.window as unknown as Harness['window'];
    const events: NuiHostMessage[] = [];
    win.__tvemuSend = (json: string) => {
        const parsed = JSON.parse(json) as { api: string; method: string; args: [NuiHostMessage] };
        if (parsed.api === 'nui' && parsed.method === 'event' && parsed.args[0]) {
            events.push(parsed.args[0]);
        }
    };
    if (options?.hls) {
        win.Hls = options.hls;
    }
    win.eval(script);
    return {
        window: win,
        document: win.document,
        events,
        applyFrame: (ops) => win.__tvemuNui.apply(JSON.stringify({ t: 'frame', ops })),
        applyPlayer: (msg) => win.__tvemuNui.apply(JSON.stringify({ t: 'player', ...msg })),
        dispatchKey: (type, keyCode, key) => {
            const event = new win.KeyboardEvent(type, { key, bubbles: true, cancelable: true });
            Object.defineProperty(event, 'keyCode', { get: () => keyCode });
            Object.defineProperty(event, 'which', { get: () => keyCode });
            win.dispatchEvent(event);
            return event;
        },
    };
}

describe('nui-renderer bundle in jsdom', () => {
    const cleanups: Array<() => void> = [];

    afterEach(() => {
        vi.useRealTimers();
        while (cleanups.length > 0) {
            cleanups.pop()?.();
        }
    });

    it('resolves built assets directory', () => {
        expect(nuiRendererAssetsDir().endsWith(path.join('packages', 'nui-renderer', 'dist', 'public'))).toBe(true);
    });

    it('applies scene ops, DOM ordering, CSS properties, text layout, and debug snapshot', () => {
        const h = loadRenderer();
        cleanups.push(() => h.window.__tvemuNui.destroy());

        h.applyFrame([
            ['window', { bg: [0.1, 0.2, 0.3, 1] }],
            ['create', 1, 'view'],
            ['set', 1, {
                x: 100,
                y: 50,
                w: 400,
                h: 200,
                bg: [1, 0, 0, 0.5],
                opacity: 0.8,
                scale: [1.5, 2],
                pivot: [0, 0],
                radius: [8, 12, 16, 4],
                borderWidth: 4,
                borderColor: [0, 1, 0, 1],
                clip: true,
                visible: true,
                name: 'card',
            }],
            ['insert', 0, 1, 0],
            ['create', 2, 'text'],
            ['set', 2, {
                x: 10,
                y: 20,
                w: 300,
                h: 60,
                text: 'Hello TV',
                textColor: [1, 1, 1, 1],
                pixelSize: 28,
                multiline: false,
                hAlign: 'center',
                vAlign: 'bottom',
                ellipsis: true,
                fontFamily: 'TizenSans',
                fontWeight: 'bold',
                fontStyle: 'italic',
                lineSpacing: 6,
            }],
            ['create', 3, 'view'],
            ['set', 3, { x: 0, y: 0, w: 50, h: 50, visible: false }],
            ['insert', 1, 2, 0],
            ['insert', 1, 3, 0],
            ['focus', 2],
        ]);

        const stage = h.document.getElementById('tvemu-nui-stage')!;
        expect(stage.style.backgroundColor).toBe('rgb(26, 51, 77)');

        const viewEl = stage.querySelector<HTMLElement>('[data-nui-id="1"]')!;
        expect(viewEl.style.left).toBe('100px');
        expect(viewEl.style.top).toBe('50px');
        expect(viewEl.style.width).toBe('400px');
        expect(viewEl.style.height).toBe('200px');
        expect(viewEl.style.backgroundColor).toBe('rgba(255, 0, 0, 0.5)');
        expect(viewEl.style.opacity).toBe('0.8');
        expect(viewEl.style.transformOrigin).toBe('0% 0%');
        expect(viewEl.style.transform).toBe('scale(1.5, 2)');
        expect(viewEl.style.borderRadius).toBe('8px 12px 16px 4px');
        expect(viewEl.style.boxShadow).toContain('4px');
        expect(viewEl.style.boxShadow).toContain('inset');
        expect(viewEl.style.overflow).toBe('hidden');
        expect(viewEl.getAttribute('data-name')).toBe('card');

        expect(viewEl.children[0]?.getAttribute('data-nui-id')).toBe('3');
        expect(viewEl.children[1]?.getAttribute('data-nui-id')).toBe('2');

        const textEl = viewEl.children[1] as HTMLElement;
        const span = textEl.querySelector('span')!;
        expect(span.textContent).toBe('Hello TV');
        expect(span.style.whiteSpace).toBe('nowrap');
        expect(span.style.textOverflow).toBe('ellipsis');
        expect(span.style.textAlign).toBe('center');
        expect(textEl.style.alignItems).toBe('flex-end');
        expect(textEl.style.fontSize).toBe('28px');

        const hiddenEl = viewEl.children[0] as HTMLElement;
        expect(hiddenEl.style.display).toBe('none');

        const snap = h.window.__tvemuNui.debug();
        expect(snap.nodeCount).toBe(3);
        expect(snap.focusedId).toBe(2);
        expect(snap.nodes.find((n) => n.id === 2)?.text).toBe('Hello TV');

        h.applyFrame([['detach', 3]]);
        expect(viewEl.children).toHaveLength(1);
        expect(h.window.__tvemuNui.debug().nodeCount).toBe(3);

        h.applyFrame([['destroy', 2]]);
        expect(h.window.__tvemuNui.debug().nodeCount).toBe(2);
        expect(h.window.__tvemuNui.debug().focusedId).toBe(0);
    });

    it('reports image ready/failed with natural dimensions and measures null-sized nodes', () => {
        const h = loadRenderer();
        cleanups.push(() => h.window.__tvemuNui.destroy());

        h.applyFrame([
            ['create', 10, 'image'],
            ['set', 10, { x: 10, y: 10, w: null, h: null, fitting: 'contain', url: 'http://127.0.0.1/logo.png' }],
            ['insert', 0, 10, 0],
            ['create', 11, 'text'],
            ['set', 11, { x: 0, y: 0, w: null, h: null, text: 'Measure me', multiline: true }],
            ['insert', 0, 11, 1],
        ]);

        const n11 = h.document.querySelector<HTMLElement>('[data-nui-id="11"]')!;
        n11.getBoundingClientRect = () => ({
            width: 245.2,
            height: 36.1,
            top: 0,
            left: 0,
            bottom: 36.1,
            right: 245.2,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        h.applyFrame([['set', 11, { text: 'Measure me now' }]]);

        expect(h.events).toContainEqual({ t: 'measure', id: 11, w: 246, h: 37 });

        const imgNode = h.document.querySelector<HTMLElement>('[data-nui-id="10"]')!;
        const img = imgNode.querySelector('img')!;
        expect(img.style.objectFit).toBe('contain');
        Object.defineProperty(img, 'naturalWidth', { value: 320, configurable: true });
        Object.defineProperty(img, 'naturalHeight', { value: 180, configurable: true });
        img.dispatchEvent(new h.window.Event('load'));

        expect(h.events).toContainEqual({ t: 'image', id: 10, status: 'ready', w: 320, h: 180 });
        expect(h.events).toContainEqual({ t: 'measure', id: 10, w: 320, h: 180 });

        img.dispatchEvent(new h.window.Event('error'));
        expect(h.events).toContainEqual({ t: 'image', id: 10, status: 'failed', w: 0, h: 0 });
    });

    it('handles field ime, text input events, and input-aware key forwarding', () => {
        const h = loadRenderer();
        cleanups.push(() => h.window.__tvemuNui.destroy());

        h.applyFrame([
            ['create', 5, 'field'],
            ['set', 5, { x: 20, y: 20, w: 300, h: 50, placeholder: 'Email', hidden: true, maxLength: 32 }],
            ['insert', 0, 5, 0],
        ]);

        const input = h.document.querySelector<HTMLInputElement>('[data-nui-id="5"] input')!;
        expect(input.type).toBe('password');
        expect(input.placeholder).toBe('Email');
        expect(input.maxLength).toBe(32);

        const navBeforeFocus = h.dispatchKey('keydown', 37, 'ArrowLeft');
        expect(navBeforeFocus.defaultPrevented).toBe(true);
        h.dispatchKey('keyup', 37, 'ArrowLeft');
        expect(h.events).toEqual([
            { t: 'key', state: 'down', key: 'ArrowLeft', code: 37 },
            { t: 'key', state: 'up', key: 'ArrowLeft', code: 37 },
        ]);

        h.events.length = 0;
        h.applyFrame([['ime', 5, { panel: 'email', hidden: false }]]);
        expect(h.document.activeElement).toBe(input);
        expect(input.type).toBe('email');

        const digitEvent = h.dispatchKey('keydown', 48, '0');
        expect(digitEvent.defaultPrevented).toBe(false);
        h.dispatchKey('keyup', 48, '0');

        const emptyLeft = h.dispatchKey('keydown', 37, 'ArrowLeft');
        expect(emptyLeft.defaultPrevented).toBe(true);
        h.dispatchKey('keyup', 37, 'ArrowLeft');
        expect(h.events).toEqual([
            { t: 'key', state: 'down', key: 'ArrowLeft', code: 37 },
            { t: 'key', state: 'up', key: 'ArrowLeft', code: 37 },
        ]);

        h.events.length = 0;
        input.value = 'abc';
        input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
        expect(h.events).toEqual([{ t: 'text', id: 5, value: 'abc' }]);

        h.events.length = 0;
        const nonEmptyLeft = h.dispatchKey('keydown', 37, 'ArrowLeft');
        expect(nonEmptyLeft.defaultPrevented).toBe(false);
        h.dispatchKey('keyup', 37, 'ArrowLeft');
        const backspace = h.dispatchKey('keydown', 8, 'Backspace');
        expect(backspace.defaultPrevented).toBe(false);
        h.dispatchKey('keyup', 8, 'Backspace');
        expect(h.events).toEqual([]);

        const downKey = h.dispatchKey('keydown', 40, 'ArrowDown');
        expect(downKey.defaultPrevented).toBe(true);
        h.dispatchKey('keyup', 40, 'ArrowDown');
        const enterKey = h.dispatchKey('keydown', 13, 'Enter');
        expect(enterKey.defaultPrevented).toBe(true);
        h.dispatchKey('keyup', 13, 'Enter');
        const backKey = h.dispatchKey('keydown', 10009, 'Back');
        expect(backKey.defaultPrevented).toBe(true);
        h.dispatchKey('keyup', 10009, 'Back');

        expect(h.events).toEqual([
            { t: 'key', state: 'down', key: 'ArrowDown', code: 40 },
            { t: 'key', state: 'up', key: 'ArrowDown', code: 40 },
            { t: 'key', state: 'down', key: 'Enter', code: 13 },
            { t: 'key', state: 'up', key: 'Enter', code: 13 },
            { t: 'key', state: 'down', key: 'Back', code: 10009 },
            { t: 'key', state: 'up', key: 'Back', code: 10009 },
        ]);

        h.applyFrame([['ime', 0, {}]]);
        expect(h.document.activeElement).not.toBe(input);
    });

    it('manages underlay video player lifecycle, time ticks, and HLS fallback', () => {
        vi.useFakeTimers();
        const h = loadRenderer();
        cleanups.push(() => h.window.__tvemuNui.destroy());

        h.applyPlayer({ id: 7, op: 'open', url: 'https://cdn.example/video.mp4' });
        h.applyPlayer({ id: 7, op: 'display', mode: 'window' });

        const underlay = h.document.getElementById('tvemu-nui-underlay')!;
        const video = underlay.querySelector<HTMLVideoElement>('video[data-nui-player-id="7"]')!;
        expect(video).toBeTruthy();
        expect(video.style.display).toBe('block');
        expect(video.src).toBe('https://cdn.example/video.mp4');

        let currentTimeValue = 1.5;
        Object.defineProperty(video, 'duration', { get: () => 120, configurable: true });
        Object.defineProperty(video, 'currentTime', {
            get: () => currentTimeValue,
            set: (val: number) => {
                currentTimeValue = val;
            },
            configurable: true,
        });
        video.play = vi.fn(async () => {
            video.dispatchEvent(new h.window.Event('playing'));
        });
        video.pause = vi.fn(() => {
            video.dispatchEvent(new h.window.Event('pause'));
        });
        video.load = vi.fn();

        h.applyPlayer({ id: 7, op: 'prepare' });
        video.dispatchEvent(new h.window.Event('loadedmetadata'));
        h.applyPlayer({ id: 7, op: 'start' });
        expect(video.play).toHaveBeenCalledTimes(1);

        return Promise.resolve().then(() => {
            currentTimeValue = 2.0;
            vi.advanceTimersByTime(520);
            h.applyPlayer({ id: 7, op: 'seek', ms: 30000 });
            video.dispatchEvent(new h.window.Event('seeked'));
            h.applyPlayer({ id: 7, op: 'volume', value: 0.4 });
            h.applyPlayer({ id: 7, op: 'mute', value: true });
            h.applyPlayer({ id: 7, op: 'rate', value: 1.5 });
            h.applyPlayer({ id: 7, op: 'pause' });
            video.dispatchEvent(new h.window.Event('ended'));

            expect(video.volume).toBe(0.4);
            expect(video.muted).toBe(true);
            expect(video.playbackRate).toBe(1.5);
            expect(h.events).toContainEqual({ t: 'player', id: 7, event: 'prepared', positionMs: 1500, durationMs: 120000 });
            expect(h.events).toContainEqual({ t: 'player', id: 7, event: 'playing', positionMs: 1500, durationMs: 120000 });
            expect(h.events.filter((e) => e.t === 'player' && e.event === 'time').length).toBeGreaterThanOrEqual(2);
            expect(h.events).toContainEqual({ t: 'player', id: 7, event: 'seeked', positionMs: 30000, durationMs: 120000 });
            expect(h.events).toContainEqual({ t: 'player', id: 7, event: 'paused', positionMs: 30000, durationMs: 120000 });
            expect(h.events).toContainEqual({ t: 'player', id: 7, event: 'ended', positionMs: 30000, durationMs: 120000 });

            h.applyPlayer({ id: 7, op: 'display', mode: 'none' });
            expect(video.style.display).toBe('none');

            h.events.length = 0;
            h.applyPlayer({ id: 7, op: 'open', url: 'https://cdn.example/live.m3u8' });
            expect(h.events).toContainEqual({
                t: 'player',
                id: 7,
                event: 'error',
                message: 'HLS playback is not supported',
            });

            h.applyPlayer({ id: 7, op: 'close' });
            expect(underlay.querySelector('video[data-nui-player-id="7"]')).toBeNull();
        });
    });

    it('uses window.Hls for m3u8 when native HLS is unavailable', () => {
        const loaded: string[] = [];
        let destroyed = false;
        class FakeHls {
            static isSupported(): boolean {
                return true;
            }
            loadSource(url: string): void {
                loaded.push(url);
            }
            attachMedia(): void {}
            destroy(): void {
                destroyed = true;
            }
        }
        const h = loadRenderer({ hls: FakeHls });
        cleanups.push(() => h.window.__tvemuNui.destroy());

        h.applyPlayer({ id: 9, op: 'open', url: 'https://cdn.example/master.m3u8' });
        const video = h.document.querySelector<HTMLVideoElement>('video[data-nui-player-id="9"]')!;
        video.pause = vi.fn();
        video.load = vi.fn();
        expect(loaded).toEqual(['https://cdn.example/master.m3u8']);
        expect(h.events).toEqual([]);
        h.applyPlayer({ id: 9, op: 'close' });
        expect(destroyed).toBe(true);
    });
});
