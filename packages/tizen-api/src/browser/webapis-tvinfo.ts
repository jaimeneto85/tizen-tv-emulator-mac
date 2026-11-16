import { INVALID_VALUES_ERR, TYPE_MISMATCH_ERR, WebAPIException, expectFunction, expectNumber } from './errors.js';

const MENU_KEYS: Record<string, number | string> = {
    CAPTION_ONOFF_KEY: 0,
    CAPTION_MODE_KEY: 1,
    CAPTION_FONT_SIZE_KEY: 2,
    CAPTION_FONT_STYLE_KEY: 3,
    CAPTION_FG_COLOR_KEY: 4,
    CAPTION_FG_OPACITY_KEY: 5,
    CAPTION_BG_COLOR_KEY: 6,
    CAPTION_BG_OPACITY_KEY: 7,
    CAPTION_EDGE_TYPE_KEY: 8,
    CAPTION_EDGE_COLOR_KEY: 9,
    CAPTION_WINDOW_COLOR_KEY: 10,
    CAPTION_WINDOW_OPACITY_KEY: 11,
    ACCESSIBILITY_FORCUS_ZOOM: 12,
    ACCESSIBILITY_HIGH_CONTRAST: 13,
    SMARTHUB_CHANNEL_BOUND_APPS_TICKER: 14,
    VOICE_GUIDE_KEY: 15,
    SUBTITLE_ONOFF_KEY: 16,
    SUBTITLE_MODE_KEY: 17,
    PRIMARY_AUDIO_LANGUAGE_KEY: 18,
    SECONDARY_AUDIO_LANGUAGE_KEY: 19,
    ACCESSIBILITY_VOICE_GUIDE_SPEED: 20,
    CAPTION_STYLE_KEY: 21,
    CAPTION_LANGUAGE_KEY: 22,
    UI_SIZE: 'UI_SIZE',
    UI_TRANSPARENCY: 'UI_TRANSPARENCY',
    UI_TIMEOUT: 'UI_TIMEOUT',
    MOVING_TEXT_AND_IMAGE: 'MOVING_TEXT_AND_IMAGE'
};

function buildMenuValues(): Record<string, number | string> {
    const values: Record<string, number | string> = {
        OFF: 0,
        ON: 1,
        CAPTION_OFF: 0,
        CAPTION_ON: 1,
        CAPTION_MODE_DEFAULT: 0,
        CAPTION_MODE_SERVICE1: 1,
        CAPTION_MODE_SERVICE2: 2,
        CAPTION_MODE_SERVICE3: 3,
        CAPTION_MODE_SERVICE4: 4,
        CAPTION_MODE_SERVICE5: 5,
        CAPTION_MODE_SERVICE6: 6,
        CAPTION_MODE_CC1: 7,
        CAPTION_MODE_CC2: 8,
        CAPTION_MODE_CC3: 9,
        CAPTION_MODE_CC4: 10,
        CAPTION_MODE_TEXT1: 11,
        CAPTION_MODE_TEXT2: 12,
        CAPTION_MODE_TEXT3: 13,
        CAPTION_MODE_TEXT4: 14,
        CAPTION_SIZE_DEFAULT: 0,
        CAPTION_SIZE_SMALL: 1,
        CAPTION_SIZE_STANDARD: 2,
        CAPTION_SIZE_LARGE: 3,
        CAPTION_SIZE_EXTRA_LARGE: 4,
        CAPTION_SIZE_EXTRA_SMALL: 5,
        CAPTION_FONT_DEFAULT: 0,
        CAPTION_FONT_STYLE0: 1,
        CAPTION_FONT_STYLE1: 2,
        CAPTION_FONT_STYLE2: 3,
        CAPTION_FONT_STYLE3: 4,
        CAPTION_FONT_STYLE4: 5,
        CAPTION_FONT_STYLE5: 6,
        CAPTION_FONT_STYLE6: 7,
        CAPTION_FONT_STYLE7: 8,
        CAPTION_COLOR_DEFAULT: 0,
        CAPTION_COLOR_WHITE: 1,
        CAPTION_COLOR_BLACK: 2,
        CAPTION_COLOR_RED: 3,
        CAPTION_COLOR_GREEN: 4,
        CAPTION_COLOR_BLUE: 5,
        CAPTION_COLOR_YELLOW: 6,
        CAPTION_COLOR_MAGENTA: 7,
        CAPTION_COLOR_CYAN: 8,
        CAPTION_OPACITY_SOLID: 0,
        CAPTION_OPACITY_FLASH: 1,
        CAPTION_OPACITY_TRANSLUCENT: 2,
        CAPTION_OPACITY_TRANSPARENT: 3,
        CAPTION_OPACITY_DEFAULT: 4,
        CAPTION_OPACITY_HIGHLY_TRANSLUCENT: 5,
        CAPTION_OPACITY_SLIGHTLY_TRANSLUCENT: 6,
        CAPTION_EDGE_NONE: 0,
        CAPTION_EDGE_RAISED: 1,
        CAPTION_EDGE_DEPRESSED: 2,
        CAPTION_EDGE_UNIFORM: 3,
        CAPTION_EDGE_DROP_SHADOWED: 4,
        SUBTITLE_NORMAL: 0,
        SUBTITLE_HEARING_IMMPEARED: 1,
        CAPTION_STYLE_DEFAULT: 0,
        CAPTION_STYLE_BOLD: 1,
        CAPTION_STYLE_ITALIC: 2,
        VOICEGUIDE_SPEED_VERY_FAST: 'VERY_FAST',
        VOICEGUIDE_SPEED_FAST: 'FAST',
        VOICEGUIDE_SPEED_NORMAL: 'NORMAL',
        VOICEGUIDE_SPEED_SLOW: 'SLOW',
        VOICEGUIDE_SPEED_VERY_SLOW: 'VERY_SLOW',
        UI_TIMEOUT_DEFAULT: 0,
        UI_TIMEOUT_1MINUTE: 1,
        UI_TIMEOUT_2MINUTES: 2,
        UI_TIMEOUT_5MINUTES: 5,
        UI_TIMEOUT_10MINUTES: 10
    };
    const codes = [
        'AFR', 'AKA', 'AMH', 'ARA', 'ASM', 'BEN', 'BUL', 'CAT', 'CHI', 'CMN', 'CZE', 'DAG', 'DAN', 'DUT',
        'ENG', 'EST', 'EUS', 'EWE', 'FIN', 'FRE', 'GAA', 'GER', 'GLA', 'GLG', 'GOS', 'GRE', 'GUJ', 'HAU',
        'HEB', 'HIN', 'HRV', 'HUN', 'IGB', 'IND', 'IRI', 'ITA', 'JPN', 'KAN', 'KOK', 'KOR', 'LAV', 'LIT',
        'MAL', 'MAO', 'MAR', 'MSA', 'NBL', 'NOR', 'NSO', 'NZI', 'ORI', 'PAN', 'PER', 'POL', 'POR', 'QAA',
        'QAB', 'QAC', 'ROM', 'RUS', 'SLK', 'SOT', 'SPA', 'SRP', 'SSW', 'SWA', 'SWE', 'TAM', 'TEL', 'THA',
        'TSN', 'TSO', 'TUR', 'TWI', 'UKR', 'VAL', 'VEN', 'VIE', 'WEL', 'XHO', 'XSM', 'YOR', 'YUE', 'ZHO', 'ZUL'
    ];
    for (const code of codes) {
        values[`AUDIO_LANGUAGE_CODE_${code}`] = code;
    }
    return values;
}

