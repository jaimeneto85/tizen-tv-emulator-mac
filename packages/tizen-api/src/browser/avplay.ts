import {
    INVALID_STATE_ERR,
    INVALID_VALUES_ERR,
    NETWORK_ERR,
    TYPE_MISMATCH_ERR,
    WebAPIException,
    expectBoolean,
    expectFunction,
    expectNumber,
    expectString
} from './errors.js';
import type { Logger } from './logger.js';
import type { PrivilegeChecker } from './privileges.js';

type PlaybackState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED';

const STREAMING_PROPERTIES = [
    'AVAILABLE_BITRATE', 'CURRENT_BANDWIDTH', 'DURATION', 'BUFFER_SIZE', 'START_FRAGMENT', 'COOKIE',
    'CUSTOM_MESSAGE', 'USER_AGENT', 'PREBUFFER_MODE', 'ADAPTIVE_INFO', 'SET_MODE_3D', 'SET_MODE_4K',
    'HD_AUDIO', 'WIDEVINE'
];

const DISPLAY_MODES = [
    'PLAYER_DISPLAY_MODE_ORIGIN_SIZE', 'PLAYER_DISPLAY_MODE_FULL_SCREEN', 'PLAYER_DISPLAY_MODE_LETTER_BOX',
    'PLAYER_DISPLAY_MODE_CROPPED_FULL', 'PLAYER_DISPLAY_MODE_ZOOM_HALF', 'PLAYER_DISPLAY_MODE_ZOOM_THREE_QUARTERS',
    'PLAYER_DISPLAY_MODE_ORIGIN_OR_LETTER', 'PLAYER_DISPLAY_MODE_DST_ROI'
];

interface HlsLike {
    loadSource(url: string): void;
    attachMedia(video: HTMLMediaElement): void;
    destroy(): void;
}

interface HlsConstructor {
    new (): HlsLike;
    isSupported?: () => boolean;
}

function mediaErrorName(video: HTMLVideoElement): string {
    const error = video.error;
    if (!error) {
        return 'PLAYER_ERROR_GENERAL';
    }
    switch (error.code) {
        case 1:
        case 2:
            return 'PLAYER_ERROR_CONNECTION_FAILED';
        case 3:
            return 'PLAYER_ERROR_INVALID_STREAM';
        case 4:
            return 'PLAYER_ERROR_NOT_SUPPORTED_FORMAT';
        default:
            return 'PLAYER_ERROR_GENERAL';
    }
}

