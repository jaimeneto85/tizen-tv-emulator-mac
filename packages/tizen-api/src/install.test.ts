import { describe, expect, it } from 'vitest';
import { loadApp, nextTick, SAMPLE_MANIFEST, thrownName } from './testing/harness.js';

describe('bundle install', () => {
    it('installs window.tizen and window.webapis without a bridge', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, unknown>;
        const webapis = (window as Record<string, unknown>).webapis as Record<string, unknown>;
        expect(tizen).toBeTypeOf('object');
        expect(webapis).toBeTypeOf('object');
        expect(Object.keys(tizen).sort()).toEqual([
            'ApplicationControl', 'ApplicationControlData', 'TZDate', 'TimeDuration', 'WebAPIError',
            'WebAPIException', 'application', 'filesystem', 'keymanager', 'package', 'preference',
            'systeminfo', 'time', 'tv',
            'tvaudiocontrol', 'tvchannel', 'tvdisplaycontrol', 'tvinfo', 'tvinputdevice', 'tvwindow'
        ].sort());
        expect(Object.keys(tizen.tv as Record<string, unknown>).sort()).toEqual(['audiocontrol', 'channel', 'displaycontrol', 'window']);
        for (const namespace of ['application', 'tvinputdevice', 'systeminfo', 'filesystem', 'tvaudiocontrol', 'tvwindow', 'tvchannel', 'tvdisplaycontrol', 'tvinfo', 'time', 'package', 'preference', 'keymanager']) {
            expect(tizen[namespace], namespace).toBeTypeOf('object');
        }
        for (const namespace of ['productinfo', 'network', 'appcommon', 'tvinfo', 'avinfo', 'avplay', 'adinfo', 'sso', 'billing', 'widgetdata', 'preview']) {
            expect(webapis[namespace], namespace).toBeTypeOf('object');
        }
    });

    it('keeps window.tizen and window.webapis when a page script assigns over them', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen;
        const webapis = (window as Record<string, unknown>).webapis;
        window.eval('window.tizen = null; window.webapis = null;');
        expect((window as Record<string, unknown>).tizen).toBe(tizen);
        expect((window as Record<string, unknown>).webapis).toBe(webapis);
    });

    it('exposes WebAPIException with the code table and names', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, unknown>;
        const WebAPIException = tizen.WebAPIException as new (code: unknown, message?: string, name?: string) => {
            code: number;
            name: string;
            message: string;
            TYPE_MISMATCH_ERR: number;
        };
        const mismatch = new WebAPIException(17);
        expect(mismatch.code).toBe(17);
        expect(mismatch.name).toBe('TypeMismatchError');
        expect(mismatch.message.length).toBeGreaterThan(0);
        expect(mismatch.TYPE_MISMATCH_ERR).toBe(17);
        const invalidValues = new WebAPIException(26);
        expect(invalidValues.name).toBe('InvalidValuesError');
        const io = new WebAPIException(27);
        expect(io.name).toBe('IOError');
        const security = new WebAPIException(18);
        expect(security.name).toBe('SecurityError');
        const unknown = new WebAPIException('not-a-number');
        expect(unknown.code).toBe(9999);
        expect(unknown.name).toBe('UnknownError');
        const WebAPIError = tizen.WebAPIError as new (code: unknown) => { code: number; name: string };
        const error = new WebAPIError(26);
        expect(error.code).toBe(26);
        expect(error.name).toBe('InvalidValuesError');
    });

    it('throws TypeMismatchError synchronously for invalid argument types', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        expect(thrownName(() => tizen.tvinputdevice.getKey(123))).toBe('TypeMismatchError');
        expect(thrownName(() => tizen.application.getAppInfo(42))).toBe('TypeMismatchError');
        const systeminfo = tizen.systeminfo as Record<string, any>;
        expect(thrownName(() => systeminfo.getPropertyValue('NOPE', () => void 0))).toBe('TypeMismatchError');
        expect(thrownName(() => systeminfo.getCapability('not-a-uri'))).toBe('UnknownError');
    });

    it('delivers async callbacks asynchronously', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        let called = 0;
        tizen.application.getAppsInfo(() => {
            called += 1;
        });
        expect(called).toBe(0);
        await nextTick();
        expect(called).toBe(1);
    });

    it('builds getCurrentApplication from the manifest', () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const app = tizen.application.getCurrentApplication();
        expect(app.appInfo.id).toBe('ABCDEFGHIJ.myapp');
        expect(app.appInfo.name).toBe('My App');
        expect(app.appInfo.version).toBe('1.2.3');
        expect(app.contextId).toHaveLength(16);
        const requested = app.getRequestedAppControl();
        expect(requested.appControl.operation).toBe('http://tizen.org/appcontrol/operation/default');
        expect(requested.callerAppId).toBe('ABCDEFGHIJ.myapp');
        expect(requested.appControl.data).toEqual([]);
    });

    it('supports ApplicationControl and ApplicationControlData constructors', () => {
        const { window } = loadApp();
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const data = new tizen.ApplicationControlData('k', ['v1', 'v2']);
        expect(data.key).toBe('k');
        expect(data.value).toEqual(['v1', 'v2']);
        const control = new tizen.ApplicationControl('op', 'uri', 'mime', 'cat', [data]);
        expect(control.operation).toBe('op');
        expect(control.uri).toBe('uri');
        expect(control.data).toHaveLength(1);
        expect(control.data[0].key).toBe('k');
    });
});
