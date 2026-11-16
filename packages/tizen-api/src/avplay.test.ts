import { beforeEach, describe, expect, it } from 'vitest';
import { loadApp, nextTick, SAMPLE_MANIFEST, thrownName } from './testing/harness.js';

function stubMedia(window: Record<string, any>): void {
    const proto = window.HTMLMediaElement.prototype as Record<string, unknown>;
    Object.defineProperty(proto, 'networkState', { configurable: true, get() { return 1; } });
    Object.defineProperty(proto, 'readyState', { configurable: true, get() { return 1; } });
    Object.defineProperty(proto, 'duration', { configurable: true, get() { return 60; } });
    Object.defineProperty(proto, 'buffered', {
        configurable: true,
        get() {
            return { length: 1, end: () => 30 };
        }
    });
    proto.play = function play(this: { dispatchEvent: (event: Event) => boolean }) {
        this.dispatchEvent(new window.Event('play'));
        return Promise.resolve();
    };
    proto.pause = function pause() { return undefined; };
    proto.canPlayType = () => '';
    proto.load = () => undefined;
    proto.setAttribute = proto.setAttribute;
}

describe('webapis.avplay', () => {
    let app: ReturnType<typeof loadApp>;
    let avplay: Record<string, any>;

    beforeEach(() => {
        app = loadApp({ manifest: SAMPLE_MANIFEST });
        stubMedia(app.window as unknown as Record<string, any>);
        const webapis = (app.window as Record<string, unknown>).webapis as Record<string, any>;
        avplay = webapis.avplay;
    });

    it('runs the state machine NONE -> IDLE -> READY -> PLAYING <-> PAUSED with illegal-transition errors', async () => {
        expect(avplay.getState()).toBe('NONE');
        expect(thrownName(() => avplay.play())).toBe('InvalidStateError');
        expect(thrownName(() => avplay.prepare())).toBe('InvalidStateError');

        expect(avplay.open('http://localhost/video.mp4')).toBe('');
        expect(avplay.getState()).toBe('IDLE');

        avplay.prepare();
        expect(avplay.getState()).toBe('READY');

        expect(avplay.play()).toBe('success');
        expect(avplay.getState()).toBe('PLAYING');

        avplay.pause();
        expect(avplay.getState()).toBe('PAUSED');

        expect(avplay.play()).toBe('success');
        avplay.pause();
        avplay.stop();
        expect(avplay.getState()).toBe('IDLE');

        expect(thrownName(() => avplay.play())).toBe('InvalidStateError');
        expect(avplay.close()).toBe('success');
        expect(avplay.getState()).toBe('NONE');
    });

    it('opens HLS urls successfully and prefers an app-provided hls.js when native playback is unavailable', () => {
        const hlsCalls: string[] = [];
        const withHls = loadApp({
            manifest: SAMPLE_MANIFEST,
            globals: {
                Hls: class {
                    loadSource(url: string) {
                        hlsCalls.push(url);
                    }
                    attachMedia() {
                        hlsCalls.push('attach');
                    }
                    destroy() {
                        hlsCalls.push('destroy');
                    }
                }
            }
        });
        stubMedia(withHls.window as unknown as Record<string, any>);
        const player = (withHls.window as Record<string, any>).webapis.avplay;
        expect(player.open('http://localhost/stream.m3u8')).toBe('success');
        expect(hlsCalls).toEqual(['http://localhost/stream.m3u8', 'attach']);
    });

    it('creates the video element as the first child of body with an absolute rect in the 1920x1080 app space', () => {
        avplay.open('http://localhost/video.mp4');
        const body = app.document.body;
        const video = body.firstChild as HTMLVideoElement;
        expect(video.tagName).toBe('VIDEO');
        expect(video.id).toBe('tvemu-avplay-video');
        expect(video.style.position).toBe('absolute');
        expect(avplay.setDisplayRect(100, 200, 960, 540)).toBe('success');
        expect(video.style.left).toBe('100px');
        expect(video.style.top).toBe('200px');
        expect(video.style.width).toBe('960px');
        expect(video.style.height).toBe('540px');
        expect(video.style.zIndex).toBe('0');
    });

    it('rejects setDisplayRect with wrong types and in NONE state', () => {
        expect(thrownName(() => avplay.setDisplayRect(0, 0, 100, 100))).toBe('InvalidStateError');
        avplay.open('http://localhost/video.mp4');
        expect(thrownName(() => avplay.setDisplayRect('0', 0, 100, 100))).toBe('TypeMismatchError');
    });

    it('reports duration and current time in milliseconds', () => {
        avplay.open('http://localhost/video.mp4');
        avplay.prepare();
        expect(avplay.getDuration()).toBe(60000);
        const video = app.document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 2.5, set: () => void 0 });
        expect(avplay.getCurrentTime()).toBe(2500);
    });

    it('fires listener callbacks from media events', () => {
        avplay.open('http://localhost/video.mp4');
        const fired: Array<[string, unknown]> = [];
        avplay.setListener({
            onbufferingstart: () => fired.push(['bufferingstart', undefined]),
            onbufferingcomplete: () => fired.push(['bufferingcomplete', undefined]),
            oncurrentplaytime: (ms: number) => fired.push(['currentplaytime', ms]),
            onstreamcompleted: () => fired.push(['streamcompleted', undefined]),
            onerror: (name: string) => fired.push(['error', name])
        });
        const video = app.document.querySelector('video') as HTMLVideoElement;
        video.dispatchEvent(new app.window.Event('loadstart'));
        video.dispatchEvent(new app.window.Event('canplay'));
        Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 1.234, set: () => void 0 });
        video.dispatchEvent(new app.window.Event('timeupdate'));
        video.dispatchEvent(new app.window.Event('ended'));
        expect(fired).toEqual([
            ['bufferingstart', undefined],
            ['bufferingcomplete', undefined],
            ['currentplaytime', 1234],
            ['streamcompleted', undefined]
        ]);
    });

    it('supports seek/jump validation rules and speed limits', () => {
        avplay.open('http://localhost/video.mp4');
        avplay.prepare();
        const errors: string[] = [];
        const ok = () => void 0;
        const fail = (error: { name: string }) => errors.push(error.name);
        avplay.seekTo(-5, ok, fail);
        expect(errors).toEqual(['InvalidValuesError']);
        avplay.jumpForward(-1, ok, fail);
        expect(errors).toEqual(['InvalidValuesError', 'InvalidValuesError']);
        expect(thrownName(() => avplay.setSpeed(0))).toBe('InvalidValuesError');
        expect(thrownName(() => avplay.setSpeed('x'))).toBe('TypeMismatchError');
        expect(avplay.setSpeed(2)).toBe('success');
    });

    it('supports prepareAsync, streaming properties, tracks and drm acceptance', async () => {
        avplay.open('http://localhost/video.mp4');
        let prepared = 0;
        expect(avplay.prepareAsync(() => { prepared += 1; }, () => void 0)).toBe('success');
        await nextTick();
        expect(prepared).toBe(1);
        expect(avplay.getState()).toBe('READY');

        avplay.setStreamingProperty('USER_AGENT', 'agent/1.0');
        expect(avplay.getStreamingProperty('USER_AGENT')).toBe('agent/1.0');
        expect(avplay.getStreamingProperty('COOKIE')).toBe('COOKIE');
        expect(thrownName(() => avplay.setStreamingProperty('NOPE', 'x'))).toBe('TypeMismatchError');

        expect(avplay.getCurrentStreamInfo()).toEqual([{ index: 0, type: 'VIDEO', extra_info: '' }]);
        expect(avplay.getTotalTrackInfo()).toEqual([{ index: 0, type: 'VIDEO', extra_info: 'Just an example for TrackInfo' }]);
        avplay.setSelectTrack('VIDEO', 0);
        expect(thrownName(() => avplay.setSelectTrack('VIDEO', 'x'))).toBe('TypeMismatchError');

        avplay.setDrm(0, 0, '{"key":"value"}');
        expect(thrownName(() => avplay.setDrm(9, 0, ''))).toBe('InvalidValuesError');
        expect(avplay.getVersion()).toBe('1.0');
    });
});
