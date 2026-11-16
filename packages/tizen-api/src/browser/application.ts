import type { AppManifest } from '@tvemu/protocol';
import type { Bridge } from './bridge.js';
import { INVALID_VALUES_ERR, NOT_FOUND_ERR, TYPE_MISMATCH_ERR, WebAPIException, expectFunction, expectOptionalFunction, expectString } from './errors.js';
import { defineFrozen, makeContextId, nextTick } from './env.js';
import type { Logger } from './logger.js';
import type { PrivilegeChecker } from './privileges.js';
import type { VisibilityController } from './lifecycle.js';

export interface ApplicationControlInit {
    operation: string;
    uri: string | null;
    mime: string | null;
    category: string | null;
    data: ApplicationControlDataInit[];
}

export interface ApplicationControlDataInit {
    key: string;
    value: string[];
}

export class ApplicationControlData {
    key: string;
    value: string[];

    constructor(key: unknown, value: unknown) {
        this.key = typeof key === 'string' ? key : String(key);
        this.value = Array.isArray(value) ? value.map((entry) => String(entry)) : [];
    }
}

export class ApplicationControl {
    operation: string;
    uri: string | null;
    mime: string | null;
    category: string | null;
    data: ApplicationControlData[];

    constructor(operation: unknown, uri?: unknown, mime?: unknown, category?: unknown, data?: unknown) {
        this.operation = operation === undefined || operation === null ? '' : String(operation);
        this.uri = uri === undefined || uri === null ? null : String(uri);
        this.mime = mime === undefined || mime === null ? null : String(mime);
        this.category = category === undefined || category === null ? null : String(category);
        this.data = [];
        if (Array.isArray(data)) {
            for (const entry of data) {
                if (entry instanceof ApplicationControlData) {
                    this.data.push(entry);
                } else if (entry !== null && typeof entry === 'object') {
                    const record = entry as Partial<ApplicationControlDataInit>;
                    this.data.push(new ApplicationControlData(record.key, record.value));
                }
            }
        }
    }
}

interface ApplicationAPIContext {
    bridge: Bridge;
    logger: Logger;
    privileges: PrivilegeChecker;
    visibility: VisibilityController;
    manifestProvider: () => AppManifest | null;
}

