import { INVALID_VALUES_ERR, TYPE_MISMATCH_ERR, WebAPIException, expectOptionalFunction, expectString } from './errors.js';

export function createAdInfo(): Record<string, unknown> {
    return {
        getVersion() {
            return '1.0';
        },
        getTIFA() {
            return 'TIFA Information';
        },
        isLATEnabled() {
            return true;
        }
    };
}

export function createSso(): Record<string, unknown> {
    const noop = (): undefined => undefined;
    return {
        SsoLoginState: Object.freeze({ SSO_NOT_LOGIN: 0, SSO_LOGIN: 1 }),
        SsoTermsAgreementState: Object.freeze({ SSO_NOT_AGREE: 0, SSO_AGREE: 1 }),
        getVersion() {
            return '3.4';
        },
        getSsoState: noop,
        getGuid: noop,
        getLoginStatus: noop,
        getLoginUid: noop,
        showAccountView: noop,
        showAccountViewWithTransparent: noop,
        getOspAccessToken: noop,
        showCreateAccountView: noop,
        showTermsPage: noop,
        getTermsAgreementState: noop,
        getPartnerAccountMappingList: noop,
        addPartnerAccountMappingInfo: noop,
        removePartnerAccountMappingInfo: noop,
        requestAuthCodeForEffortlessLogin: noop,
        requestUserJsonInfo: noop,
        subscribeLoginState: noop,
        unsubscribeLoginState: noop
    };
}

export function createBilling(): Record<string, unknown> {
    const noop = (): undefined => undefined;
    return {
        getVersion() {
            return '1.0';
        },
        applyInvoice: noop,
        verifyInvoice: noop,
        isServiceAvailable: noop,
        getServiceCountryAvailability: noop,
        getUserPurchaseList: noop,
        getProductsList: noop,
        cancelSubscription: noop,
        showRegisterPromotionalCode: noop,
        showPaymentInfo: noop,
        showRegisterCreditCard: noop,
        showPurchaseHistory: noop,
        buyItem: noop
    };
}

export function createDrmInfo(): Record<string, unknown> {
    return {
        getVersion() {
            return 'dummy value: 1.0';
        },
        getSupportedKeySystems(...args: unknown[]) {
            if (args.length > 2) {
                throw new WebAPIException(INVALID_VALUES_ERR, 'too many arguments');
            }
            return 'dummy value';
        },
        isKeySystemSupported(...args: unknown[]) {
            if (args.length > 1) {
                throw new WebAPIException(INVALID_VALUES_ERR, 'too many arguments');
            }
            return 'dummy value';
        },
        getEsn() {
            return 'dummy value: Netflix ESN';
        },
        getSdiId() {
            return 'dummy value: SDI ID';
        },
        nvInvoke() {
            return 'dummy value';
        },
        SecureStorage() {
            return {
                writeData() {
                    return 0;
                },
                readData() {
                    return 'OK';
                },
                deleteData() {
                    return 0;
                }
            };
        }
    };
}

