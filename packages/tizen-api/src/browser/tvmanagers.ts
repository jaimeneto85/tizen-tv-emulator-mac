import {
    INVALID_VALUES_ERR,
    NOT_SUPPORTED_ERR,
    TYPE_MISMATCH_ERR,
    WebAPIException,
    expectBoolean,
    expectFunction,
    expectNumber,
    expectObject,
    expectOptionalFunction,
    expectString,
    webAPIErrorFor
} from './errors.js';
import { defineFrozen, nextTick } from './env.js';
import type { PrivilegeChecker } from './privileges.js';
import type { TZDate, TimeDuration } from './time.js';

function asyncSuccess(callback: unknown, ...args: unknown[]): void {
    const success = expectOptionalFunction<(...values: unknown[]) => void>(callback);
    nextTick(() => {
        if (success) {
            success(...args);
        }
    });
}

function asyncError(callback: unknown, error: WebAPIException): void {
    const failure = expectOptionalFunction<(error: unknown) => void>(callback);
    nextTick(() => {
        if (failure) {
            failure(webAPIErrorFor(error));
        }
    });
}

export function createAudioControl(privileges: PrivilegeChecker): Record<string, unknown> {
    let volume = 60;
    let muted = false;
    let changeListener: ((volume: number) => void) | null = null;

    function applyToMediaElements(): void {
        const elements = document.querySelectorAll('audio, video');
        for (let i = 0; i < elements.length; i += 1) {
            const media = elements.item(i) as HTMLMediaElement;
            try {
                media.volume = volume / 100;
                media.muted = muted;
            } catch {
                void 0;
            }
        }
    }

    function fireChange(): void {
        if (changeListener) {
            try {
                changeListener(volume);
            } catch {
                void 0;
            }
        }
    }

    const SOUND_TYPES = [
        'UP', 'DOWN', 'LEFT', 'RIGHT', 'PAGE_LEFT', 'PAGE_RIGHT', 'BACK', 'SELECT', 'CANCEL',
        'WARNING', 'KEYPAD', 'KEYPAD_ENTER', 'KEYPAD_DEL', 'MOVE', 'PREPARING'
    ];

    return {
        setMute(mute: unknown) {
            privileges.check('tizen.tvaudiocontrol');
            muted = expectBoolean(mute);
            applyToMediaElements();
            return undefined;
        },
        isMute() {
            privileges.check('tizen.tvaudiocontrol');
            return muted;
        },
        setVolume(value: unknown) {
            privileges.check('tizen.tvaudiocontrol');
            const next = expectNumber(value);
            if (next < 0 || next > 100) {
                throw new WebAPIException(INVALID_VALUES_ERR, 'volume must be between 0 and 100');
            }
            volume = next;
            applyToMediaElements();
            fireChange();
            return undefined;
        },
        setVolumeUp() {
            privileges.check('tizen.tvaudiocontrol');
            volume = Math.min(100, volume + 1);
            applyToMediaElements();
            fireChange();
            return undefined;
        },
        setVolumeDown() {
            privileges.check('tizen.tvaudiocontrol');
            volume = Math.max(0, volume - 1);
            applyToMediaElements();
            fireChange();
            return undefined;
        },
        getVolume() {
            privileges.check('tizen.tvaudiocontrol');
            return volume;
        },
        setVolumeChangeListener(callback: unknown) {
            privileges.check('tizen.tvaudiocontrol');
            changeListener = expectFunction<(volume: number) => void>(callback);
            return undefined;
        },
        unsetVolumeChangeListener() {
            changeListener = null;
            return undefined;
        },
        getOutputMode() {
            privileges.check('tizen.tvaudiocontrol');
            return 'PCM';
        },
        playSound(type: unknown) {
            privileges.check('tizen.tvaudiocontrol');
            const soundType = expectString(type);
            if (SOUND_TYPES.indexOf(soundType) === -1) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown sound type: ${soundType}`);
            }
            return undefined;
        }
    };
}

const SOURCE_TYPES = ['TV', 'AV', 'SVIDEO', 'COMP', 'PC', 'HDMI', 'SCART', 'DVI', 'MEDIA', 'IPTV'];

export function createTVWindow(privileges: PrivilegeChecker): Record<string, unknown> {
    let currentSource = defineFrozen({}, { type: 'TV', number: 1 });
    let currentRect = ['0', '0', '1920', '1080'];
    let nextListenerId = 1024;
    const resolutionListeners = new Map<number, unknown>();

    const availableSources = [
        defineFrozen({}, { type: 'TV', number: 1 }),
        defineFrozen({}, { type: 'HDMI', number: 1 }),
        defineFrozen({}, { type: 'HDMI', number: 2 })
    ];

    function parseRectPart(part: unknown): number | null {
        if (typeof part !== 'string') {
            return null;
        }
        const match = /^([0-9]+)(px|%)?$/.exec(part);
        if (!match) {
            return null;
        }
        return parseInt(match[1] as string, 10);
    }

    return {
        WindowType: defineFrozen({}, { MAIN: 'MAIN', UNKNOWN: 'UNKNOWN' }),
        WindowSourceType: defineFrozen({}, {
            TV: 'TV', AV: 'AV', SVIDEO: 'SVIDEO', COMP: 'COMP', PC: 'PC', HDMI: 'HDMI',
            SCART: 'SCART', DVI: 'DVI', MEDIA: 'MEDIA', IPTV: 'IPTV'
        }),
        MeasurementUnit: defineFrozen({}, { PIXEL: 'px', PERCENT: '%' }),
        getAvailableWindows(successCallback: unknown, errorCallback?: unknown) {
            privileges.check('tizen.tvwindow');
            expectFunction(successCallback);
            asyncSuccess(successCallback, ['MAIN']);
            return undefined;
        },
        getAvailableSources() {
            privileges.check('tizen.tvwindow');
            return availableSources.slice();
        },
        setSource(sourceInfo: unknown, successCallback: unknown, errorCallback?: unknown, windowType?: unknown) {
            privileges.check('tizen.tvwindow');
            try {
                expectFunction(successCallback);
                const info = expectObject(sourceInfo);
                const type = String(info.type);
                const number = Number(info.number);
                const known = availableSources.some((entry) => entry.type === type && entry.number === number);
                if (known) {
                    currentSource = defineFrozen({}, { type, number });
                    asyncSuccess(successCallback, currentSource, 'MAIN');
                } else {
                    asyncError(errorCallback, new WebAPIException(NOT_SUPPORTED_ERR, `unsupported source: ${type} ${number}`));
                }
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        getSource(windowType?: unknown) {
            privileges.check('tizen.tvwindow');
            return currentSource;
        },
        show(successCallback: unknown, errorCallback?: unknown, rectangle?: unknown, windowType?: unknown) {
            privileges.check('tizen.tvwindow');
            try {
                expectFunction(successCallback);
                if (rectangle !== undefined && rectangle !== null) {
                    const parts = rectangle as unknown[];
                    if (!Array.isArray(parts) || parts.length !== 4) {
                        throw new WebAPIException(INVALID_VALUES_ERR, 'rectangle must have 4 parts');
                    }
                    const numbers = parts.map((part) => parseRectPart(part));
                    if (numbers.some((value) => value === null)) {
                        throw new WebAPIException(INVALID_VALUES_ERR, 'invalid rectangle part');
                    }
                    const x = numbers[0] as number;
                    const y = numbers[1] as number;
                    const w = numbers[2] as number;
                    const h = numbers[3] as number;
                    if (x + w > 1920 || y + h > 1080) {
                        throw new WebAPIException(INVALID_VALUES_ERR, 'rectangle exceeds 1920x1080');
                    }
                    currentRect = parts.map((part) => String(part));
                }
                asyncSuccess(successCallback, currentRect.slice(), 'MAIN');
            } catch (error) {
                if (errorCallback) {
                    asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
                } else {
                    throw error;
                }
            }
            return undefined;
        },
        hide(successCallback: unknown, errorCallback?: unknown, windowType?: unknown) {
            privileges.check('tizen.tvwindow');
            expectFunction(successCallback);
            asyncSuccess(successCallback, 'MAIN');
            return undefined;
        },
        getRect(successCallback: unknown, errorCallback?: unknown, unit?: unknown, windowType?: unknown) {
            privileges.check('tizen.tvwindow');
            expectFunction(successCallback);
            const rect = currentRect.slice();
            asyncSuccess(successCallback, rect, 'MAIN');
            return rect;
        },
        getVideoResolution() {
            privileges.check('tizen.tvwindow');
            return defineFrozen({}, { width: 1920, height: 1080, aspectRatio: 'ASPECT_RATIO_16x9' });
        },
        addVideoResolutionChangeListener(callback: unknown) {
            expectFunction(callback);
            const id = nextListenerId;
            nextListenerId += 1;
            resolutionListeners.set(id, callback);
            return id;
        },
        removeVideoResolutionChangeListener(id: unknown) {
            if (typeof id !== 'number' || !resolutionListeners.delete(id)) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${String(id)}`);
            }
            return undefined;
        }
    };
}