export function createApplicationControlModule(context: ApplicationAPIContext): Record<string, unknown> {
    const { bridge, logger, privileges, visibility, manifestProvider } = context;
    const contextId = makeContextId();
    let exitRequested = false;

    function ownAppId(): string {
        const manifest = manifestProvider();
        return manifest ? manifest.appId : 'unknown';
    }

    function ownPackageId(): string {
        const manifest = manifestProvider();
        return manifest ? manifest.packageId : 'unknown';
    }

    function ownAppInfo(): Record<string, unknown> {
        const manifest = manifestProvider();
        return defineFrozen({}, {
            id: manifest ? manifest.appId : 'unknown',
            name: manifest ? manifest.name : 'Unknown',
            iconPath: manifest && manifest.icon ? manifest.icon : '',
            version: manifest ? manifest.version : '1.0',
            show: true,
            installDate: new Date(0),
            size: 1024,
            packageId: manifest ? manifest.packageId : 'unknown'
        });
    }

    function applicationObject(): Record<string, unknown> {
        const appInfo = ownAppInfo();
        return defineFrozen({}, {
            appInfo,
            contextId,
            exit: () => {
                if (exitRequested) {
                    return;
                }
                exitRequested = true;
                if (bridge.available) {
                    bridge.request('application', 'exit', []).catch((error: unknown) => {
                        logger.log('error', `application.exit: ${error instanceof Error ? error.message : String(error)}`);
                    });
                } else {
                    try {
                        window.close();
                    } catch {
                        logger.log('warn', 'window.close() is not available');
                    }
                }
            },
            hide: () => {
                if (bridge.available) {
                    bridge.request('application', 'hide', []).catch((error: unknown) => {
                        logger.log('error', `application.hide: ${error instanceof Error ? error.message : String(error)}`);
                    });
                }
                visibility.setState('hidden', document);
            },
            getRequestedAppControl: () => {
                const appControl = new ApplicationControl('http://tizen.org/appcontrol/operation/default');
                return defineFrozen({}, {
                    appControl,
                    callerAppId: ownAppId(),
                    replyResult: (data?: unknown) => {
                        void data;
                    },
                    replyFailure: () => undefined
                });
            }
        });
    }

    function contextObject(id: string): Record<string, unknown> {
        return defineFrozen({}, { id, appId: ownAppId() });
    }

    function knownAppId(appId: unknown): boolean {
        return typeof appId !== 'string' || appId.length === 0 || appId === ownAppId();
    }

    function asyncSuccess(callback: unknown, value?: unknown): void {
        const success = expectOptionalFunction<(...args: unknown[]) => void>(callback);
        nextTick(() => {
            if (success) {
                success(value);
            }
        });
    }

    function asyncError(callback: unknown, error: WebAPIException): void {
        const failure = expectOptionalFunction<(error: unknown) => void>(callback);
        nextTick(() => {
            if (failure) {
                failure(error);
            }
        });
    }

    const infoListeners = new Map<number, { oninstalled?: (info: unknown) => void; onupdated?: (info: unknown) => void; onuninstalled?: (id: string) => void }>();
    let nextInfoListenerId = 1000000000;

    const application: Record<string, unknown> = {
        getCurrentApplication() {
            return applicationObject();
        },
        getAppContext(contextIdArg?: unknown) {
            if (contextIdArg !== undefined && contextIdArg !== null) {
                expectString(contextIdArg);
                if (contextIdArg !== contextId) {
                    throw new WebAPIException(NOT_FOUND_ERR, `unknown context: ${contextIdArg}`);
                }
            }
            return contextObject(contextId);
        },
        getAppInfo(appId?: unknown) {
            if (appId !== undefined && appId !== null) {
                expectString(appId);
                if (!knownAppId(appId)) {
                    throw new WebAPIException(NOT_FOUND_ERR, `unknown app: ${appId}`);
                }
            }
            return ownAppInfo();
        },
        getAppsContext(successCallback: unknown, errorCallback?: unknown) {
            expectFunction(successCallback);
            try {
                asyncSuccess(successCallback, [contextObject(contextId)]);
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        getAppsInfo(successCallback: unknown, errorCallback?: unknown) {
            expectFunction(successCallback);
            try {
                asyncSuccess(successCallback, [ownAppInfo()]);
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        findAppControl(appControl: unknown, successCallback: unknown, errorCallback?: unknown) {
            expectFunction(successCallback);
            try {
                expectObjectControl(appControl);
                asyncSuccess(successCallback, [[ownAppInfo()], appControl]);
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        launch(appId: unknown, successCallback?: unknown, errorCallback?: unknown) {
            privileges.check('tizen.application.launch');
            try {
                expectString(appId);
                if (!knownAppId(appId)) {
                    asyncError(errorCallback, new WebAPIException(NOT_FOUND_ERR, `unknown app: ${appId}`));
                    return undefined;
                }
                asyncSuccess(successCallback);
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        launchAppControl(appControl: unknown, appId?: unknown, successCallback?: unknown, errorCallback?: unknown) {
            privileges.check('tizen.application.launch');
            try {
                expectObjectControl(appControl);
                if (appId !== undefined && appId !== null) {
                    expectString(appId);
                    if (!knownAppId(appId)) {
                        asyncError(errorCallback, new WebAPIException(NOT_FOUND_ERR, `unknown app: ${appId}`));
                        return undefined;
                    }
                }
                asyncSuccess(successCallback);
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        kill(contextIdArg: unknown, successCallback?: unknown, errorCallback?: unknown) {
            privileges.check('tizen.application.kill');
            try {
                expectString(contextIdArg);
                if (contextIdArg === contextId) {
                    asyncError(errorCallback, new WebAPIException(INVALID_VALUES_ERR, 'cannot kill own context'));
                } else {
                    asyncError(errorCallback, new WebAPIException(NOT_FOUND_ERR, `unknown context: ${contextIdArg}`));
                }
            } catch (error) {
                asyncError(errorCallback, error instanceof WebAPIException ? error : new WebAPIException());
            }
            return undefined;
        },
        getAppSharedURI(appId?: unknown) {
            if (appId !== undefined && appId !== null) {
                expectString(appId);
            }
            return '/usr/local/share/';
        },
        getAppMetaData(appId?: unknown) {
            privileges.check('tizen.application.info');
            if (appId !== undefined && appId !== null) {
                expectString(appId);
                if (!knownAppId(appId)) {
                    throw new WebAPIException(NOT_FOUND_ERR, `unknown app: ${appId}`);
                }
            }
            return [defineFrozen({}, { key: '', value: '' })];
        },
        getAppCerts(appId?: unknown) {
            if (appId !== undefined && appId !== null) {
                expectString(appId);
                if (!knownAppId(appId)) {
                    throw new WebAPIException(NOT_FOUND_ERR, `unknown app: ${appId}`);
                }
            }
            return [defineFrozen({}, { type: 'AUTHOR_ROOT', value: '' })];
        },
        addAppInfoEventListener(callback: unknown) {
            if ((typeof callback !== 'object' || callback === null) && typeof callback !== 'function') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'callback must be an object');
            }
            const listener = callback as { oninstalled?: (info: unknown) => void; onupdated?: (info: unknown) => void; onuninstalled?: (id: string) => void };
            const id = nextInfoListenerId;
            nextInfoListenerId += 1;
            infoListeners.set(id, listener);
            return id;
        },
        removeAppInfoEventListener(id: unknown) {
            if (typeof id !== 'number') {
                throw new WebAPIException(INVALID_VALUES_ERR, 'listener id must be a number');
            }
            infoListeners.delete(id);
            return undefined;
        },
        addAppStatusChangeListener(callback: unknown, appId?: unknown) {
            expectFunction(callback);
            if (appId !== undefined && appId !== null) {
                expectString(appId);
            }
            const id = nextInfoListenerId;
            nextInfoListenerId += 1;
            return id;
        },
        removeAppStatusChangeListener(id: unknown) {
            if (typeof id !== 'number') {
                throw new WebAPIException(INVALID_VALUES_ERR, 'listener id must be a number');
            }
            return undefined;
        },
        getBatteryUsageInfo() {
            return 'dummy value';
        },
        getAppsUsageInfo() {
            return 'dummy value';
        }
    };

    function expectObjectControl(value: unknown): void {
        if (!(value instanceof ApplicationControl) && (typeof value !== 'object' || value === null)) {
            throw new WebAPIException(INVALID_VALUES_ERR, 'invalid app control');
        }
    }

    return application;
}
