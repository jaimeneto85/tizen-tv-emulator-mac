import { INVALID_VALUES_ERR, NOT_FOUND_ERR, WebAPIException, expectObject, expectString } from './errors.js';

interface KeyEntry {
    name: string;
    data: string;
}

const PERMISSIONS = new Set(['NONE', 'READ', 'REMOVE', 'READ_REMOVE']);

export function createKeyManager(): Record<string, unknown> {
    const entries = new Map<string, KeyEntry>();

    function lookupName(holder: unknown): string {
        const record = expectObject(holder);
        return expectString(record.name);
    }

    return {
        saveData(name: unknown, rawData: unknown, password?: unknown, successCallback?: unknown, errorCallback?: unknown) {
            const keyName = expectString(name);
            const data = expectString(rawData);
            if (password !== undefined && password !== null) {
                expectString(password);
            }
            entries.set(keyName, { name: keyName, data });
            if (typeof successCallback === 'function') {
                (successCallback as () => void)();
            }
            return undefined;
        },
        removeData(dataAlias: unknown) {
            const name = lookupName(dataAlias);
            if (!entries.delete(name)) {
                throw new WebAPIException(NOT_FOUND_ERR, `unknown key: ${name}`);
            }
            return undefined;
        },
        getData(dataAlias: unknown, password?: unknown) {
            const name = lookupName(dataAlias);
            if (password !== undefined && password !== null) {
                expectString(password);
            }
            const entry = entries.get(name);
            if (!entry) {
                throw new WebAPIException(NOT_FOUND_ERR, `unknown key: ${name}`);
            }
            return entry.data;
        },
        getDataAliasList() {
            const aliases: Array<Record<string, unknown>> = [];
            for (const entry of entries.values()) {
                aliases.push({ packageId: 'packagaid', name: entry.name });
            }
            return aliases;
        },
        setPermission(dataAlias: unknown, otherPackageId: unknown, permission: unknown, successCallback?: unknown, errorCallback?: unknown) {
            lookupName(dataAlias);
            expectString(otherPackageId);
            const value = expectString(permission);
            if (!PERMISSIONS.has(value)) {
                throw new WebAPIException(INVALID_VALUES_ERR, `unknown permission: ${value}`);
            }
            if (typeof successCallback === 'function') {
                (successCallback as () => void)();
            }
            return undefined;
        }
    };
}
