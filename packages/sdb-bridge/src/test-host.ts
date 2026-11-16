import type { HostApi, InstalledApp, DeviceProfile } from '@tvemu/protocol';
export const app: InstalledApp = {
    manifest: { widgetId: 'http://example.org/test', appId: 'TestPkg123.Test', packageId: 'TestPkg123', name: 'Test', version: '1.0.0',
        requiredVersion: '2.3', contentSrc: 'index.html', icon: null, privileges: [], features: [], contentSecurityPolicy: null,
        accessOrigins: [], settings: {}, profile: 'tv' }, installDir: '/unused', installedAt: '2026-01-01',
};
export function fakeHost(events: string[] = []): HostApi {
    return {
        listApps: async () => [app], installWgt: async (path) => { events.push(`install:${path}`); return app; },
        launch: async (id) => { events.push(`launch:${id}`); }, uninstall: async (id) => { events.push(`uninstall:${id}`); },
        terminate: async (id) => { events.push(`terminate:${id}`); }, runningApp: async () => null, sendKey: async () => {},
        deviceInfo: () => ({ model: 'tvemu', tizenVersion: '10.0', duid: 'tvemu-local' } as DeviceProfile),
    };
}
