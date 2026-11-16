import { INVALID_VALUES_ERR, TYPE_MISMATCH_ERR, WebAPIException, expectArray } from './errors.js';
import { defineFrozen } from './env.js';
import { ALL_KEYS, DEFAULT_KEY_NAMES } from './keys.js';

const GENERATE_KEY_NAMES = [
    'VolumeUp', 'VolumeDown', 'VolumeMute', 'ChannelUp', 'ChannelDown',
    'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Enter', 'Back',
    'GamepadHomekey', 'MediaTrackPrevious', 'MediaRewind', 'MediaTrackNext',
    'MediaFastForward', 'Search', 'Exit', 'Source', 'MultiView', 'SmartHub',
    'ARKVolume', 'PlayBackGame', 'More'
];

export interface AppCommonRegistryBridge {
    register(name: string): void;
    unregister(name: string): void;
    isRegistered(name: string): boolean;
}

export function createAppCommon(
    registry: AppCommonRegistryBridge,
    foregroundAppId: () => string
): Record<string, unknown> {
    function validateNames(value: unknown): string[] {
        const names = expectArray(value);
        const valid = names.every((name) => typeof name === 'string');
        if (!valid) {
            return [];
        }
        return names as string[];
    }

    function knownName(name: string): boolean {
        return DEFAULT_KEY_NAMES.indexOf(name) !== -1 || ALL_KEYS.some((key) => key.name === name);
    }

    return {
        AppCommonScreenSaverState: Object.freeze({ SCREEN_SAVER_OFF: 0, SCREEN_SAVER_ON: 1 }),
        AppcommonTarget: Object.freeze({ CONFIG_LAST_SOURCE: 0 }),
        AppcommonAction: Object.freeze({ CONFIG_LAUNCH: 0 }),
        AppCommonRecommendedWordsType: Object.freeze({ RECOMMENDED_WORDS_DISABLE: 0, RECOMMENDED_WORDS_ENABLE: 1 }),
        AppCommonGenerateKeyName: Object.freeze(GENERATE_KEY_NAMES.reduce<Record<string, string>>((acc, name) => {
            acc[name] = name;
            return acc;
        }, {})),
        getVersion() {
            return '2.2.0';
        },
        getUuid() {
            return 'K3DYMEHP4CWNH';
        },
        getForegroundAppId() {
            return foregroundAppId();
        },
        setScreenSaver(state: unknown, onSuccess: unknown, onError: unknown) {
            if (typeof state !== 'number') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'state must be a number');
            }
            if (state !== 0 && state !== 1) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown screensaver state: ${state}`);
            }
            if (typeof onSuccess !== 'function' || typeof onError !== 'function') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'callbacks must be functions');
            }
            (onSuccess as () => void)();
            return undefined;
        },
        getSpecialSupportedKeys() {
            return ALL_KEYS
                .filter((key) => !key.defaultDelivered)
                .map((key) => defineFrozen({}, { name: key.name, code: key.code }));
        },
        registerKey(names: unknown) {
            const keys = validateNames(names);
            if (keys.length === 0 || !keys.every(knownName)) {
                return false;
            }
            for (const name of keys) {
                registry.register(name);
            }
            return true;
        },
        unregisterKey(names: unknown) {
            const keys = validateNames(names);
            if (keys.length === 0 || !keys.every(knownName)) {
                return false;
            }
            for (const name of keys) {
                registry.unregister(name);
            }
            return true;
        },
        generateKey(name: unknown) {
            if (typeof name !== 'string' || GENERATE_KEY_NAMES.indexOf(name) === -1) {
                return false;
            }
            return true;
        },
        setEpopAppWindow(value: unknown) {
            if (value === null || value === undefined) {
                return false;
            }
            if (typeof value !== 'number') {
                return Boolean(value) ? false : true;
            }
            return true;
        },
        setIMERecommendedWords(value: unknown) {
            if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
                return false;
            }
            return true;
        },
        setIMERecommendedWordsType(value: unknown) {
            return value === 0 || value === 1;
        },
        setIMEPosition(a: unknown, b: unknown, c: unknown) {
            void a;
            void b;
            void c;
            return undefined;
        },
        requestTvContextTask(target: unknown, action: unknown) {
            return target === 0 && action === 0;
        }
    };
}

