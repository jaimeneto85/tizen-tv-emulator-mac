import type { AppManifest } from '@tvemu/protocol';
import { NOT_FOUND_ERR, WebAPIException, expectFunction, expectString } from './errors.js';
import { defineFrozen, nextTick } from './env.js';
import type { PrivilegeChecker } from './privileges.js';

export function createPackageManager(
    privileges: PrivilegeChecker,
    manifestProvider: () => AppManifest | null
): Record<string, unknown> {
    let eventListener: ((info: unknown) => void) | null = null;

    function ownPackageInfo(): Record<string, unknown> {
        const manifest = manifestProvider();
        const packageId = manifest ? manifest.packageId : 'unknown';
        const appId = manifest ? manifest.appId : 'unknown';
        return defineFrozen({}, {
            packageName: packageId,
            id: packageId,
            name: manifest ? manifest.name : 'Unknown',
            iconPath: manifest && manifest.icon ? manifest.icon : '',
            version: manifest ? manifest.version : '1.0',
            totalSize: 1024,
            lastModified: new Date(0),
            author: 'TizenDev',
            appIds: [appId],
            path: `/opt/usr/apps/${packageId}`
        });
    }

    function knownId(id: unknown): boolean {
        const manifest = manifestProvider();
        return typeof id !== 'string' || id.length === 0 || !manifest || id === manifest.packageId || id === manifest.appId;
    }

    return {
        install(path: unknown, progressCallback: unknown, errorCallback?: unknown) {
            privileges.check('tizen.package.install');
            expectString(path);
            if (progressCallback !== undefined && progressCallback !== null) {
                const progress = progressCallback as { onprogress?: (id: number, percent: number) => void; oncomplete?: (id: number) => void };
                const id = Math.floor(Math.random() * 100000);
                nextTick(() => {
                    if (progress.onprogress) {
                        progress.onprogress(id, 100);
                    }
                    if (progress.oncomplete) {
                        progress.oncomplete(id);
                    }
                });
            }
            return undefined;
        },
        uninstall(id: unknown, successCallback?: unknown, errorCallback?: unknown) {
            privileges.check('tizen.package.install');
            expectString(id);
            nextTick(() => {
                if (typeof successCallback === 'function') {
                    (successCallback as () => void)();
                }
            });
            return undefined;
        },
        getPackagesInfo(successCallback: unknown, errorCallback?: unknown) {
            privileges.check('tizen.package.info');
            expectFunction(successCallback);
            nextTick(() => (successCallback as (packages: unknown) => void)([ownPackageInfo()]));
            return undefined;
        },
        getPackageInfo(id?: unknown) {
            privileges.check('tizen.package.info');
            if (id !== undefined && id !== null) {
                expectString(id);
                if (!knownId(id)) {
                    throw new WebAPIException(NOT_FOUND_ERR, `unknown package: ${id}`);
                }
            }
            return ownPackageInfo();
        },
        setPackageInfoEventListener(callback: unknown) {
            expectFunction(callback);
            eventListener = callback as (info: unknown) => void;
            return undefined;
        },
        unsetPackageInfoEventListener() {
            eventListener = null;
            return undefined;
        }
    };
}
