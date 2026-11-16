import type { DeviceProfile } from '@tvemu/protocol';
import { INVALID_VALUES_ERR, TYPE_MISMATCH_ERR, WebAPIException, expectFunction, expectNumber, expectString } from './errors.js';
import type { PrivilegeChecker } from './privileges.js';

const CONFIG_KEY_NAMES = [
    'CONFIG_KEY_DATA_SERVICE', 'CONFIG_KEY_SERVICE_COUNTRY', 'CONFIG_KEY_SHOPLOGO',
    'CONFIG_KEY_CHANNELBOUND_APPS_TICKER', 'CONFIG_KEY_SUPPORT_SOCCER_PANEL', 'CONFIG_KEY_SUPPORT_ONTV_PANEL',
    'CONFIG_KEY_SUPPORT_NEWSON_PANEL', 'CONFIG_KEY_SUPPORT_MYCONTENTS_PANEL', 'CONFIG_KEY_SUPPORT_GAME_PANEL',
    'CONFIG_KEY_SUPPORT_CLIPS_PANEL', 'CONFIG_KEY_SUPPORT_APPS_PANEL', 'CONFIG_KEY_SYSTEM_PNP_COUNTRY',
    'CONFIG_KEY_PIN', 'CONFIG_GPMURL_KEY_ACRCT', 'CONFIG_GPMURL_KEY_AM', 'CONFIG_GPMURL_KEY_AQUA',
    'CONFIG_GPMURL_KEY_APPS', 'CONFIG_GPMURL_KEY_CDS', 'CONFIG_GPMURL_KEY_CLIPS', 'CONFIG_GPMURL_KEY_EMP',
    'CONFIG_GPMURL_KEY_EXPLORER3D', 'CONFIG_GPMURL_KEY_FITNESS', 'CONFIG_GPMURL_KEY_FKP', 'CONFIG_GPMURL_KEY_GAME',
    'CONFIG_GPMURL_KEY_GEO', 'CONFIG_GPMURL_KEY_HA', 'CONFIG_GPMURL_KEY_HBBTV', 'CONFIG_GPMURL_KEY_IMS',
    'CONFIG_GPMURL_KEY_KBO', 'CONFIG_GPMURL_KEY_KIDS', 'CONFIG_GPMURL_KEY_NOTICE', 'CONFIG_GPMURL_KEY_LC',
    'CONFIG_GPMURL_KEY_MSVC', 'CONFIG_GPMURL_KEY_NCS', 'CONFIG_GPMURL_KEY_NEWSON', 'CONFIG_GPMURL_KEY_ONTV',
    'CONFIG_GPMURL_KEY_PUSH', 'CONFIG_GPMURL_KEY_RM', 'CONFIG_GPMURL_KEY_SAPPHIRE', 'CONFIG_GPMURL_KEY_SAS',
    'CONFIG_GPMURL_KEY_SCS', 'CONFIG_GPMURL_KEY_SEARCHALL', 'CONFIG_GPMURL_KEY_SHS', 'CONFIG_GPMURL_KEY_SOCCER',
    'CONFIG_GPMURL_KEY_SSO', 'CONFIG_GPMURL_KEY_STS', 'CONFIG_GPMURL_KEY_TWITTERGW',
    'CONFIG_KEY_ACCESSIBILITY_TTS', 'CONFIG_KEY_MW_MSO_CONFIG', 'CONFIG_GPMURL_KEY_EXTRA',
    'CONFIG_GPMURL_KEY_MUSIC', 'CONFIG_KEY_ACTIVE_CATEGORY', 'CONFIG_KEY_MUTE', 'CONFIG_KEY_OSD_NUMBERPAD',
    'CONFIG_KEY_OSD_VIRTUALREMOTE', 'CONFIG_KEY_STATUS_NETFLIX', 'CONFIG_KEY_MULTIVIEW_INFO',
    'CONFIG_KEY_MULTIVIEW_STATE'
];

