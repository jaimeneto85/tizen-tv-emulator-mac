import type { Bridge } from './bridge.js';
import { INVALID_VALUES_ERR, WebAPIException, expectArray, expectNonEmptyString, expectString } from './errors.js';
import type { PrivilegeChecker } from './privileges.js';
import { defineFrozen, nextTick } from './env.js';

export interface DeviceKey {
    readonly name: string;
    readonly code: number;
    readonly defaultDelivered: boolean;
}

const DEFAULT_KEYS: ReadonlyArray<readonly [string, number]> = [
    ['ArrowLeft', 37],
    ['ArrowUp', 38],
    ['ArrowRight', 39],
    ['ArrowDown', 40],
    ['Enter', 13],
    ['Back', 10009]
];

const SPECIAL_KEYS: ReadonlyArray<readonly [string, number]> = [
    ['0', 48], ['1', 49], ['2', 50], ['3', 51], ['4', 52],
    ['5', 53], ['6', 54], ['7', 55], ['8', 56], ['9', 57],
    ['Minus', 189],
    ['VolumeUp', 447], ['VolumeDown', 448], ['VolumeMute', 449],
    ['ChannelUp', 427], ['ChannelDown', 428], ['PreviousChannel', 10190], ['ChannelList', 10073],
    ['ColorF0Red', 403], ['ColorF1Green', 404], ['ColorF2Yellow', 405], ['ColorF3Blue', 406],
    ['MediaRewind', 412], ['MediaFastForward', 417],
    ['MediaPlay', 415], ['MediaPause', 19], ['MediaStop', 413], ['MediaRecord', 416],
    ['MediaPlayPause', 10252], ['MediaTrackPrevious', 10232], ['MediaTrackNext', 10233],
    ['Menu', 18], ['Tools', 10135], ['Info', 457], ['Exit', 10182], ['Search', 10225],
    ['Guide', 458], ['Source', 10072], ['PictureSize', 10140], ['E-Manual', 10146],
    ['MTS', 10195], ['3D', 10199], ['Soccer', 10228], ['Caption', 10221], ['Teletext', 10200],
    ['Extra', 10253], ['Power', 409], ['SmartHub', 10071],
    ['PMODE', 10141], ['SMODE', 10197], ['More', 10148], ['Sleep', 10150],
    ['BTPairing', 10161], ['BTPairingGuide', 10523], ['BTVoice', 10224], ['BTFarVoice', 10538],
    ['Color', 10385], ['Alarm', 10418], ['MultiView', 10505], ['AccessibilityShortcut', 10364],
    ['LearnRemote', 10588], ['QuickAccess', 10591], ['STBPower', 10487],
    ['CCOnOff', 10616], ['VoiceGuide', 10093], ['CCDivision', 10097],
    ['SignLanguageZoom', 10103], ['SignLanguageZoomPlus', 10121], ['SignLanguageZoomMinus', 10122],
    ['CCPreset', 10123], ['CCPosition', 10132], ['CCSize', 10136], ['CCColor', 10395],
    ['VGBackground', 10251], ['CurrentTime', 10254], ['VoiceGender', 10255], ['VoicePitch', 10256],
    ['VoiceSpeed', 10362], ['UserGuideAccessibility', 10363], ['HighContrast', 10584],
    ['Enlarge', 10585], ['VisualImpaired', 10601], ['RotatePanel', 10569], ['TVPlus', 10568],
    ['Ambient', 10530], ['AmbientLong', 10535],
    ['HDMI', 10143], ['TV', 10153],
    ['PanelDown', 10157], ['PanelEnter', 10171], ['PanelUp', 10173], ['PanelExit', 10181],
    ['PanelPlus', 10223], ['PanelMinus', 10227], ['PanelPower', 10531], ['PanelSource', 10532],
    ['PanelMenu', 10533],
    ['Netflix', 10234], ['Amazon', 10229], ['WebBrowser', 10158], ['Hulu', 10507],
    ['RakutenTV', 10508], ['YouTube', 10537], ['Disney', 10634], ['Globo', 10510],
    ['Zee5', 10509], ['Tving', 10632], ['Hotstar', 10633], ['Kinopoisk', 10635],
    ['SweetTV', 10605], ['Vtvgo', 10667], ['FptPlay', 10668], ['AIMenu', 10669],
    ['RussiaCP1', 10511], ['RussiaCP2', 10512], ['RussiaCP3', 10513],
    ['VietnamCP', 10591], ['MenaCP', 10592], ['PlayBackGame', 10571],
    ['GamepadHomekey', 10572], ['ARKVolume', 10593], ['AndroidMenu', 10595],
    ['HotelMovies', 10494], ['HotelLanguage', 10495], ['HotelTVGuide', 10496], ['Content', 10497],
    ['HotelRoomControl', 10522], ['HotelSolution', 10489],
    ['NoiseReduction', 10519], ['Help', 10520], ['NR', 10521],
    ['MBRMenu', 10237], ['MBRBDPopup', 10185],
    ['LFDPowerOff', 10120], ['DiscretPowerOff', 10360], ['DiscretPowerOn', 10361],
    ['LFDSet', 10245], ['LFDUnset', 10166], ['LFDScreenLock', 10147], ['Focus', 10490],
    ['SysMenu', 10133]
];

const ALL_KEYS: DeviceKey[] = DEFAULT_KEYS.map(([name, code]) => ({ name, code, defaultDelivered: true }))
    .concat(SPECIAL_KEYS.map(([name, code]) => ({ name, code, defaultDelivered: false })));