export function createSystemControl(): Record<string, unknown> {
    const noop = (): undefined => undefined;
    return {
        getVersion() {
            return '1.0';
        },
        getSerialNumber() {
            return '1234567890';
        },
        getFirmwareVersion() {
            return '1234567890';
        },
        getScreenLampSchedule() {
            return { use: 'ON', firstTime: '08:55', level1: 30, secondTime: '16:50', level2: 80 };
        },
        getPanelMute() {
            return 'ON';
        },
        getSafetyLock() {
            return 'ON';
        },
        getMessageDisplay() {
            return 'ON';
        },
        getIRLock() {
            return 'ON';
        },
        getButtonLock() {
            return 'ON';
        },
        getAutoPowerOn() {
            return 'ON';
        },
        getOnScreenMenuOrientation() {
            return 'LANDSCAPE';
        },
        getSourceOrientation() {
            return 'LANDSCAPE';
        },
        getPCConnection() {
            return 'RJ45';
        },
        getCustomAppInfo() {
            return { downloadServerAddress: 'http://testserver/testwebapp/check', connectionTimeout: '30SEC' };
        },
        getMagicinfoServerInfo() {
            return { ssl: 'http', address: '100.43.33.55', port: '8080' };
        },
        isCustomAppDownloaded() {
            return true;
        },
        captureScreen: noop,
        rebootDevice: noop,
        updateFirmware: noop,
        setUpdateFirmwareListener: noop,
        unsetUpdateFirmwareListener: noop,
        setScreenLampSchedule: noop,
        setPanelMute: noop,
        setSafetyLock: noop,
        setPCConnection: noop,
        setMessageDisplay: noop,
        deleteAppPrivateInfo: noop,
        setCustomAppInfo: noop,
        setIRLock: noop,
        setButtonLock: noop,
        setAutoPowerOn: noop,
        setMagicinfoServerInfo: noop,
        setCustomAppDownloadListener: noop,
        unsetCustomAppDownloadListener: noop,
        startNodeServer: noop,
        stopNodeServer: noop
    };
}

export function createTimer(): Record<string, unknown> {
    const noop = (): undefined => undefined;
    return {
        getVersion() {
            return '1.0';
        },
        getCurrentTime() {
            return { year: 2022, month: 12, day: 15, hour: 8, minute: 55, second: 43 };
        },
        getOnTimer(id: unknown) {
            return { timerID: 'TIMER1', time: '19:50', setup: 'TIMER_ONCE', volume: 10 };
        },
        getOffTimer(id: unknown) {
            return { timerID: 'TIMER1', time: '19:50', setup: 'TIMER_ONCE' };
        },
        getTimerHoliday(id: unknown) {
            return 'ON';
        },
        getNTP() {
            return { use: 'ON', address: '10.89.10.13', timezone: 'Asia/Seoul' };
        },
        getDST() {
            return { mode: 'ON', start: '', end: '' };
        },
        getSystemTimeSyncTimeout() {
            return '30SEC';
        },
        setCurrentTime: noop,
        setOnTimer: noop,
        setOffTimer: noop,
        addHoliday: noop,
        deleteHoliday: noop,
        applyTimerHoliday: noop,
        setNTP: noop,
        setDST: noop,
        setSystemTimeSyncTimeout: noop
    };
}

export function createPreview(): Record<string, unknown> {
    let actionListener: ((data: string) => void) | null = null;
    return {
        getVersion() {
            return '1.0';
        },
        setPreviewData(jsonString: unknown, onSuccess: unknown, onError: unknown) {
            expectString(jsonString);
            expectOptionalFunction(onSuccess);
            expectOptionalFunction(onError);
            if (typeof onSuccess === 'function') {
                (onSuccess as (value: string) => void)('dummy value');
            }
            return undefined;
        },
        setActionDataEventListener(callback: unknown) {
            if (typeof callback !== 'function') {
                return 0;
            }
            actionListener = callback as (data: string) => void;
            actionListener('dummy value');
            return 1;
        },
        unActionDataEventListener() {
            actionListener = null;
            return undefined;
        }
    };
}

const WIDGET_PREFIX = 'tvemu.widgetdata.';

function hexEncode(text: string): string {
    let hex = '';
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i) & 0xff;
        hex += code < 16 ? `0${code.toString(16)}` : code.toString(16);
    }
    return hex;
}