export function createProductInfo(
    privileges: PrivilegeChecker,
    profileProvider: () => DeviceProfile
): Record<string, unknown> {
    const configValues = new Map<number, string>();

    function resolveKey(key: unknown): number {
        const value = expectNumber(key);
        if (value < 0 || value > 57) {
            throw new WebAPIException(INVALID_VALUES_ERR, `unknown config key: ${value}`);
        }
        return value;
    }

    return {
        ProductInfoNoGlass3dSupport: Object.freeze({ NO_GLASS_3D_NOT_SUPPORTED: 0, NO_GLASS_3D_SUPPORTED: 1 }),
        ProductInfoSiServerType: Object.freeze({
            SI_TYPE_OPERATIING_SERVER: 0,
            SI_TYPE_DEVELOPMENT_SERVER: 1,
            SI_TYPE_DEVELOPING_SERVER: 2
        }),
        ProductInfoConfigKey: Object.freeze(CONFIG_KEY_NAMES.reduce<Record<string, number>>((acc, name, index) => {
            acc[name] = index;
            return acc;
        }, {})),
        getVersion() {
            return '1.0';
        },
        getFirmware() {
            privileges.check('webapis.productinfo');
            return profileProvider().firmware;
        },
        getDuid() {
            privileges.check('webapis.productinfo');
            return profileProvider().duid;
        },
        getModelCode() {
            privileges.check('webapis.productinfo');
            return profileProvider().modelCode;
        },
        getModel() {
            privileges.check('webapis.productinfo');
            return profileProvider().model;
        },
        getRealModel() {
            privileges.check('webapis.productinfo');
            const model = profileProvider().model;
            return model.charAt(0) === 'U' ? `UN65${model.slice(1)}` : model;
        },
        getSmartTVServerType() {
            return 1;
        },
        getSmartTVServerVersion() {
            return 'T-INFOLINK2015-1000';
        },
        getTunerEpop() {
            return 'dummy value';
        },
        getLocalSet() {
            privileges.check('webapis.productinfo');
            return profileProvider().country;
        },
        getNoGlass3dSupport() {
            return 0;
        },
        isSoccerModeEnabled() {
            return false;
        },
        isTtvSupported() {
            return false;
        },
        isUdPanelSupported() {
            return true;
        },
        is8KPanelSupported() {
            return true;
        },
        isDisplayRotatorSupported() {
            return true;
        },
        isUHDAModel() {
            return false;
        },
        isWallModel() {
            return false;
        },
        getPsid() {
            return 'dummy value';
        },
        getLicensedBrand() {
            return 'Samsung';
        },
        getLicensedVendor() {
            return 'Samsung';
        },
        getSystemConfig(key: unknown) {
            privileges.check('webapis.productinfo');
            const resolved = resolveKey(key);
            if (configValues.has(resolved)) {
                return configValues.get(resolved);
            }
            return 'dummyValue';
        },
        setSystemConfig(key: unknown, value: unknown, onSuccess: unknown, onError: unknown) {
            privileges.check('webapis.productinfo');
            const resolved = resolveKey(key);
            if (resolved === 1) {
                throw new WebAPIException(INVALID_VALUES_ERR, 'CONFIG_KEY_SERVICE_COUNTRY is read-only');
            }
            const text = expectString(value);
            expectFunction(onSuccess);
            expectFunction(onError);
            configValues.set(resolved, text);
            (onSuccess as (result: string) => void)(resolved === 0 ? '1' : 'dummy value');
            return undefined;
        },
        addSystemConfigChangeListener(key: unknown, callback: unknown) {
            expectFunction(callback);
            (callback as (value: number) => void)(1);
            return 1;
        },
        removeSystemConfigChangeListener(id: unknown) {
            if (typeof id !== 'number') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'listener id must be a number');
            }
            if (id !== 1) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown listener: ${id}`);
            }
            return undefined;
        }
    };
}
