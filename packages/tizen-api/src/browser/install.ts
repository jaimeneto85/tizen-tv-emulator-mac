import { Bridge } from './bridge.js';
import { Logger } from './logger.js';
import { PrivilegeChecker } from './privileges.js';
import { VisibilityController } from './lifecycle.js';
import { bridgeSendFunction, currentManifest, currentProfile, defineFrozen } from './env.js';
import { WebAPIError, WebAPIException } from './errors.js';
import { KeyFilter, KeyRegistry, createTVInputDevice } from './keys.js';
import { ApplicationControl, ApplicationControlData, createApplicationControlModule } from './application.js';
import { SystemInfoModule } from './systeminfo.js';
import { createAudioControl, createDisplayControl, createTVChannel, createTVInfo, createTVWindow } from './tvmanagers.js';
import { VirtualFileSystem } from './filesystem.js';
import { TZDate, TimeDuration, createTimeManager } from './time.js';
import { createPackageManager } from './package.js';
import { createPreference } from './preference.js';
import { createKeyManager } from './keymanager.js';
import { createProductInfo } from './productinfo.js';
import { createNetwork } from './network.js';
import { createAppCommon } from './appcommon.js';
import { createWebapisTVInfo } from './webapis-tvinfo.js';
import { createAvInfo } from './avinfo.js';
import {
    createAdInfo,
    createBilling,
    createDrmInfo,
    createPreview,
    createSso,
    createSystemControl,
    createTimer,
    createWebapisSystemInfo,
    createWidgetData,
    webapisRootMethods
} from './webapis-mocks.js';
import { createAVPlay } from './avplay.js';

const BRIDGE_TIMEOUT_MS = 5000;

function shouldInstall(): boolean {
    try {
        if (window === window.top) {
            return true;
        }
        const topWindow = window.top as Window;
        void topWindow.location.href;
        return true;
    } catch {
        return false;
    }
}

function defineGlobal(name: string, value: unknown): void {
    Object.defineProperty(window, name, {
        configurable: false,
        enumerable: true,
        get: () => value,
        set: () => undefined
    });
}

function install(): void {
    if (!shouldInstall()) {
        return;
    }

    let realLogger: Logger | null = null;
    const bridge = new Bridge(bridgeSendFunction(), BRIDGE_TIMEOUT_MS, (api, method) => {
        if (realLogger) {
            realLogger.log('error', `[tvemu] bridge timeout: ${api}.${method}`);
        }
    });
    realLogger = new Logger(bridge);
    const logger = realLogger;
    const profile = () => currentProfile();
    const manifest = () => currentManifest();
    const privileges = new PrivilegeChecker(manifest, realLogger);
    const visibility = new VisibilityController();

    visibility.install(document);

    const keyRegistry = new KeyRegistry(bridge);
    const keyFilter = new KeyFilter(keyRegistry, document);
    keyFilter.install(window);

    bridge.onEvent((event, payload) => {
        if (event === 'visibility') {
            visibility.setState(payload === 'hidden' ? 'hidden' : 'visible', document);
        }
    });

    const host = window as unknown as { __tvemuReceive?: (json: string) => void };
    host.__tvemuReceive = (json: string) => {
        bridge.receive(json);
    };

    const application = createApplicationControlModule({
        bridge,
        logger: realLogger,
        privileges,
        visibility,
        manifestProvider: manifest
    });

    const systemInfo = new SystemInfoModule(profile);
    const audioControl = createAudioControl(privileges);
    const tvWindow = createTVWindow(privileges);
    const tvChannel = createTVChannel(privileges, {
        now: () => new TZDate(),
        duration: (length: number, unit?: string) => new TimeDuration(length, unit)
    });
    const displayControl = createDisplayControl(privileges);
    const tvInfo = createTVInfo(privileges);
    const filesystem = new VirtualFileSystem(manifest);
    const packageManager = createPackageManager(privileges, manifest);
    const appCommon = createAppCommon(keyRegistry, () => {
        const current = manifest();
        return current ? current.appId : 'unknown';
    });

    const tizen = defineFrozen({}, {
        WebAPIException,
        WebAPIError,
        ApplicationControl,
        ApplicationControlData,
        TZDate,
        TimeDuration,
        application,
        tvinputdevice: createTVInputDevice(keyRegistry, privileges),
        systeminfo: systemInfo.buildAPI(),
        tvaudiocontrol: audioControl,
        tvwindow: tvWindow,
        tvchannel: tvChannel,
        tvdisplaycontrol: displayControl,
        tvinfo: tvInfo,
        filesystem: filesystem.buildManager(privileges),
        time: createTimeManager(),
        package: packageManager,
        preference: createPreference(manifest),
        keymanager: createKeyManager(),
        tv: defineFrozen({}, {
            audiocontrol: audioControl,
            window: tvWindow,
            channel: tvChannel,
            displaycontrol: displayControl
        })
    });

    const webapis = defineFrozen({}, {
        ...webapisRootMethods(),
        productinfo: createProductInfo(privileges, profile),
        network: createNetwork(privileges),
        appcommon: appCommon,
        tvinfo: createWebapisTVInfo(),
        avinfo: createAvInfo(),
        avplay: createAVPlay(privileges, realLogger),
        adinfo: createAdInfo(),
        sso: createSso(),
        billing: createBilling(),
        widgetdata: createWidgetData(),
        preview: createPreview(),
        drminfo: createDrmInfo(),
        systemcontrol: createSystemControl(),
        timer: createTimer(),
        SystemInfo: createWebapisSystemInfo()
    });

    defineGlobal('tizen', tizen);
    defineGlobal('webapis', webapis);
}

try {
    install();
} catch (error) {
    try {
        const consoleObject = window.console;
        if (consoleObject && typeof consoleObject.error === 'function') {
            consoleObject.error(`[tvemu] failed to install tizen/webapis APIs: ${error instanceof Error ? error.message : String(error)}`);
        }
    } catch {
        void 0;
    }
}