interface ChannelFactory {
    now(): TZDate;
    duration(length: number, unit?: string): TimeDuration;
}

export function createTVChannel(privileges: PrivilegeChecker, factory: ChannelFactory): Record<string, unknown> {
    const channels = [1, 2, 3].map((i) => defineFrozen({}, {
        major: i,
        minor: i,
        channelName: `ChannelInfo${i}_channelName`,
        programNumber: i,
        ptc: i,
        lcn: i,
        sourceID: i,
        transportStreamID: i,
        originalNetworkID: i,
        serviceName: `ChannelInfo${i}_serviceName`
    }));
    const programs = [1, 2, 3].map((i) => defineFrozen({}, {
        title: `ProgramInfo${i}_title`,
        startTime: factory.now(),
        duration: factory.duration(i, 'MINS'),
        detailedDescription: `ProgramInfo${i}_detailedDescription`,
        language: 'eng',
        rating: ''
    }));
    let index = 1;
    let nextChannelListenerId = 1024;
    let nextProgramListenerId = 2048;
    const channelListeners = new Map<number, (channel: unknown, windowType: string) => void>();
    const programListeners = new Map<number, (program: unknown) => void>();

    function notifyChannel(): void {
        for (const listener of Array.from(channelListeners.values())) {
            try {
                listener(channels[index], 'MAIN');
            } catch {
                void 0;
            }
        }
    }

    return {
        tune(tuneOption: unknown, tuneCallback: unknown) {
            privileges.check('tizen.tvchannel');
            const option = expectObject(tuneOption);
            const major = Number(option.major);
            const found = channels.findIndex((entry) => entry.major === major && entry.minor === Number(option.minor || entry.minor));
            if (tuneCallback !== undefined && tuneCallback !== null) {
                expectObject(tuneCallback);
            }
            if (found === -1) {
                return undefined;
            }
            index = found;
            notifyChannel();
            if (tuneCallback && typeof (tuneCallback as { onsuccess?: unknown }).onsuccess === 'function') {
                (tuneCallback as { onsuccess: (channel: unknown, windowType: string) => void }).onsuccess(channels[index], 'MAIN');
            }
            return undefined;
        },
        tuneUp(tuneCallback: unknown) {
            privileges.check('tizen.tvchannel');
            index = (index + 1) % channels.length;
            notifyChannel();
            if (tuneCallback && typeof (tuneCallback as { onsuccess?: unknown }).onsuccess === 'function') {
                (tuneCallback as { onsuccess: (channel: unknown, windowType: string) => void }).onsuccess(channels[index], 'MAIN');
            }
            return undefined;
        },
        tuneDown(tuneCallback: unknown) {
            privileges.check('tizen.tvchannel');
            index = (index + channels.length - 1) % channels.length;
            notifyChannel();
            if (tuneCallback && typeof (tuneCallback as { onsuccess?: unknown }).onsuccess === 'function') {
                (tuneCallback as { onsuccess: (channel: unknown, windowType: string) => void }).onsuccess(channels[index], 'MAIN');
            }
            return undefined;
        },
        findChannel(major: unknown, minor: unknown, successCallback: unknown) {
            privileges.check('tizen.tvchannel');
            expectNumber(major);
            expectNumber(minor);
            expectFunction(successCallback);
            asyncSuccess(successCallback, channels.filter((entry) => entry.major === major && entry.minor === minor));
            return undefined;
        },
        getChannelList(successCallback: unknown, channelInfo: unknown, onsuccess?: unknown) {
            privileges.check('tizen.tvchannel');
            expectFunction(successCallback);
            asyncSuccess(successCallback, channels.slice());
            return undefined;
        },
        getCurrentChannel(windowType?: unknown) {
            privileges.check('tizen.tvchannel');
            return channels[index];
        },
        getProgramList(channel: unknown, startTime: unknown, successCallback: unknown, duration?: unknown) {
            privileges.check('tizen.tvchannel');
            expectFunction(successCallback);
            asyncSuccess(successCallback, programs.slice());
            return undefined;
        },
        getCurrentProgram(windowType?: unknown) {
            privileges.check('tizen.tvchannel');
            return programs[1];
        },
        addChannelChangeListener(callback: unknown) {
            privileges.check('tizen.tvchannel');
            expectFunction(callback);
            const id = nextChannelListenerId;
            nextChannelListenerId += 1;
            channelListeners.set(id, callback as (channel: unknown, windowType: string) => void);
            try {
                (callback as (channel: unknown, windowType: string) => void)(channels[index], 'MAIN');
            } catch {
                void 0;
            }
            return id;
        },
        removeChannelChangeListener(id: unknown) {
            privileges.check('tizen.tvchannel');
            if (typeof id !== 'number' || !channelListeners.delete(id)) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${String(id)}`);
            }
            return undefined;
        },
        addProgramChangeListener(callback: unknown) {
            privileges.check('tizen.tvchannel');
            expectFunction(callback);
            const id = nextProgramListenerId;
            nextProgramListenerId += 1;
            programListeners.set(id, callback as (program: unknown) => void);
            return id;
        },
        removeProgramChangeListener(id: unknown) {
            privileges.check('tizen.tvchannel');
            if (typeof id !== 'number' || !programListeners.delete(id)) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${String(id)}`);
            }
            return undefined;
        },
        getNumOfAvailableTuner() {
            return 1;
        },
        getNumOfAvailableSources() {
            return 1;
        },
        getBroadcastStandard(windowType?: unknown) {
            return 'ATSC';
        }
    };
}