function hexDecode(hex: string): string {
    let text = '';
    for (let i = 0; i + 1 < hex.length; i += 2) {
        text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    return text;
}

export function createWidgetData(): Record<string, unknown> {
    function slot(name: unknown): string {
        return WIDGET_PREFIX + (name === undefined || name === null ? '0' : expectString(name));
    }

    function mismatch(onError: unknown): void {
        if (typeof onError === 'function') {
            (onError as (error: unknown) => void)(new WebAPIException(TYPE_MISMATCH_ERR));
            return;
        }
        throw new WebAPIException(TYPE_MISMATCH_ERR);
    }

    return {
        getVersion() {
            return '1.0';
        },
        writeWidgetData(password: unknown, data: unknown, position: unknown, name: unknown, onSuccess: unknown, onError: unknown) {
            if (typeof password !== 'string' || typeof data !== 'string' || typeof position !== 'number' || typeof name !== 'string') {
                mismatch(onError);
                return undefined;
            }
            const stored = hexEncode(data);
            try {
                window.localStorage.setItem(slot(name), stored);
            } catch {
                return undefined;
            }
            if (typeof onSuccess === 'function') {
                (onSuccess as (value: string) => void)(stored);
            }
            return undefined;
        },
        readWidgetData(password: unknown, position: unknown, name: unknown, onSuccess: unknown, onError: unknown) {
            if (typeof password !== 'string' || typeof position !== 'number' || typeof name !== 'string') {
                mismatch(onError);
                return undefined;
            }
            let value: string | null = null;
            try {
                value = window.localStorage.getItem(slot(name));
            } catch {
                value = null;
            }
            if (typeof onSuccess === 'function') {
                (onSuccess as (value: string) => void)(value === null ? '' : hexDecode(value));
            }
            return undefined;
        },
        removeWidgetData(name: unknown, onSuccess: unknown, onError: unknown) {
            const key = slot(name);
            let value: string | null = null;
            try {
                value = window.localStorage.getItem(key);
                window.localStorage.removeItem(key);
            } catch {
                value = null;
            }
            if (value !== null && typeof onSuccess === 'function') {
                (onSuccess as (value: string) => void)(value);
            }
            return undefined;
        },
        read(onSuccess: unknown, onError: unknown) {
            if (typeof onSuccess !== 'function') {
                mismatch(onError);
                return undefined;
            }
            let value: string | null = null;
            try {
                value = window.localStorage.getItem(slot('0'));
            } catch {
                value = null;
            }
            (onSuccess as (value: string) => void)(value === null ? '' : hexDecode(value));
            return undefined;
        },
        write(data: unknown, onSuccess: unknown, onError: unknown) {
            if (typeof data !== 'string') {
                mismatch(onError);
                return undefined;
            }
            const stored = hexEncode(data);
            try {
                window.localStorage.setItem(slot('0'), stored);
            } catch {
                return undefined;
            }
            if (typeof onSuccess === 'function') {
                (onSuccess as (value: string) => void)(stored);
            }
            return undefined;
        },
        remove(onSuccess: unknown, onError: unknown) {
            let value: string | null = null;
            try {
                value = window.localStorage.getItem(slot('0'));
                window.localStorage.removeItem(slot('0'));
            } catch {
                value = null;
            }
            if (value !== null && typeof onSuccess === 'function') {
                (onSuccess as (value: string) => void)(value);
            }
            return undefined;
        }
    };
}

const AUDIO_CODECS = 'MPEG MPEG-H AC3 E-AC3 AC4 TrueHD Vorbis G2Cook AAC HE-AAC WMA ADPCM OPUS PCM';
const VIDEO_CODECS = 'MPEG1 MPEG2 MPEG4 H263 H264 HEVC VP8 VP9 RV WMV AVS AVS_PLUS MJPEG JPEG H264_MVC HEIC AVS2 EVC_VR360 H264_VR360 VP9_VR360 HEVC_SHVC AV1 AV1_VR360';

export function createWebapisSystemInfo(): Record<string, unknown> {
    return {
        isSupportedAudioCodec(name: unknown) {
            return typeof name === 'string' && new RegExp(name).test(AUDIO_CODECS);
        },
        isSupportedVideoCodec(name: unknown) {
            return typeof name === 'string' && new RegExp(name).test(VIDEO_CODECS);
        }
    };
}

export function webapisRootMethods(): Record<string, unknown> {
    const noop = (): undefined => undefined;
    return {
        loadPepperPluginScript: noop,
        loadPepperPlugin: noop,
        setLoadCallback: noop,
        loadCallback: noop,
        load: noop,
        unload: noop
    };
}