const KEY_BY_NAME = new Map<string, DeviceKey>(ALL_KEYS.map((key) => [key.name, key]));
const KEY_BY_CODE = new Map<number, DeviceKey>(ALL_KEYS.map((key) => [key.code, key]));

export function findKeyByName(name: string): DeviceKey | undefined {
    const wanted = name.toLowerCase();
    for (const key of ALL_KEYS) {
        if (key.name.toLowerCase() === wanted) {
            return key;
        }
    }
    return undefined;
}

export function findKeyByCode(code: number): DeviceKey | undefined {
    return KEY_BY_CODE.get(code);
}

function frozenKey(key: DeviceKey): { readonly name: string; readonly code: number } {
    return defineFrozen({}, { name: key.name, code: key.code });
}

export class KeyRegistry {
    private readonly registered = new Set<string>();

    constructor(private readonly bridge: Bridge) {}

    register(name: string): void {
        this.registered.add(name);
        this.push();
    }

    unregister(name: string): void {
        this.registered.delete(name);
        this.push();
    }

    isRegistered(name: string): boolean {
        return this.registered.has(name);
    }

    names(): string[] {
        return Array.from(this.registered);
    }

    private push(): void {
        this.bridge.notify('tvinputdevice', 'keysChanged', [this.names()]);
    }
}

function dispatchTizenHwKeyBack(documentObject: Document): void {
    const event = documentObject.createEvent('Event');
    event.initEvent('tizenhwkey', true, false);
    Object.defineProperty(event, 'keyName', { value: 'back', writable: false, configurable: false });
    documentObject.dispatchEvent(event);
}

export class KeyFilter {
    constructor(
        private readonly registry: KeyRegistry,
        private readonly documentObject: Document
    ) {}

    install(target: Window): void {
        const handler = (event: Event) => this.handle(event);
        target.addEventListener('keydown', handler, true);
        target.addEventListener('keyup', handler, true);
        target.addEventListener('keypress', handler, true);
    }

    private handle(event: Event): void {
        const keyboardEvent = event as KeyboardEvent;
        const code = typeof keyboardEvent.keyCode === 'number' && keyboardEvent.keyCode !== 0
            ? keyboardEvent.keyCode
            : (keyboardEvent as unknown as { which?: number }).which;
        if (typeof code !== 'number') {
            return;
        }
        if (code === 10009 && event.type === 'keydown') {
            dispatchTizenHwKeyBack(this.documentObject);
        }
        const key = findKeyByCode(code);
        if (!key) {
            return;
        }
        if (key.defaultDelivered) {
            return;
        }
        if (this.registry.isRegistered(key.name)) {
            return;
        }
        event.stopImmediatePropagation();
        event.preventDefault();
    }
}

export interface TVInputDeviceAPI {
    getSupportedKeys(): Array<{ readonly name: string; readonly code: number }>;
    getKey(keyName: string): { readonly name: string; readonly code: number };
    registerKey(keyName: string): void;
    unregisterKey(keyName: string): void;
    registerKeyBatch(keys: string[], successCallback?: () => void, errorCallback?: (error: unknown) => void): void;
    unregisterKeyBatch(keys: string[], successCallback?: () => void, errorCallback?: (error: unknown) => void): void;
}

export function createTVInputDevice(registry: KeyRegistry, privileges: PrivilegeChecker): TVInputDeviceAPI {
    function lookupKey(keyName: unknown): DeviceKey {
        const name = expectNonEmptyString(keyName);
        const key = findKeyByName(name);
        if (!key) {
            throw new WebAPIException(INVALID_VALUES_ERR, `unknown key name: ${name}`);
        }
        return key;
    }

    return {
        getSupportedKeys() {
            privileges.check('tizen.tvinputdevice');
            return ALL_KEYS.map(frozenKey);
        },
        getKey(keyName) {
            privileges.check('tizen.tvinputdevice');
            return frozenKey(lookupKey(keyName));
        },
        registerKey(keyName) {
            privileges.check('tizen.tvinputdevice');
            const key = lookupKey(keyName);
            registry.register(key.name);
        },
        unregisterKey(keyName) {
            privileges.check('tizen.tvinputdevice');
            const key = lookupKey(keyName);
            registry.unregister(key.name);
        },
        registerKeyBatch(keys, successCallback, errorCallback) {
            privileges.check('tizen.tvinputdevice');
            try {
                expectArray(keys);
                for (const keyName of keys) {
                    lookupKey(keyName);
                }
            } catch (error) {
                nextTick(() => {
                    if (errorCallback) {
                        errorCallback(error);
                    }
                });
                return;
            }
            for (const keyName of keys) {
                registry.register(findKeyByName(expectString(keyName))!.name);
            }
            nextTick(() => {
                if (successCallback) {
                    successCallback();
                }
            });
        },
        unregisterKeyBatch(keys, successCallback, errorCallback) {
            privileges.check('tizen.tvinputdevice');
            try {
                expectArray(keys);
                for (const keyName of keys) {
                    lookupKey(keyName);
                }
            } catch (error) {
                nextTick(() => {
                    if (errorCallback) {
                        errorCallback(error);
                    }
                });
                return;
            }
            for (const keyName of keys) {
                registry.unregister(findKeyByName(expectString(keyName))!.name);
            }
            nextTick(() => {
                if (successCallback) {
                    successCallback();
                }
            });
        }
    };
}

export const DEFAULT_KEY_NAMES = DEFAULT_KEYS.map(([name]) => name);
export const ALL_KEY_NAMES = ALL_KEYS.map((key) => key.name);
export { ALL_KEYS };