function resolveMenuKey(key: unknown): number | string {
    expectNumber(key);
    const resolved = Number(key);
    const isKey = Object.keys(MENU_KEYS).some((name) => MENU_KEYS[name] === resolved);
    if (!isKey || resolved === 14) {
        throw new WebAPIException(INVALID_VALUES_ERR, `unknown menu key: ${resolved}`);
    }
    return resolved;
}

export function createWebapisTVInfo(): Record<string, unknown> {
    const stored = new Map<number, unknown>();
    return {
        TvInfoKey: Object.freeze({
            TV_VIEWER_BG_EXECUTABLE: 0,
            SMART_RC_BATTERY: 'SMART_RC_BATTERY',
            BOARD_TEMPERATURE: 'BOARD_TEMPERATURE'
        }),
        TvInfoValue: Object.freeze({ TV_VIEWER_BG_NOT_EXECUTABLE: 0, TV_VIEWER_BG_EXECUTABLE: 1 }),
        TvInfoMenuKey: Object.freeze({ ...MENU_KEYS }),
        TvInfoMenuValue: Object.freeze(buildMenuValues()),
        getVersion() {
            return '1.0';
        },
        getMenuValue(key: unknown) {
            const resolved = resolveMenuKey(key);
            if (stored.has(Number(resolved))) {
                return stored.get(Number(resolved));
            }
            if (resolved === 18 || resolved === 19) {
                return 'AFR';
            }
            return undefined;
        },
        setMenuValue(key: unknown, value: unknown, onSuccess: unknown, onError: unknown) {
            const resolved = resolveMenuKey(key);
            expectNumber(value);
            if (typeof onSuccess !== 'function' || typeof onError !== 'function') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'callbacks must be functions');
            }
            stored.set(Number(resolved), value);
            (onSuccess as () => void)();
            return undefined;
        },
        addCaptionChangeListener(key: unknown, callback: unknown) {
            try {
                resolveMenuKey(key);
                expectFunction(callback);
            } catch {
                return 0;
            }
            return 1;
        },
        removeCaptionChangeListener(key: unknown) {
            resolveMenuKey(key);
            return undefined;
        },
        isTvsPicSizeResized() {
            return true;
        },
        showCaption(value: unknown) {
            if (typeof value !== 'boolean') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'value must be a boolean');
            }
            return undefined;
        },
        registerInAppCaptionControl(value: unknown) {
            if (typeof value !== 'boolean') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'value must be a boolean');
            }
            return undefined;
        },
        getTvInfoValue(key: unknown) {
            if (typeof key !== 'number') {
                return 1;
            }
            return 0;
        },
        addTvInfoChangeListener(key: unknown, callback: unknown) {
            if (typeof key !== 'number' || typeof callback !== 'function') {
                return 1;
            }
            return 0;
        },
        removeTvInfoChangeListener(key: unknown) {
            expectNumber(key);
            return undefined;
        }
    };
}

