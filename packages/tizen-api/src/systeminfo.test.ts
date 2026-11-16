import { describe, expect, it } from 'vitest';
import { loadApp, nextTick, SAMPLE_MANIFEST, thrownName } from './testing/harness.js';

const PROFILE = {
    name: 'test',
    label: 'Test TV',
    tizenVersion: '4.0',
    modelYear: 2019,
    chromiumMilestone: 69,
    userAgent: 'test',
    width: 1280,
    height: 720,
    cpuThrottle: 1,
    model: 'TESTMODEL',
    modelCode: 'TEST_CODE',
    firmware: 'T-TEST-0000.0',
    duid: 'TESTDUID1234',
    locale: 'pt-BR',
    country: 'BR'
};

describe('tizen.systeminfo', () => {
    it('derives capability values from the profile', () => {
        const { window } = loadApp({ profile: PROFILE, manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const systeminfo = tizen.systeminfo;
        expect(systeminfo.getCapability('http://tizen.org/feature/screen.width')).toBe(1280);
        expect(systeminfo.getCapability('http://tizen.org/feature/screen.height')).toBe(720);
        expect(systeminfo.getCapability('http://tizen.org/feature/platform.version')).toBe('4.0');
        expect(systeminfo.getCapability('http://tizen.org/feature/platform.web.api.version')).toBe('4.0');
        expect(systeminfo.getCapability('http://tizen.org/feature/profile')).toBe('tv');
        expect(systeminfo.getCapability('http://tizen.org/system/duid')).toBe('TESTDUID1234');
        expect(systeminfo.getCapability('http://tizen.org/system/model_name')).toBe('TESTMODEL');
        expect(systeminfo.getCapability('http://tizen.org/feature/microphone')).toBe(false);
        expect(systeminfo.getCapability('http://tizen.org/feature/unknown.thing')).toBe(false);
        expect(thrownName(() => systeminfo.getCapability('http://example.com/other'))).toBe('UnknownError');
        expect(thrownName(() => systeminfo.getCapability('no-uri-here'))).toBe('UnknownError');
    });

    it('serves TV property values with read-only getters', async () => {
        const { window } = loadApp({ profile: PROFILE, manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const systeminfo = tizen.systeminfo;
        const properties = await new Promise<Record<string, any>>((resolve) => {
            systeminfo.getPropertyValue('BUILD', resolve);
        });
        expect(properties.model).toBe('TESTMODEL');
        expect(properties.manufacturer).toBe('Samsung');
        expect(properties.buildVersion).toBe('T-TEST-0000.0');
        expect(Object.isFrozen(properties)).toBe(true);
        expect(() => {
            'use strict';
            properties.model = 'x';
        }).toThrow();
    });

    it('exposes the full TV property id set and rejects unknown ids synchronously', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const systeminfo = tizen.systeminfo;
        for (const id of ['BUILD', 'CPU', 'DISPLAY', 'DEVICE_ORIENTATION', 'LOCALE', 'NETWORK', 'WIFI_NETWORK', 'ETHERNET_NETWORK', 'STORAGE', 'MEMORY', 'VIDEOSOURCE', 'PERIPHERAL']) {
            expect(typeof systeminfo.getCount(id)).toBe('number');
        }
        expect(thrownName(() => systeminfo.getPropertyValue('SIM', () => void 0))).toBe('TypeMismatchError');
        expect(thrownName(() => systeminfo.getCount('SIM'))).toBe('TypeMismatchError');
    });

    it('reports NETWORK from navigator.onLine and emits changes on online/offline', async () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const systeminfo = tizen.systeminfo;
        const initial = await new Promise<Record<string, any>>((resolve) => {
            systeminfo.getPropertyValue('NETWORK', resolve);
        });
        expect(initial.networkType).toBe('ETHERNET');
        const events: string[] = [];
        const listenerId = systeminfo.addPropertyValueChangeListener('NETWORK', (value: Record<string, any>) => {
            events.push(value.networkType);
        });
        await nextTick();
        Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
        window.dispatchEvent(new window.Event('offline'));
        await nextTick();
        Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
        window.dispatchEvent(new window.Event('online'));
        await nextTick();
        expect(events).toEqual(['ETHERNET', 'NONE', 'ETHERNET']);
        systeminfo.removePropertyValueChangeListener(listenerId);
        expect(thrownName(() => systeminfo.removePropertyValueChangeListener(listenerId))).toBe('InvalidValuesError');
    });

    it('returns memory figures and a capabilities object', () => {
        const { window } = loadApp({ profile: PROFILE });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const systeminfo = tizen.systeminfo;
        expect(systeminfo.getTotalMemory()).toBe(2147483648);
        expect(systeminfo.getAvailableMemory()).toBe(1073741824);
        const capabilities = systeminfo.getCapabilities();
        expect(capabilities.profile).toBe('tv');
        expect(capabilities.platformVersion).toBe('4.0');
        expect(capabilities.duid).toBe('TESTDUID1234');
    });
});
