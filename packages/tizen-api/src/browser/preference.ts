import type { AppManifest } from '@tvemu/protocol';
import { NOT_FOUND_ERR, TYPE_MISMATCH_ERR, WebAPIException } from './errors.js';

export type PreferenceValue = string | number | boolean;

interface PreferenceEntry {
    key: string;
    value: PreferenceValue;
}

export function createPreference(manifestProvider: () => AppManifest | null): Record<string, unknown> {
    const values = new Map<string, PreferenceValue>();
    const listeners = new Map<string, Array<(value: PreferenceValue) => void>>();

    function validateValue(value: unknown): PreferenceValue {
        const kind = typeof value;
        if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') {
            throw new WebAPIException(TYPE_MISMATCH_ERR, 'preference value must be a string, number or boolean');
        }
        return value as PreferenceValue;
    }

    return {
        setValue(key: unknown, value: unknown) {
            const name = typeof key === 'string' ? key : String(key);
            const stored = validateValue(value);
            values.set(name, stored);
            const callbacks = listeners.get(name);
            if (callbacks) {
                for (const callback of callbacks.slice()) {
                    try {
                        callback(stored);
                    } catch {
                        void 0;
                    }
                }
            }
            return undefined;
        },
        getValue(key: unknown) {
            const name = typeof key === 'string' ? key : String(key);
            if (!values.has(name)) {
                throw new WebAPIException(NOT_FOUND_ERR, `unknown preference: ${name}`);
            }
            return values.get(name);
        },
        getAll(): PreferenceEntry[] {
            const entries: PreferenceEntry[] = [];
            for (const [key, value] of values) {
                entries.push({ key, value });
            }
            return entries;
        },
        remove(key: unknown) {
            const name = typeof key === 'string' ? key : String(key);
            values.delete(name);
            return undefined;
        },
        removeAll() {
            values.clear();
            return undefined;
        },
        exists(key: unknown) {
            const name = typeof key === 'string' ? key : String(key);
            return values.has(name);
        },
        setChangeListener(key: unknown, callback: unknown) {
            const name = typeof key === 'string' ? key : String(key);
            if (typeof callback !== 'function') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'callback must be a function');
            }
            const list = listeners.get(name) || [];
            list.push(callback as (value: PreferenceValue) => void);
            listeners.set(name, list);
            return undefined;
        },
        unsetChangeListener(key: unknown) {
            const name = typeof key === 'string' ? key : String(key);
            listeners.delete(name);
            return undefined;
        }
    };
}
