import type { AppManifest } from '@tvemu/protocol';
import type { Logger } from './logger.js';

const API_PRIVILEGES: Record<string, string> = {
    'tizen.tvinputdevice': 'http://tizen.org/privilege/tv.inputdevice',
    'tizen.tvaudiocontrol': 'http://tizen.org/privilege/tv.audio',
    'tizen.tvwindow': 'http://tizen.org/privilege/tv.window',
    'tizen.tvchannel': 'http://tizen.org/privilege/tv.channel',
    'tizen.tvdisplaycontrol': 'http://tizen.org/privilege/tv.display',
    'tizen.application.launch': 'http://tizen.org/privilege/application.launch',
    'tizen.application.info': 'http://tizen.org/privilege/application.info',
    'tizen.application.kill': 'http://tizen.org/privilege/appmanager.kill',
    'tizen.filesystem.read': 'http://tizen.org/privilege/filesystem.read',
    'tizen.filesystem.write': 'http://tizen.org/privilege/filesystem.write',
    'tizen.package.install': 'http://tizen.org/privilege/packagemanager.install',
    'tizen.package.info': 'http://tizen.org/privilege/package.info',
    'webapis.productinfo': 'http://developer.samsung.com/privilege/productinfo',
    'webapis.avplay': 'http://developer.samsung.com/privilege/avplay',
    'webapis.network': 'http://developer.samsung.com/privilege/network.public'
};

export class PrivilegeChecker {
    private readonly warned = new Set<string>();

    constructor(
        private readonly manifestProvider: () => AppManifest | null,
        private readonly logger: Logger
    ) {}

    check(apiPath: string): void {
        const privilege = API_PRIVILEGES[apiPath];
        if (!privilege || this.warned.has(apiPath)) {
            return;
        }
        const manifest = this.manifestProvider();
        if (!manifest) {
            return;
        }
        const granted = (manifest.privileges || []).some((entry) => entry && entry.name === privilege);
        if (!granted) {
            this.warned.add(apiPath);
            this.logger.log('warn', `[tvemu] ${apiPath} needs privilege ${privilege} in config.xml`);
        }
    }
}
