import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import type { HostApi } from '@tvemu/protocol';
import { APP_ROOT, SDK_TOOLS } from './device-identity.js';
import { DeviceFiles } from './device-files.js';
export interface ShellResult { output: string; exitCode: number }
export function tokenize(command: string): string[] {
    const tokens: string[] = [];
    let word = '';
    let quote = '';
    let escaped = false;
    for (const char of command.trim()) {
        if (escaped) { word += char; escaped = false; }
        else if (char === '\\' && quote !== "'") escaped = true;
        else if (quote) { if (char === quote) quote = ''; else word += char; }
        else if (char === '"' || char === "'") quote = char;
        else if (/\s/.test(char)) { if (word) tokens.push(word); word = ''; }
        else word += char;
    }
    if (quote || escaped) throw new Error('Unterminated quote');
    if (word) tokens.push(word);
    return tokens;
}
export class DeviceShell {
    constructor(private readonly host: HostApi, private readonly files: DeviceFiles) {}
    async execute(command: string): Promise<ShellResult> {
        const statusSuffix = /;\s*echo cmd_ret:\$\?$/.test(command);
        try {
            const output = await this.dispatch(command.replace(/;\s*echo cmd_ret:\$\?$/, ''));
            const exitCode = output.startsWith('sh: ') && output.endsWith(': command not found\n') ? 127 : 0;
            return { output: output + (statusSuffix ? `cmd_ret:${exitCode}\n` : ''), exitCode };
        }
        catch (error) {
            const output = `${error instanceof Error ? error.message : String(error)}\n` + (statusSuffix ? 'cmd_ret:1\n' : '');
            return { output, exitCode: 1 };
        }
    }
    private pluginCommand(tokens: string[]): string[] {
        const [verb, ...args] = tokens;
        const commands: Record<string, string[]> = {
            vd_appinstall: ['wascmd', '-i', args[0] ?? '', '-p', args[1] ?? ''],
            vd_appuninstall: ['wascmd', '-u', ...args], was_execute: ['wascmd', '-r', ...args],
            was_kill: ['wascmd', '-t', ...args], vd_applist: ['wascmd', '-l'], applist: ['wascmd', '-l'],
            appinstall: ['pkgcmd', '-i', '-t', args[0] ?? '', '-p',
                args[1]?.startsWith('/') ? args[1] : `${SDK_TOOLS}/${args[1] ?? ''}`],
            appuninstall: ['pkgcmd', '-u', '-n', ...args], runcheck: ['pkgcmd', '-C', '-n', ...args],
            kill: ['pkgcmd', '-k', '-n', ...args], getappinstallpath: ['pkgcmd', '-a'],
            execute: ['app_launcher', '--start', ...args], execute_log: ['app_launcher', '--start', ...args],
            list_showcontrol: ['ls', ...args], launchercheck: ['echo', '/usr/bin/app_launcher'],
            debug: ['app_launcher', '--start', ...args, '--web-debug'], uname: ['uname', '-m'],
            get_user_home: ['whoami'], getvmname: ['echo', '1'], getduid: ['echo', this.host.deviceInfo().duid],
            getduidgadget: ['echo', this.host.deviceInfo().duid],
            mkdir: ['mkdir', '-p', '/tmp', `${SDK_TOOLS}/tmp`],
        };
        return commands[verb ?? ''] ?? ['unsupported-plugin-command'];
    }
    private async dispatch(command: string): Promise<string> {
        const tokens = tokenize(command);
        if (tokens[0] === '0' && tokens[1] === 'rmfile') {
            if (tokens.length > 3) throw new Error('Invalid plugin arguments');
            if (tokens[2]) {
                const remote = tokens[2].startsWith('/') ? tokens[2] : `${SDK_TOOLS}/${tokens[2]}`;
                await rm(await this.files.path(remote), { force: true });
            } else {
                for (const directory of [SDK_TOOLS, `${SDK_TOOLS}/tmp`]) {
                    const path = await this.files.path(directory);
                    const entries = await readdir(path).catch((error: NodeJS.ErrnoException) => {
                        if (error.code === 'ENOENT') return [];
                        throw error;
                    });
                    for (const entry of entries.filter((entry) => /\.(wgt|tpk|rpm)$/.test(entry))) {
                        await rm(await this.files.path(`${directory}/${entry}`), { force: true });
                    }
                }
            }
            return '';
        }
        const expanded = tokens[0] === '0' ? this.pluginCommand(tokens.slice(1))
            : ['appinstall', 'appuninstall'].includes(tokens[0] ?? '') ? this.pluginCommand(tokens) : tokens;
        const name = basename(expanded[0] ?? '');
        const args = expanded.slice(1);
        const option = (...flags: string[]): string => {
            const index = args.findIndex((arg) => flags.includes(arg));
            const value = args[index + 1];
            if (index < 0 || !value) throw new Error('Missing argument');
            return value;
        };
        if (!name || name === 'exit') return '';
        if (name === 'echo') return args.join(' ') + '\n';
        if (name === 'whoami') return 'owner\n';
        if (name === 'uname') return args.includes('-a') ? 'Linux tvemu 5.4.0 x86_64 GNU/Linux\n' : 'x86_64\n';
        if (name === 'getprop') return this.host.deviceInfo().model + '\n';
        if (name === 'profile_command') return this.host.deviceInfo().tizenVersion + '\n';
        if (name === 'cat' && args[0] === '/proc/cmdline' && command.includes('vm_name')) return '1\n';
        if (name === 'pkgcmd' && args.includes('-a')) {
            return command.includes('awk') ? `${APP_ROOT}\n` : `Tizen Application Installation Path: ${APP_ROOT}\n`;
        }
        if (name === 'pkginfo') {
            const id = option('--pkg');
            const app = (await this.host.listApps()).find((app) => app.manifest.packageId === id || app.manifest.appId === id);
            if (!app) return '';
            const fields = {
                Label: app.manifest.name,
                mainappid: app.manifest.appId,
                Type: app.manifest.kind ?? 'wgt',
                Removable: '1',
            };
            return Object.entries(fields).filter(([key]) => !command.includes('|') || command.toLowerCase().includes(key.toLowerCase()))
                .map(([key, value]) => `${key}: ${value}\n`).join('');
        }
        if (['wascmd', 'pkgcmd', 'app_launcher', 'wrt-launcher', 'launch_app'].includes(name)) {
            if (args.includes('--web-debug') || args.includes('--debug') || args.includes('-d') || args.includes('-w')) {
                throw new Error('Web debugging is not supported');
            }
            if (name === 'app_launcher' && (args.includes('-r') || args.includes('--is-running'))) {
                const running = await this.host.runningApp();
                return running?.manifest.appId === option('-r', '--is-running') ? 'result: running\n' : 'result: not running\n';
            }
            if (args.includes('-i')) {
                const app = await this.host.installWgt(await this.files.path(option('-p')));
                const pkgType = app.manifest.kind ?? (args.includes('-t') ? option('-t') : 'wgt');
                return name === 'wascmd' ? `app_id[${app.manifest.appId}] install start\napp_id[${app.manifest.appId}] install completed\n`
                    : `__return_cb req_id[1] pkg_type[${pkgType}] pkgid[${app.manifest.packageId}] key[end] val[ok]\n`;
            }
            if (args.includes('-u')) {
                const id = name === 'wascmd' ? option('-u') : option('-n');
                const app = (await this.host.listApps()).find((app) => app.manifest.appId === id || app.manifest.packageId === id);
                const pkgType = app?.manifest.kind ?? 'wgt';
                await this.host.uninstall(app?.manifest.packageId ?? id);
                return name === 'wascmd' ? `app_id[${id}] uninstall start\napp_id[${id}] uninstall completed\n`
                    : `__return_cb req_id[1] pkg_type[${pkgType}] pkgid[${id}] key[end] val[ok]\n`;
            }
            if (args.includes('-l')) {
                const apps = await this.host.listApps();
                if (name === 'wascmd') return apps.map((app) => Object.entries({
                    app_id: app.manifest.appId, app_title: app.manifest.name,
                    app_installed_path: `${APP_ROOT}/${app.manifest.packageId}`, app_version: app.manifest.version,
                    app_tizen_id: app.manifest.appId, app_package_name: app.manifest.packageId,
                }).map(([key, value]) => `--------------${key.padEnd(38)}=${value}-------------\n`).join('')).join('')
                    + `apps count: ${apps.length}\n`;
                if (name === 'app_launcher') return 'Application List for user 5001\n Name \t AppID \n'
                    + apps.map((app) => `'${app.manifest.name}' '${app.manifest.appId}'\n`).join('');
                return apps.map((app) => `pkg_type [${app.manifest.kind ?? 'wgt'}] pkgid [${app.manifest.packageId}]`
                    + ` name [${app.manifest.name}] version [${app.manifest.version}] storage [internal]\n`).join('');
            }
            if (name === 'pkgcmd' && args.includes('-C')) {
                const id = option('-n');
                const running = await this.host.runningApp();
                return `Pkgid: ${id} is ${running?.manifest.packageId === id ? 'Running' : 'Not Running'}\n`;
            }
            if (args.includes('-k') || args.includes('--kill') || args.includes('-t') || args.includes('--terminate')) {
                const id = args.includes('-n') ? option('-n') : option('-k', '--kill', '-t', '--terminate');
                const app = (await this.host.listApps()).find((app) => app.manifest.packageId === id || app.manifest.appId === id);
                await this.host.terminate(app?.manifest.appId ?? id);
                return name === 'wascmd' ? `terminate app ${id}\napp_id[${id}] terminated\n`
                    : name === 'pkgcmd' ? `Pkgid: ${id} is Running\n` : ` Terminate appId: ${id} (1)\n`;
            }
            const id = name === 'launch_app'
                ? (args.includes('-s') || args.includes('--s') || args.includes('--start') ? option('--start', '--s', '-s') : args[0])
                : option('--start', '--s', '-s', '-r');
            if (!id) throw new Error('Missing application ID');
            await this.host.launch(id, { debug: args.includes('--web-debug') || args.includes('--debug') });
            return name === 'wascmd' ? `app_id[${id}] launch start\napp_id[${id}] launched\n`
                : name === 'wrt-launcher' ? 'result: launched\n' : '... successfully launched pid = 1 with debug 0\n';
        }
        if (name === 'mkdir') {
            for (const directory of args.filter((arg) => !arg.startsWith('-'))) {
                await mkdir(await this.files.path(directory), { recursive: true });
            }
            return '';
        }
        if (name === 'rm') {
            for (const remote of args.filter((arg) => !arg.startsWith('-'))) {
                const path = await this.files.path(remote);
                if (path === this.files.root) throw new Error('Cannot remove device root');
                await rm(path, { force: args.includes('-f'), recursive: args.includes('-r') || args.includes('-rf') });
            }
            return '';
        }
        if (name === 'cat') return await readFile(await this.files.path(args[0] ?? '/'), 'utf8');
        if (name === 'ls') return (await readdir(await this.files.path(args.find((arg) => !arg.startsWith('-')) ?? '/'))).join('\n') + '\n';
        return `sh: ${name}: command not found\n`;
    }
}
