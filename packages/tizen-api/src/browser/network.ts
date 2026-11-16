import { INVALID_VALUES_ERR, TYPE_MISMATCH_ERR, WebAPIException, expectFunction, expectString } from './errors.js';
import type { PrivilegeChecker } from './privileges.js';

export function createNetwork(privileges: PrivilegeChecker): Record<string, unknown> {
    const listeners = new Map<number, (state: number) => void>();
    let nextListenerId = 1;
    let dhcpOption60 = '';

    function notifyState(state: number): void {
        for (const listener of Array.from(listeners.values())) {
            try {
                listener(state);
            } catch {
                void 0;
            }
        }
    }

    function addListener(callback: unknown): number {
        privileges.check('webapis.network');
        expectFunction(callback);
        const id = nextListenerId;
        nextListenerId += 1;
        listeners.set(id, callback as (state: number) => void);
        try {
            (callback as (state: number) => void)(1);
        } catch {
            void 0;
        }
        return id;
    }

    function removeListener(id: unknown): void {
        if (typeof id !== 'number') {
            throw new WebAPIException(TYPE_MISMATCH_ERR, 'listener id must be a number');
        }
        if (!listeners.delete(id)) {
            throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${id}`);
        }
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => notifyState(4));
        window.addEventListener('offline', () => notifyState(5));
    }

    return {
        NetworkActiveConnectionType: Object.freeze({ DISCONNECTED: 0, WIFI: 1, CELLULAR: 2, ETHERNET: 3 }),
        NetworkIpMode: Object.freeze({ NONE: 0, STATIC: 1, DYNAMIC: 2, AUTO: 3, FIXED: 4, UNKNOWN: 5 }),
        NetworkWiFiSecurityMode: Object.freeze({ WEP: 1, WPA_PSK: 2, WPA2_PSK: 3, EAP: 4, NONE: 5, UNKNOWN: 6 }),
        NetworkWiFiEncryptionType: Object.freeze({ WEP: 1, TKIP: 2, AES: 3, TKIP_AES_MIXED: 4, NONE: 5, UNKNOWN: 6 }),
        NetworkState: Object.freeze({
            INTERNET_CONNECTED: 0,
            LAN_CABLE_ATTACHED: 1,
            LAN_CABLE_DETACHED: 2,
            LAN_CABLE_STATE_UNKNOWN: 3,
            GATEWAY_CONNECTED: 4,
            GATEWAY_DISCONNECTED: 5,
            WIFI_MODULE_STATE_ATTACHED: 6,
            WIFI_MODULE_STATE_DETACHED: 7,
            WIFI_MODULE_STATE_UNKNOWN: 8,
            INTERNET_DISCONNECTED: 9
        }),
        getVersion() {
            return '1.0';
        },
        isConnectedToGateway() {
            return navigator.onLine;
        },
        isConnectedToInternet() {
            return true;
        },
        getActiveConnectionType() {
            return 3;
        },
        getIpMode() {
            return 2;
        },
        getIp() {
            privileges.check('webapis.network');
            return '192.168.0.2';
        },
        getSubnetMask() {
            return '255.255.255.0';
        },
        getGateway() {
            return '192.168.0.1';
        },
        getMac() {
            privileges.check('webapis.network');
            return '00:0B:2F:33:7B:4A';
        },
        getEthernetMac() {
            return '00:0B:2F:33:7B:4A';
        },
        getDns() {
            return '10.0.2.3';
        },
        getSecondaryDns() {
            return '0.0.0.0';
        },
        getProxyserverInfo() {
            return 'id,pwd,10.20.30.40,9998';
        },
        getWiFiSsid() {
            return 'Strawbarry';
        },
        getWiFiSignalStrengthLevel() {
            return 1;
        },
        getWiFiSecurityMode() {
            return 6;
        },
        getWiFiEncryptionType() {
            return 6;
        },
        getTVName() {
            return 'dummyValue: getTVName';
        },
        addNetworkStateChangeListener(callback: unknown) {
            return addListener(callback);
        },
        removeNetworkStateChangeListener(id: unknown) {
            removeListener(id);
            return undefined;
        },
        addInternetCheckListener(callback: unknown) {
            return addListener(callback);
        },
        removeInternetCheckListener(id: unknown) {
            removeListener(id);
            return undefined;
        },
        setDhcpOption60Field(value: unknown) {
            dhcpOption60 = expectString(value);
            return undefined;
        },
        getCurrentDhcpOption60Field() {
            return dhcpOption60;
        },
        removeDhcpOption60Field() {
            dhcpOption60 = '';
            return undefined;
        },
        checkCurrentIpWith60Field() {
            return 'udhcpc1.21.1';
        },
        setTVName(value: unknown) {
            expectString(value);
            return undefined;
        },
        setEAPCAfilePath(value: unknown) {
            expectString(value);
            return undefined;
        },
        setEAPPassphrase(value: unknown, extra: unknown) {
            expectString(value);
            void extra;
            return undefined;
        },
        setIpMode() {
            return undefined;
        },
        setSubnetMask() {
            return undefined;
        },
        setGateway() {
            return undefined;
        },
        setDns() {
            return undefined;
        },
        setIp() {
            return undefined;
        },
        setProxyserverInfo() {
            return undefined;
        },
        enableSoftAP() {
            return 1;
        },
        disableSoftAP() {
            return 1;
        },
        setSoftAPChannel() {
            return 1;
        },
        setSoftAPSignalStrength() {
            return 1;
        },
        setSoftAPSecurityKeyAutoGeneration() {
            return 1;
        },
        isSoftAPEnabled() {
            return true;
        },
        getSoftAPSSID() {
            return 'K3DYMEHP4CWNH';
        },
        getSoftAPSecurityKey() {
            return 'K3DYMEHP4CWNH';
        }
    };
}

