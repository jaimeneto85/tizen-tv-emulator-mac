import type { HostApi } from '@tvemu/protocol';
import { DeviceFiles } from './device-files.js';
import { SDK_TOOLS } from './device-identity.js';
export async function appCommand(command: string, host: HostApi, files: DeviceFiles): Promise<string> {
    const [verb, ...args] = command.split(':');
    try {
        if (['uninstall', 'packageinfo', 'runapp', 'killapp'].includes(verb ?? '') && !args[0]) {
            throw new Error('Missing application or package ID');
        }
        if (verb === 'install' && (args[0] !== 'wgt' || !args[1])) throw new Error('Expected WGT type and package path');
        let result = '';
        if (verb === 'appinstallpath') result = SDK_TOOLS;
        else if (verb === 'install') {
            const app = await host.installWgt(await files.path(args[1] ?? ''));
            result = `__return_cb pkgid[${app.manifest.packageId}] key[end] val[ok]`;
        } else if (verb === 'uninstall') {
            await host.uninstall(args[0] ?? '');
            result = `__return_cb pkgid[${args[0]}] key[end] val[ok]`;
        } else if (verb === 'packageinfo') {
            const app = (await host.listApps()).find((app) => [app.manifest.packageId, app.manifest.appId].includes(args[0] ?? ''));
            if (!app) throw new Error('package is not installed');
            const running = await host.runningApp();
            result = `${app.manifest.appId}:wgt:1:${running?.manifest.appId === app.manifest.appId ? 1 : 0}`;
        } else if (verb === 'runapp') await host.launch(args[0] ?? '');
        else if (verb === 'killapp') await host.terminate(args[0] ?? '');
        else throw new Error(`Unsupported appcmd: ${verb}`);
        return `appcmd_returnstr:${result}\nappcmd_exitcode:0\n`;
    } catch (error) {
        return `appcmd_returnstr:${error instanceof Error ? error.message : String(error)}\nappcmd_exitcode:1\n`;
    }
}
