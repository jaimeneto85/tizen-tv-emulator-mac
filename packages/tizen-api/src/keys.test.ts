import { describe, expect, it } from 'vitest';
import { REMOTE_KEYS } from '@tvemu/protocol';
import { loadApp, nextTick, SAMPLE_MANIFEST, thrownName } from './testing/harness.js';

describe('tvinputdevice', () => {
    it('filters unregistered special keys and passes registered ones (10252)', () => {
        const { window, keyDown } = loadApp();
        let seen = 0;
        window.addEventListener('keydown', () => {
            seen += 1;
        });
        const first = keyDown(10252);
        expect(seen).toBe(0);
        expect(first.defaultPrevented).toBe(true);

        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        tizen.tvinputdevice.registerKey('MediaPlayPause');
        const second = keyDown(10252);
        expect(seen).toBe(1);
        expect(second.defaultPrevented).toBe(false);

        tizen.tvinputdevice.unregisterKey('MediaPlayPause');
        keyDown(10252);
        expect(seen).toBe(1);
    });

    it('delivers default keys without registration', () => {
        const { window, keyDown } = loadApp();
        let seen = 0;
        window.addEventListener('keydown', () => {
            seen += 1;
        });
        for (const code of [37, 38, 39, 40, 13, 10009]) {
            keyDown(code);
        }
        expect(seen).toBe(6);
    });

    it('passes keys that are not in the table at all', () => {
        const { window, keyDown } = loadApp();
        let seen = 0;
        window.addEventListener('keydown', () => {
            seen += 1;
        });
        const event = keyDown(65);
        expect(seen).toBe(1);
        expect(event.defaultPrevented).toBe(false);
    });

    it('dispatches tizenhwkey before the Back keydown reaches the app', () => {
        const { window, document, keyDown } = loadApp();
        const order: string[] = [];
        document.addEventListener('tizenhwkey', (event) => {
            order.push(`tizenhwkey:${(event as Event & { keyName: string }).keyName}`);
        });
        window.addEventListener('keydown', () => {
            order.push('keydown');
        });
        keyDown(10009);
        expect(order).toEqual(['tizenhwkey:back', 'keydown']);
    });

    it('matches REMOTE_KEYS from @tvemu/protocol for shared names', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const mismatches: string[] = [];
        for (const remoteKey of REMOTE_KEYS) {
            const local = tizen.tvinputdevice.getKey(remoteKey.name);
            if (local.code !== remoteKey.code) {
                mismatches.push(`${remoteKey.name}: bundle=${local.code} protocol=${remoteKey.code}`);
            }
        }
        expect(mismatches).toEqual([]);
    });

    it('reports the full real-device key table from getSupportedKeys', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const keys = tizen.tvinputdevice.getSupportedKeys();
        expect(keys.length).toBeGreaterThan(140);
        const playPause = keys.find((entry: { name: string }) => entry.name === 'MediaPlayPause');
        expect(playPause.code).toBe(10252);
        expect(Object.isFrozen(playPause)).toBe(true);
    });

    it('throws InvalidValuesError for unknown key names', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        expect(thrownName(() => tizen.tvinputdevice.getKey('NoSuchKey'))).toBe('InvalidValuesError');
        expect(thrownName(() => tizen.tvinputdevice.registerKey('NoSuchKey'))).toBe('InvalidValuesError');
        expect(thrownName(() => tizen.tvinputdevice.registerKey(''))).toBe('TypeMismatchError');
    });

    it('supports registerKeyBatch and unregisterKeyBatch with async callbacks', async () => {
        const { window, keyDown } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        let seen = 0;
        window.addEventListener('keydown', () => {
            seen += 1;
        });
        let succeeded = 0;
        tizen.tvinputdevice.registerKeyBatch(['MediaPlayPause', 'ColorF0Red'], () => {
            succeeded += 1;
        });
        expect(succeeded).toBe(0);
        await nextTick();
        expect(succeeded).toBe(1);
        keyDown(10252);
        keyDown(403);
        expect(seen).toBe(2);
        let failed = 0;
        tizen.tvinputdevice.unregisterKeyBatch(['NoSuchKey'], () => void 0, () => {
            failed += 1;
        });
        await nextTick();
        expect(failed).toBe(1);
    });

    it('webapis.appcommon.registerKey toggles delivery without throwing', () => {
        const { window, keyDown } = loadApp();
        const webapis = (window as Record<string, unknown>).webapis as Record<string, any>;
        let seen = 0;
        window.addEventListener('keydown', () => {
            seen += 1;
        });
        expect(webapis.appcommon.registerKey(['MediaPlayPause'])).toBe(true);
        keyDown(10252);
        expect(seen).toBe(1);
        expect(webapis.appcommon.registerKey(['NoSuchKey'])).toBe(false);
        expect(webapis.appcommon.unregisterKey(['MediaPlayPause'])).toBe(true);
        keyDown(10252);
        expect(seen).toBe(1);
        const special = webapis.appcommon.getSpecialSupportedKeys();
        expect(special.some((entry: { code: number }) => entry.code === 10252)).toBe(true);
        expect(special.some((entry: { code: number }) => entry.code === 37)).toBe(false);
    });
});
