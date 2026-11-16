import { NOT_SUPPORTED_ERR, TYPE_MISMATCH_ERR, WebAPIException } from './errors.js';

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
}

function isString(value: unknown): boolean {
    return typeof value === 'string';
}

export function createAvInfo(): Record<string, unknown> {
    return {
        SCREEN_MODE_WIDESCREEN: 0,
        SCREEN_MODE_SUPERWIDESCREEN: 1,
        SCREEN_MODE_PANORAMA: 2,
        AvInfoDigitalCompMode: Object.freeze({ DOLBY_DIGITAL_COMP_MODE_LINE: 0, DOLBY_DIGITAL_COMP_MODE_RF: 1 }),
        AvInfoSoundOutputMode: Object.freeze({
            SOUND_TV_OUTPUT_SPEAKER: 0,
            SOUND_TV_OUTPUT_EXTERNAL_SPEAKER: 1,
            SOUND_TV_OUTPUT_RECEIVER: 2,
            SOUND_TV_OUTPUT_SOUND_SHARE: 3,
            SOUND_TV_OUTPUT_MULTIROOM_LINK: 4,
            SOUND_TV_OUTPUT_BT_HEADSET: 5,
            SOUND_TV_OUTPUT_DUAL_BT_SPK: 6,
            SOUND_TV_OUTPUT_MAX: 7,
            SOUND_TV_OUTPUT_DUAL_RECEIVER_SPK: 8,
            SOUND_TV_OUTPUT_DUAL_EXTERNAL_SPK: 9,
            SOUND_TV_OUTPUT_DUAL_MULTIROOM_SPK: 10
        }),
        getVersion() {
            return '1.0';
        },
        getDolbyDigitalCompMode() {
            throw new WebAPIException(NOT_SUPPORTED_ERR, 'Dolby Digital compensation mode is not supported');
        },
        isHdrTvSupport() {
            throw new WebAPIException(NOT_SUPPORTED_ERR, 'HDR is not supported');
        },
        getSpeakerSelection() {
            return 0;
        },
        setSpeakerSelection(value: unknown) {
            return isNumber(value) && value >= 0 && value <= 7;
        },
        setWideScreenMode(a: unknown, b: unknown) {
            return a !== null && a !== undefined && b !== null && b !== undefined;
        },
        getBrightness() {
            return true;
        },
        getContrast() {
            return 0;
        },
        getColorStrength() {
            return 0;
        },
        getColorTint() {
            return 0;
        },
        getWhiteBalance() {
            return 0;
        },
        getSharpness() {
            return 0;
        },
        getBacklight() {
            return 0;
        },
        getHdmiHdcpType() {
            return 0;
        },
        setBrightness(value: unknown) {
            return isNumber(value);
        },
        setContrast(value: unknown) {
            return isNumber(value);
        },
        setColorStrength(value: unknown) {
            return isNumber(value);
        },
        setColorTint(value: unknown) {
            return isNumber(value);
        },
        setSharpness(value: unknown) {
            return isNumber(value);
        },
        setBacklight(value: unknown) {
            return isNumber(value);
        },
        setWhiteBalance(a: unknown, b: unknown, c: unknown, d: unknown, e: unknown, f: unknown) {
            return isNumber(a) && isNumber(b) && isNumber(c) && isNumber(d) && isNumber(e) && isNumber(f);
        },
        getColorSpaceCustomRGB(value: unknown) {
            return isString(value);
        },
        setColorEffect(value: unknown) {
            return isString(value);
        },
        setSubAmpMode(value: unknown) {
            return isString(value);
        },
        setColorSpaceCustomRGB(value: unknown, r: unknown, g: unknown, b: unknown) {
            return isString(value) && isNumber(r) && isNumber(g) && isNumber(b);
        },
        resetPictureSettings() {
            return true;
        },
        setHdmiActivateChangeListener(callback: unknown) {
            return typeof callback === 'function';
        },
        unsetHdmiActivateChangeListener() {
            return true;
        },
        getHdmiHighestResolution() {
            return 'hdmi';
        },
        setAiScalerValue(value: unknown) {
            return value !== null && value !== undefined;
        },
        getEnergySaving() {
            return 'LOW';
        },
        setEnergySaving(value: unknown) {
            if (value === null || value === undefined) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'value must not be null');
            }
            return undefined;
        },
        setEcoSensor(value: unknown) {
            if (value === null || value === undefined) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'value must not be null');
            }
            return undefined;
        },
        set8kUpscalingDemo(value: unknown) {
            if (value === null || value === undefined) {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'value must not be null');
            }
            return undefined;
        }
    };
}