export function createAVPlay(privileges: PrivilegeChecker, logger: Logger): Record<string, unknown> {
    let state: PlaybackState = 'NONE';
    let video: HTMLVideoElement | null = null;
    let hls: HlsLike | null = null;
    let callbacks: Record<string, (value?: unknown) => void> = {};
    let domListenersAttached = false;
    let displayRect = { x: 0, y: 0, width: 0, height: 0 };
    let bufferingTimeoutSeconds = 10;
    const streamingValues = new Map<string, string>();
    let drmConfig: { type: number; operation: number; json: string } | null = null;

    function fire(name: string, value?: unknown): void {
        const callback = callbacks[name];
        if (typeof callback !== 'function') {
            return;
        }
        try {
            if (value === undefined) {
                callback();
            } else {
                callback(value);
            }
        } catch (error) {
            logger.log('error', `avplay listener ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    function bufferedPercent(): number {
        if (!video || !video.duration || !isFinite(video.duration) || video.buffered.length === 0) {
            return 0;
        }
        return Math.round((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    }

    function attachDomListeners(): void {
        if (!video || domListenersAttached) {
            return;
        }
        domListenersAttached = true;
        video.addEventListener('loadstart', () => fire('bufferingstart'));
        video.addEventListener('waiting', () => fire('bufferingstart'));
        video.addEventListener('stalled', () => fire('bufferingstart'));
        video.addEventListener('progress', () => fire('bufferingprogress', bufferedPercent()));
        video.addEventListener('canplay', () => fire('bufferingcomplete'));
        video.addEventListener('loadeddata', () => fire('bufferingcomplete'));
        video.addEventListener('timeupdate', () => fire('currentplaytime', video ? Math.round(video.currentTime * 1000) : 0));
        video.addEventListener('ended', () => fire('streamcompleted'));
        video.addEventListener('error', () => {
            if (video && video.error) {
                fire('error', mediaErrorName(video));
            }
        });
    }

    function ensureVideo(): HTMLVideoElement {
        if (video) {
            return video;
        }
        const created = document.createElement('video');
        created.id = 'tvemu-avplay-video';
        const style = created.style;
        style.position = 'absolute';
        style.left = `${displayRect.x}px`;
        style.top = `${displayRect.y}px`;
        style.width = `${displayRect.width}px`;
        style.height = `${displayRect.height}px`;
        style.zIndex = '0';
        style.display = 'none';
        if (document.body) {
            document.body.insertBefore(created, document.body.firstChild);
        }
        video = created;
        return created;
    }

    function showVideo(): void {
        if (video) {
            video.style.display = 'block';
        }
    }

    function hideVideo(): void {
        if (video) {
            video.style.display = 'none';
        }
    }

    function destroyHls(): void {
        if (hls && typeof hls.destroy === 'function') {
            try {
                hls.destroy();
            } catch {
                void 0;
            }
        }
        hls = null;
    }

    function resetElement(): void {
        if (!video) {
            return;
        }
        try {
            video.pause();
            video.removeAttribute('src');
            video.load();
        } catch {
            void 0;
        }
    }

    function hlsConstructor(): HlsConstructor | null {
        const candidate = (window as unknown as { Hls?: HlsConstructor }).Hls;
        if (typeof candidate === 'function') {
            return candidate;
        }
        return null;
    }

    function nativeHlsSupported(element: HTMLVideoElement): boolean {
        try {
            return Boolean(
                element.canPlayType('application/vnd.apple.mpegurl') ||
                element.canPlayType('application/x-mpegURL') ||
                element.canPlayType('application/mpegurl')
            );
        } catch {
            return false;
        }
    }

    function openUrl(url: string, element: HTMLVideoElement): void {
        if (url.indexOf('m3u8') !== -1 && !nativeHlsSupported(element)) {
            const HlsClass = hlsConstructor();
            if (HlsClass && (!HlsClass.isSupported || HlsClass.isSupported())) {
                destroyHls();
                hls = new HlsClass();
                hls.loadSource(url);
                hls.attachMedia(element);
                return;
            }
        }
        element.src = url;
    }

    function expectCallbacks(successCallback: unknown, errorCallback: unknown): void {
        if (typeof successCallback !== 'function' || typeof errorCallback !== 'function') {
            if (typeof errorCallback === 'function') {
                (errorCallback as (error: unknown) => void)(new WebAPIException(TYPE_MISMATCH_ERR, 'callbacks must be functions'));
            }
            throw new WebAPIException(TYPE_MISMATCH_ERR, 'callbacks must be functions');
        }
    }

    function inState(allowed: PlaybackState[]): boolean {
        return allowed.indexOf(state) !== -1;
    }

    function requireState(allowed: PlaybackState[]): void {
        if (!inState(allowed)) {
            throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
        }
    }

    return {
        open(url: unknown) {
            privileges.check('webapis.avplay');
            const target = expectString(url);
            requireState(['NONE', 'IDLE']);
            const element = ensureVideo();
            destroyHls();
            resetElement();
            attachDomListeners();
            openUrl(target, element);
            state = 'IDLE';
            showVideo();
            if (target.indexOf('ism') !== -1 || target.indexOf('m3u8') !== -1) {
                return 'success';
            }
            return '';
        },
        close() {
            if (video) {
                destroyHls();
                resetElement();
                hideVideo();
            }
            callbacks = {};
            domListenersAttached = false;
            state = 'NONE';
            return 'success';
        },
        prepare() {
            privileges.check('webapis.avplay');
            requireState(['IDLE', 'READY']);
            const element = ensureVideo();
            if (element.networkState === 0) {
                throw new WebAPIException(NETWORK_ERR, 'no media data available');
            }
            state = 'READY';
            return undefined;
        },
        prepareAsync(successCallback: unknown, errorCallback: unknown) {
            privileges.check('webapis.avplay');
            expectCallbacks(successCallback, errorCallback);
            if (!inState(['IDLE', 'READY'])) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`));
                return '';
            }
            const element = ensureVideo();
            if (element.networkState === 0) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(NETWORK_ERR, 'no media data available'));
                return '';
            }
            const finish = () => {
                state = 'READY';
                (successCallback as () => void)();
            };
            if (element.readyState >= 1) {
                setTimeout(finish, 0);
            } else {
                element.addEventListener('loadedmetadata', function onLoaded() {
                    element.removeEventListener('loadedmetadata', onLoaded);
                    finish();
                });
            }
            return 'success';
        },
        play() {
            privileges.check('webapis.avplay');
            requireState(['READY', 'PLAYING', 'PAUSED']);
            const element = ensureVideo();
            const result = element.play();
            if (result && typeof result.catch === 'function') {
                result.catch((error: unknown) => {
                    fire('error', error instanceof Error ? error.message : String(error));
                });
            }
            state = 'PLAYING';
            showVideo();
            return 'success';
        },
        pause() {
            privileges.check('webapis.avplay');
            requireState(['PLAYING', 'PAUSED']);
            if (video) {
                video.pause();
            }
            state = 'PAUSED';
            return 'success';
        },
        stop() {
            if (video) {
                video.pause();
                try {
                    video.currentTime = 0;
                } catch {
                    void 0;
                }
            }
            state = 'IDLE';
            return 'success';
        },
        suspend() {
            if (video) {
                video.pause();
            }
            state = 'PAUSED';
            return undefined;
        },
        restore(url: unknown, milliseconds: unknown, prepareFlag: unknown) {
            privileges.check('webapis.avplay');
            const target = expectString(url);
            const offset = expectNumber(milliseconds);
            if (state === 'READY' || state === 'IDLE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            const element = ensureVideo();
            destroyHls();
            element.src = target;
            try {
                element.currentTime = offset / 1000;
            } catch {
                void 0;
            }
            const result = element.play();
            if (result && typeof result.catch === 'function') {
                result.catch(() => void 0);
            }
            void prepareFlag;
            state = 'PLAYING';
            showVideo();
            return undefined;
        },
        seekTo(milliseconds: unknown, successCallback: unknown, errorCallback: unknown) {
            privileges.check('webapis.avplay');
            expectCallbacks(successCallback, errorCallback);
            const target = parseInt(String(milliseconds), 10);
            if (!Number.isNaN(target) && target < 0) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_VALUES_ERR, 'negative position'));
            } else if (state === 'NONE') {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`));
            } else if (!Number.isNaN(target) && video && isFinite(video.duration) && target / 1000 < video.duration) {
                try {
                    video.currentTime = target / 1000;
                } catch {
                    void 0;
                }
            }
            void milliseconds;
            (successCallback as () => void)();
            return 'success';
        },
        jumpForward(milliseconds: unknown, successCallback: unknown, errorCallback: unknown) {
            privileges.check('webapis.avplay');
            expectCallbacks(successCallback, errorCallback);
            const amount = expectNumber(milliseconds);
            if (amount < 0) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_VALUES_ERR, 'negative jump'));
            } else if (!inState(['READY', 'PLAYING', 'PAUSED'])) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`));
            } else if (video) {
                const duration = isFinite(video.duration) ? video.duration : Number.MAX_VALUE;
                try {
                    video.currentTime = Math.min(video.currentTime + amount / 1000, duration);
                } catch {
                    void 0;
                }
            }
            (successCallback as () => void)();
            return 'success';
        },
        jumpBackward(milliseconds: unknown, successCallback: unknown, errorCallback: unknown) {
            privileges.check('webapis.avplay');
            expectCallbacks(successCallback, errorCallback);
            const amount = expectNumber(milliseconds);
            if (amount < 0) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_VALUES_ERR, 'negative jump'));
            } else if (!inState(['READY', 'PLAYING', 'PAUSED'])) {
                (errorCallback as (error: unknown) => void)(new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`));
            } else if (video) {
                try {
                    video.currentTime = Math.max(video.currentTime - amount / 1000, 0);
                } catch {
                    void 0;
                }
            }
            (successCallback as () => void)();
            return 'success';
        },
        getDuration() {
            if (!video) {
                return NaN;
            }
            return video.duration * 1000;
        },
        getCurrentTime() {
            if (!video) {
                return 0;
            }
            return Math.round(video.currentTime * 1000);
        },
        getState() {
            return state;
        },
        getSubState() {
            return state;
        },
        setSpeed(value: unknown) {
            privileges.check('webapis.avplay');
            const speed = expectNumber(value);
            if (speed < 1 || speed > 4) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unsupported speed: ${speed}`);
            }
            requireState(['READY', 'PLAYING', 'PAUSED']);
            if (video) {
                video.playbackRate = speed;
            }
            return 'success';
        },
        setDisplayRect(x: unknown, y: unknown, width: unknown, height: unknown) {
            privileges.check('webapis.avplay');
            if (arguments.length < 4) {
                return '';
            }
            const rectX = expectNumber(x);
            const rectY = expectNumber(y);
            const rectW = expectNumber(width);
            const rectH = expectNumber(height);
            if (state === 'NONE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            displayRect = { x: rectX, y: rectY, width: rectW, height: rectH };
            const element = ensureVideo();
            element.style.left = `${rectX}px`;
            element.style.top = `${rectY}px`;
            element.style.width = `${rectW}px`;
            element.style.height = `${rectH}px`;
            return 'success';
        },
        setDisplayMethod(mode: unknown) {
            privileges.check('webapis.avplay');
            const value = expectString(mode);
            if (DISPLAY_MODES.indexOf(value) === -1) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown display mode: ${value}`);
            }
            if (state === 'NONE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        setListener(listeners: unknown) {
            if (!video || listeners === undefined || listeners === null) {
                return undefined;
            }
            const record = listeners as Record<string, unknown>;
            for (const key of Object.keys(record)) {
                const stripped = key.indexOf('on') === 0 ? key.slice(2) : key;
                const lowered = stripped.charAt(0).toLowerCase() + stripped.slice(1);
                if (typeof record[key] === 'function') {
                    callbacks[lowered] = record[key] as (value?: unknown) => void;
                }
            }
            return undefined;
        },
        setNextURI() {
            return undefined;
        },
        setDrm(drmType: unknown, drmOperation: unknown, json: unknown) {
            privileges.check('webapis.avplay');
            const type = expectNumber(drmType);
            const operation = expectNumber(drmOperation);
            if (type < 0 || type > 2) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown drm type: ${type}`);
            }
            if (operation < 0 || operation > 4) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown drm operation: ${operation}`);
            }
            drmConfig = { type, operation, json: json === undefined || json === null ? '' : String(json) };
            logger.log('log', '[tvemu] avplay setDrm accepted; DRM is not emulated');
            return undefined;
        },
        setStreamingProperty(name: unknown, value: unknown) {
            privileges.check('webapis.avplay');
            const property = expectString(name);
            if (STREAMING_PROPERTIES.indexOf(property) === -1) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown streaming property: ${property}`);
            }
            streamingValues.set(property, value === undefined || value === null ? '' : String(value));
            return undefined;
        },
        getStreamingProperty(name: unknown) {
            privileges.check('webapis.avplay');
            const property = expectString(name);
            if (STREAMING_PROPERTIES.indexOf(property) === -1) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown streaming property: ${property}`);
            }
            return streamingValues.has(property) ? streamingValues.get(property) : property;
        },
        setSelectTrack(type: unknown, index: unknown) {
            privileges.check('webapis.avplay');
            expectString(type);
            expectNumber(index);
            if (state === 'NONE' || state === 'IDLE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        getCurrentStreamInfo() {
            return [{ index: 0, type: 'VIDEO', extra_info: '' }];
        },
        getTotalTrackInfo() {
            return [{ index: 0, type: 'VIDEO', extra_info: 'Just an example for TrackInfo' }];
        },
        setTimeoutForBuffering(seconds: unknown) {
            privileges.check('webapis.avplay');
            const value = expectNumber(seconds);
            if (value < 0) {
                throw new WebAPIException(INVALID_VALUES_ERR, 'negative timeout');
            }
            if (state === 'NONE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            bufferingTimeoutSeconds = value;
            void bufferingTimeoutSeconds;
            return 'success';
        },
        setBufferingParam(...args: unknown[]) {
            privileges.check('webapis.avplay');
            streamingValues.set('BUFFERING_PARAM', JSON.stringify(args));
            return undefined;
        },
        setSoundAnalysisListener(callback: unknown) {
            privileges.check('webapis.avplay');
            expectFunction(callback);
            if (state !== 'IDLE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        unsetSoundAnalysisListener() {
            if (state === 'NONE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        setSilentSubtitle(value: unknown) {
            privileges.check('webapis.avplay');
            expectBoolean(value);
            if (state === 'NONE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        setExternalSubtitlePath(path: unknown) {
            privileges.check('webapis.avplay');
            expectString(path);
            if (state === 'NONE') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        setSubtitlePosition(milliseconds: unknown) {
            privileges.check('webapis.avplay');
            expectNumber(milliseconds);
            if (state !== 'PLAYING' && state !== 'PAUSED') {
                throw new WebAPIException(INVALID_STATE_ERR, `invalid state: ${state}`);
            }
            return undefined;
        },
        enableAudioStream() {
            return undefined;
        },
        disableAudioStream() {
            return undefined;
        },
        setDisplayRotation() {
            return undefined;
        },
        getVersion() {
            return '1.0';
        }
    };
}
