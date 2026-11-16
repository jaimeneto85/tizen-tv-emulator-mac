import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp, SAMPLE_MANIFEST } from './testing/harness.js';

describe('host bridge', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('correlates responses with pending requests by id', () => {
        const { window, sent } = loadApp({ manifest: SAMPLE_MANIFEST, bridge: () => void 0 });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const app = tizen.application.getCurrentApplication();
        app.exit();
        expect(sent).toHaveLength(1);
        const request = JSON.parse(sent[0]);
        expect(request.api).toBe('application');
        expect(request.method).toBe('exit');
        expect(typeof request.id).toBe('number');
        (window as Record<string, any>).__tvemuReceive(JSON.stringify({ id: request.id, ok: true, result: null }));
        vi.advanceTimersByTime(10000);
        const timeoutLogs = sent
            .map((json) => JSON.parse(json))
            .filter((message) => message.api === 'console' && String(message.args[1]).indexOf('bridge timeout') !== -1);
        expect(timeoutLogs).toEqual([]);
    });

    it('times out unanswered requests and reports through the console bridge', () => {
        const { window, sent } = loadApp({ manifest: SAMPLE_MANIFEST, bridge: () => void 0 });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        tizen.application.getCurrentApplication().hide();
        vi.advanceTimersByTime(6000);
        const timeoutLogs = sent
            .map((json) => JSON.parse(json))
            .filter((message) => message.api === 'console' && String(message.args[1]).indexOf('bridge timeout') !== -1);
        expect(timeoutLogs.length).toBe(1);
        expect(timeoutLogs[0].args[0]).toBe('error');
    });

    it('notifies registered key changes to the host', () => {
        const { window, sent } = loadApp({ manifest: SAMPLE_MANIFEST, bridge: () => void 0 });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        tizen.tvinputdevice.registerKey('MediaPlayPause');
        tizen.tvinputdevice.registerKey('ColorF0Red');
        tizen.tvinputdevice.unregisterKey('ColorF0Red');
        const keyEvents = sent.map((json) => JSON.parse(json)).filter((message) => message.method === 'keysChanged');
        expect(keyEvents.length).toBe(3);
        expect(keyEvents[0].args).toEqual([['MediaPlayPause']]);
        expect(keyEvents[2].args).toEqual([['MediaPlayPause']]);
    });

    it('applies visibility BridgeEvents to document.hidden and visibilityState', () => {
        const { window, document } = loadApp({ manifest: SAMPLE_MANIFEST });
        expect(document.hidden).toBe(false);
        const events: string[] = [];
        document.addEventListener('visibilitychange', () => {
            events.push(document.visibilityState || 'none');
        });
        (window as Record<string, any>).__tvemuReceive(JSON.stringify({ event: 'visibility', payload: 'hidden' }));
        expect(document.hidden).toBe(true);
        expect(document.visibilityState).toBe('hidden');
        (window as Record<string, any>).__tvemuReceive(JSON.stringify({ event: 'visibility', payload: 'visible' }));
        expect(document.hidden).toBe(false);
        expect(document.visibilityState).toBe('visible');
        expect(events).toEqual(['hidden', 'visible']);
    });

    it('application.hide() flips visibility locally and dispatches visibilitychange', () => {
        const { window, document, sent } = loadApp({ manifest: SAMPLE_MANIFEST, bridge: () => void 0 });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const calls: string[] = [];
        document.addEventListener('visibilitychange', () => {
            calls.push(document.visibilityState || 'none');
        });
        tizen.application.getCurrentApplication().hide();
        expect(calls).toEqual(['hidden']);
        const hideRequest = sent.map((json) => JSON.parse(json)).find((message) => message.method === 'hide');
        expect(hideRequest.api).toBe('application');
    });
});
