import type { AppManifest, DeviceProfile } from '@tvemu/protocol';

export const DEFAULT_PROFILE: DeviceProfile = {
    name: 'default',
    label: 'Tizen TV (1920x1080)',
    tizenVersion: '2.4',
    modelYear: 2018,
    chromiumMilestone: 69,
    userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.0 Safari/537.36',
    width: 1920,
    height: 1080,
    cpuThrottle: 1,
    model: 'UKS9000',
    modelCode: '16_JAZZM_UHD',
    firmware: 'T-HKPAKUC-0000.0',
    duid: 'SDKHUWUR7SQ24',
    locale: 'en-US',
    country: 'US'
};

interface TvemuWindow {
    __tvemuProfile?: DeviceProfile;
    __tvemuManifest?: AppManifest;
    __tvemuSend?: (json: string) => void;
    __tvemuReceive?: (json: string) => void;
}

export function hostWindow(): Window & TvemuWindow {
    return window as Window & TvemuWindow;
}

export function currentProfile(): DeviceProfile {
    const injected = hostWindow().__tvemuProfile;
    if (!injected) {
        return DEFAULT_PROFILE;
    }
    return { ...DEFAULT_PROFILE, ...injected };
}

export function currentManifest(): AppManifest | null {
    const injected = hostWindow().__tvemuManifest;
    if (!injected || typeof injected.appId !== 'string') {
        return null;
    }
    return injected;
}

export function bridgeSendFunction(): ((json: string) => void) | null {
    const send = hostWindow().__tvemuSend;
    return typeof send === 'function' ? send : null;
}

export function nextTick(fn: () => void): void {
    setTimeout(fn, 0);
}

export function makeContextId(): string {
    let id = '';
    const alphabet = '0123456789abcdef';
    for (let i = 0; i < 16; i += 1) {
        id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return id;
}

export function defineFrozen<T>(target: object, values: T): T {
    for (const key of Object.keys(values as object)) {
        const value = (values as Record<string, unknown>)[key];
        Object.defineProperty(target, key, { value, writable: false, configurable: false, enumerable: true });
    }
    Object.preventExtensions(target);
    return target as T;
}