const EFFECT_MODES = ['OFF', 'TOP_BOTTOM', 'SIDE_BY_SIDE', 'LINE_BY_LINE', 'VERTICAL_STRIPE', 'FRAME_SEQUENCE', 'CHECKER_BD', 'FROM_2D_TO_3D'];

export function createDisplayControl(privileges: PrivilegeChecker): Record<string, unknown> {
    return {
        get3DEffectMode() {
            privileges.check('tizen.tvdisplaycontrol');
            return 'OFF';
        },
        is3DModeEnabled() {
            privileges.check('tizen.tvdisplaycontrol');
            return 'NOT_SUPPORTED';
        },
        set3DEffectMode(mode: unknown) {
            privileges.check('tizen.tvdisplaycontrol');
            const value = expectString(mode);
            if (EFFECT_MODES.indexOf(value) === -1) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown 3D mode: ${value}`);
            }
            return undefined;
        },
        getSupported3DEffectModeList(successCallback: unknown, errorCallback?: unknown) {
            privileges.check('tizen.tvdisplaycontrol');
            expectFunction(successCallback);
            asyncSuccess(successCallback, EFFECT_MODES.slice());
            return undefined;
        }
    };
}

export function createTVInfo(privileges: PrivilegeChecker): Record<string, unknown> {
    const captionKeys = [
        'CAPTION_ONOFF_KEY', 'CAPTION_MODE_KEY', 'CAPTION_FONT_SIZE_KEY', 'CAPTION_FONT_STYLE_KEY',
        'CAPTION_FONT_COLOR_KEY', 'CAPTION_FONT_OPACITY_KEY', 'CAPTION_BG_COLOR_KEY', 'CAPTION_BG_OPACITY_KEY',
        'CAPTION_EDGE_TYPE_KEY', 'CAPTION_EDGE_COLOR_KEY', 'CAPTION_WINDOW_COLOR_KEY', 'CAPTION_WINDOW_OPACITY_KEY'
    ];
    const captionDefaults: Record<string, number | string> = {};
    captionKeys.forEach((key, i) => {
        captionDefaults[key] = 0;
        captionDefaults[String(i)] = key;
    });
    const CaptionInfoKey = defineFrozen({}, captionDefaults);
    const listeners = new Map<number, unknown>();

    return {
        CaptionInfoKey,
        getCaptionValue(key: unknown) {
            expectString(key);
            const name = String(key);
            if (captionKeys.indexOf(name) === -1) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown caption key: ${name}`);
            }
            return 0;
        },
        addCaptionValueChangeListener(key: unknown, callback: unknown) {
            expectString(key);
            if (captionKeys.indexOf(String(key)) === -1) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown caption key: ${String(key)}`);
            }
            expectFunction(callback);
            const id = listeners.size + 1;
            listeners.set(id, callback);
            return id;
        },
        removeCaptionValueChangeListener(id: unknown) {
            if (typeof id !== 'number' || !listeners.delete(id)) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${String(id)}`);
            }
            return undefined;
        }
    };
}
