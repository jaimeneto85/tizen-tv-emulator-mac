import type { DeviceProfile } from '@tvemu/protocol';
import { INVALID_VALUES_ERR, TYPE_MISMATCH_ERR, UNKNOWN_ERR, WebAPIException, expectFunction, expectString } from './errors.js';
import { defineFrozen, nextTick } from './env.js';

const PROPERTY_IDS = [
    'BUILD', 'CPU', 'DISPLAY', 'DEVICE_ORIENTATION', 'LOCALE', 'NETWORK',
    'WIFI_NETWORK', 'ETHERNET_NETWORK', 'STORAGE', 'MEMORY', 'VIDEOSOURCE', 'PERIPHERAL'
] as const;

type PropertyId = typeof PROPERTY_IDS[number];

export class SystemInfoModule {
    private readonly listeners = new Map<number, { id: PropertyId; callback: (value: unknown) => void }>();
    private nextListenerId = 10000000;
    private onlineHandlersInstalled = false;

    constructor(private readonly profileProvider: () => DeviceProfile) {}

    buildAPI(): Record<string, unknown> {
        const module = this;
        return {
            getPropertyValue(propertyId: unknown, successCallback: unknown, errorCallback?: unknown) {
                const id = module.resolvePropertyId(propertyId);
                expectFunction(successCallback);
                nextTick(() => {
                    try {
                        (successCallback as (value: unknown) => void)(module.buildProperty(id));
                    } catch (error) {
                        if (errorCallback) {
                            (errorCallback as (error: unknown) => void)(error);
                        }
                    }
                });
                return undefined;
            },
            getPropertyValueArray(propertyId: unknown, successCallback: unknown, errorCallback?: unknown) {
                const id = module.resolvePropertyId(propertyId);
                expectFunction(successCallback);
                nextTick(() => {
                    try {
                        (successCallback as (value: unknown) => void)(module.buildProperty(id));
                    } catch (error) {
                        if (errorCallback) {
                            (errorCallback as (error: unknown) => void)(error);
                        }
                    }
                });
                return undefined;
            },
            addPropertyValueChangeListener(propertyId: unknown, callback: unknown) {
                const id = module.resolvePropertyId(propertyId);
                expectFunction(callback);
                module.ensureOnlineHandlers();
                const listenerId = module.nextListenerId;
                module.nextListenerId += 1;
                module.listeners.set(listenerId, { id, callback: callback as (value: unknown) => void });
                nextTick(() => {
                    const entry = module.listeners.get(listenerId);
                    if (entry) {
                        entry.callback(module.buildProperty(entry.id));
                    }
                });
                return listenerId;
            },
            addPropertyValueArrayChangeListener(propertyId: unknown, callback: unknown) {
                module.resolvePropertyId(propertyId);
                expectFunction(callback);
                return undefined;
            },
            removePropertyValueChangeListener(listenerId: unknown) {
                if (typeof listenerId !== 'number' || !module.listeners.delete(listenerId)) {
                    throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${String(listenerId)}`);
                }
                return undefined;
            },
            getCapability(key: unknown) {
                const capabilityKey = expectString(key);
                if (capabilityKey.indexOf('http://tizen.org/') === -1) {
                    throw new WebAPIException(UNKNOWN_ERR, `invalid capability key: ${capabilityKey}`);
                }
                return module.capability(capabilityKey);
            },
            getCapabilities() {
                return module.capabilitiesObject();
            },
            getCount(propertyId: unknown) {
                const id = module.resolvePropertyId(propertyId);
                return Object.keys(module.buildProperty(id)).length;
            },
            getTotalMemory() {
                return 2147483648;
            },
            getAvailableMemory() {
                return 1073741824;
            }
        };
    }

    private resolvePropertyId(propertyId: unknown): PropertyId {
        const id = expectString(propertyId);
        const index = (PROPERTY_IDS as readonly string[]).indexOf(id);
        if (index === -1) {
            throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown property: ${id}`);
        }
        return PROPERTY_IDS[index] as PropertyId;
    }

    private ensureOnlineHandlers(): void {
        if (this.onlineHandlersInstalled) {
            return;
        }
        this.onlineHandlersInstalled = true;
        window.addEventListener('online', () => this.notifyNetworkListeners());
        window.addEventListener('offline', () => this.notifyNetworkListeners());
    }

    private notifyNetworkListeners(): void {
        for (const entry of Array.from(this.listeners.values())) {
            if (entry.id === 'NETWORK') {
                try {
                    entry.callback(this.buildProperty('NETWORK'));
                } catch {
                    void 0;
                }
            }
        }
    }

    private buildProperty(id: PropertyId): Record<string, unknown> {
        const profile = this.profileProvider();
        switch (id) {
            case 'BUILD':
                return defineFrozen({}, {
                    model: profile.model,
                    manufacturer: 'Samsung',
                    buildVersion: profile.firmware
                });
            case 'CPU':
                return defineFrozen({}, { load: 0.1 });
            case 'DISPLAY':
                return defineFrozen({}, {
                    resolutionWidth: profile.width,
                    resolutionHeight: profile.height,
                    dotsPerInchWidth: 316,
                    dotsPerInchHeight: 316,
                    physicalWidth: 0,
                    physicalHeight: 0,
                    brightness: 1
                });
            case 'DEVICE_ORIENTATION':
                return defineFrozen({}, { status: 'LANDSCAPE_PRIMARY', isAutoRotation: false });
            case 'LOCALE':
                return defineFrozen({}, {
                    language: profile.locale.replace('-', '_'),
                    country: profile.country
                });
            case 'NETWORK':
                return defineFrozen({}, { networkType: navigator.onLine ? 'ETHERNET' : 'NONE' });
            case 'WIFI_NETWORK':
                return defineFrozen({}, {
                    status: 'OFF',
                    ssid: 'Tizen WiFi',
                    ipAddress: '192.168.0.1',
                    ipv6Address: '2001:db8:85a3:0:0:0:70:7334',
                    signalStrength: 0
                });
            case 'ETHERNET_NETWORK':
                return defineFrozen({}, {
                    status: navigator.onLine ? 'ON' : 'OFF',
                    ipAddress: '192.168.0.2',
                    ipv6Address: '2001:db8:85a3:0:0:0:70:7334',
                    macAddress: '00:0B:2F:33:7B:4A',
                    gateway: '192.168.0.1',
                    dns: '8.8.8.8',
                    dhcpServer: '192.168.0.1'
                });
            case 'STORAGE':
                return defineFrozen({}, {
                    units: [defineFrozen({}, {
                        type: 'INTERNAL',
                        capacity: 16000000000,
                        availableCapacity: 12000000000,
                        isRemovable: false
                    })]
                });
            case 'MEMORY':
                return defineFrozen({}, { availableCapacity: 1073741824, totalCapacity: 2147483648 });
            case 'VIDEOSOURCE':
                return defineFrozen({}, { type: 'TV', connected: true });
            case 'PERIPHERAL':
                return defineFrozen({}, { isVideoOutputOn: false });
        }
    }

    private capability(key: string): unknown {
        const profile = this.profileProvider();
        const table: Record<string, unknown> = {
            'http://tizen.org/feature/platform.core.api.version': profile.tizenVersion,
            'http://tizen.org/feature/platform.core.cpu.arch': 'x86',
            'http://tizen.org/feature/platform.core.fpu.arch': 'ssse3',
            'http://tizen.org/feature/platform.native.api.version': profile.tizenVersion,
            'http://tizen.org/feature/platform.version': profile.tizenVersion,
            'http://tizen.org/feature/platform.web.api.version': profile.tizenVersion,
            'http://tizen.org/feature/profile': 'tv',
            'http://tizen.org/feature/screen.width': profile.width,
            'http://tizen.org/feature/screen.height': profile.height,
            'http://tizen.org/feature/screen.size.normal': true,
            'http://tizen.org/feature/screen.size.1920.1080': true,
            'http://tizen.org/feature/wifi': true,
            'http://tizen.org/feature/usbhost': true,
            'http://tizen.org/feature/opengles': true,
            'http://tizen.org/feature/opengles.version.2_0': true,
            'http://tizen.org/feature/multimedia.transcoder': true,
            'http://tizen.org/system/duid': profile.duid,
            'http://tizen.org/system/platform.name': 'Tizen',
            'http://tizen.org/system/model_name': profile.model,
            'http://tizen.org/system/tizenid': profile.duid
        };
        if (key in table) {
            return table[key];
        }
        return false;
    }

    private capabilitiesObject(): Record<string, unknown> {
        const profile = this.profileProvider();
        return defineFrozen({}, {
            bluetooth: true,
            nfc: false,
            nfcReservedPush: false,
            multiTouchCount: 0,
            inputKeyboard: false,
            inputKeyboardLayout: false,
            wifi: true,
            wifiDirect: false,
            opengles: true,
            openglestextureFormat: '',
            openglesVersion1_1: true,
            openglesVersion2_0: true,
            fmRadio: false,
            platformVersion: profile.tizenVersion,
            webApiVersion: profile.tizenVersion,
            nativeApiVersion: profile.tizenVersion,
            platformName: 'Tizen',
            cameras: false,
            location: false,
            locationGps: false,
            locationWps: false,
            microphone: false,
            usbHost: true,
            usbAccessory: false,
            screenOutputRca: false,
            screenOutputHdmi: true,
            platformCoreCpuArch: 'x86',
            platformCoreFpuArch: 'ssse3',
            sipVoip: false,
            duid: profile.duid,
            speechRecognition: false,
            speechSynthesis: false,
            accelerometer: false,
            gyroscope: false,
            push: false,
            telephony: false,
            telephonyMms: false,
            telephonySms: false,
            screenSizeNormal: true,
            screenSize480_800: false,
            screenSize720_1280: false,
            autoRotation: false,
            shellAppWidget: false,
            visionRecognition: false,
            visionFaceRecognition: false,
            visionImageRecognition: false,
            visionQrCodeRecognition: false,
            secureElement: false,
            nativeOspCompatible: false,
            profile: 'tv'
        });
    }
}
