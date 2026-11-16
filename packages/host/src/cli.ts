#!/usr/bin/env node
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import {
    DEFAULT_PROFILES,
    ENGINE_REGISTRY,
    cleanStaleUserDataLocks,
    downloadEngine,
    resolveEngine,
} from '@tvemu/engine';
import {
    SDB_DEFAULT_PORT,
    TVEMU_HOME_ENV,
    type DeviceProfile,
    type InstalledApp,
    type KeyAction,
} from '@tvemu/protocol';
import { createAppStore, loadTpkModule } from '@tvemu/wgt';
import { createHost, type TvemuHost } from './host.js';
import {
    checkNuiRuntimeAvailable,
    inspectDotnetAssembly,
    probeDotnetVersion,
    resolveNuiHostDllPath,
    type NuiInspectReport,
} from './nui-runtime.js';
import { loadDeviceProfile, parseProfileSetArgs, selectDeviceProfile } from './profile.js';
import { formatUiSnapshot, type UiSnapshot } from './agent.js';
import { callControl, requireRunning, startDetached } from './control-client.js';
import { runMcpServer } from './mcp.js';
import { resolveVideoPlaneHelper } from './native-video.js';
import { readRunState } from './run-file.js';

const execFileAsync = promisify(execFile);

export interface CliIo {
    stdout: (line: string) => void;
    stderr: (line: string) => void;
}

const DEFAULT_IO: CliIo = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
};

export function resolveTvemuHome(env: NodeJS.ProcessEnv = process.env): string {
    const raw = env[TVEMU_HOME_ENV]?.trim();
    if (raw) {
        return path.resolve(raw);
    }
    return path.join(os.homedir(), '.tvemu');
}

function usageText(): string {
    return [
        'Usage: tvemu <command> [options]',
        '',
        'Commands:',
        '  start [--profile <name>] [--scale <n>] [--headless] [--no-sdb] [--no-remote] [--detach]',
        '        [--strict-engine] [--set <key=value>] [--map-origin <origin>=<local origin>]',
        '  run <appId|packageId|file.wgt|file.tpk>   same options as start',
        '  install <file.wgt|file.tpk>',
        '  uninstall <packageId>',
        '  list',
        '  inspect <file.tpk|installed id>',
        '  status [--json]',
        '  key <name>... [--repeat <n>] [--delay <ms>] [--action press|down|up] [--ui]',
        '  type <text> [--append]',
        '  focus <text> [--enter]',
        '  ui [--json]',
        '  wait [--text <t>] [--gone <t>] [--focus <t>] [--exited] [--timeout <ms>] [--json]',
        '  screenshot <out.png>',
        '  logs [--since <seq>] [--engine] [--json]',
        '  mcp',
        '  stop',
        '  profiles',
        '  doctor',
        '  engine list | install <milestone>',
    ].join('\n');
}

async function openRemoteUiWindow(
    home: string,
    profile: DeviceProfile,
    remoteUrl: string,
    io: CliIo,
    env: NodeJS.ProcessEnv,
): Promise<ChildProcess | null> {
    let executablePath: string;
    try {
        const resolved = await resolveEngine(profile.chromiumMilestone, { home, env });
        executablePath = resolved.executablePath;
    } catch {
        io.stderr(`[cli] remote UI window skipped (no Chromium binary for milestone ${profile.chromiumMilestone}); open ${remoteUrl}`);
        return null;
    }

    const remoteDataDir = path.join(home, 'profiles', '_remote');
    await cleanStaleUserDataLocks(remoteDataDir);

    const args = [
        `--user-data-dir=${remoteDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate',
        '--window-size=760,820',
    ];
    if (profile.chromiumMilestone <= 76) {
        args.push('--no-sandbox');
    }
    args.push(`--app=${remoteUrl}`);

    const child = spawn(executablePath, args, { stdio: 'ignore' });
    child.on('error', (error) => {
        io.stderr(`[cli] remote UI window error: ${error.message}`);
    });
    return child;
}

function killRemoteChild(child: ChildProcess | null): void {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    child.kill('SIGTERM');
}

function parseStartRunFlags(args: string[]): {
    positionals: string[];
    profile?: string;
    scale?: number;
    headless: boolean;
    noSdb: boolean;
    noRemote: boolean;
    strictEngine: boolean;
    detach: boolean;
    mapOrigins: string[];
    setOverrides: Record<string, unknown>;
} {
    const parsed = parseArgs({
        args,
        allowPositionals: true,
        options: {
            profile: { type: 'string' },
            scale: { type: 'string' },
            headless: { type: 'boolean', default: false },
            'no-sdb': { type: 'boolean', default: false },
            'no-remote': { type: 'boolean', default: false },
            'strict-engine': { type: 'boolean', default: false },
            set: { type: 'string', multiple: true },
            detach: { type: 'boolean', default: false },
            'map-origin': { type: 'string', multiple: true },
        },
    });
    let scale: number | undefined;
    if (parsed.values.scale !== undefined) {
        scale = Number(parsed.values.scale);
        if (!Number.isFinite(scale) || scale <= 0) {
            throw new Error(`Invalid --scale value: ${parsed.values.scale}`);
        }
    }
    const setOverrides = parseProfileSetArgs(parsed.values.set ?? []);
    return {
        positionals: parsed.positionals,
        profile: parsed.values.profile,
        scale,
        headless: parsed.values.headless,
        noSdb: parsed.values['no-sdb'],
        noRemote: parsed.values['no-remote'],
        strictEngine: parsed.values['strict-engine'],
        detach: parsed.values.detach,
        mapOrigins: parsed.values['map-origin'] ?? [],
        setOverrides,
    };
}

function formatAppList(apps: InstalledApp[]): string {
    if (apps.length === 0) {
        return 'No apps installed.';
    }
    return apps
        .map((app) => {
            const kind = app.manifest.kind ?? 'wgt';
            return `${kind}\t${app.manifest.appId}\t${app.manifest.packageId}\t${app.manifest.name}\tv${app.manifest.version}`;
        })
        .join('\n');
}

async function isRegularFile(targetPath: string): Promise<boolean> {
    try {
        const info = await stat(targetPath);
        return info.isFile();
    } catch {
        return false;
    }
}

async function isPackageTarget(target: string): Promise<boolean> {
    if (await isRegularFile(path.resolve(target))) {
        return true;
    }
    const lower = target.toLowerCase();
    return lower.endsWith('.wgt') || lower.endsWith('.tpk');
}

function formatInspectReport(
    label: string,
    execName: string,
    report: NuiInspectReport,
    io: CliIo,
): void {
    io.stdout(`Package: ${label}`);
    io.stdout(`Exec: ${execName}`);
    io.stdout(`Supported: ${report.supported.length}`);
    io.stdout(`Missing: ${report.missing.length}`);
    if (report.missing.length > 0) {
        io.stdout('Missing members:');
        for (const member of report.missing) {
            io.stdout(`  - ${member}`);
        }
    }
    if (report.supported.length > 0) {
        io.stdout('Supported members:');
        for (const member of report.supported) {
            io.stdout(`  + ${member}`);
        }
    }
}

async function isExecutableFile(targetPath: string): Promise<boolean> {
    try {
        const info = await stat(targetPath);
        if (!info.isFile()) {
            return false;
        }
        await access(targetPath, fsConstants.X_OK);
        return true;
    } catch {
        return false;
    }
}

async function findExecutableInPath(binaryName: string, pathEnv: string | undefined): Promise<string | null> {
    if (!pathEnv) {
        return null;
    }
    for (const dir of pathEnv.split(path.delimiter)) {
        const trimmed = dir.trim();
        if (!trimmed) {
            continue;
        }
        const candidate = path.join(trimmed, binaryName);
        if (await isExecutableFile(candidate)) {
            return candidate;
        }
    }
    return null;
}

async function checkRosettaStatus(): Promise<string> {
    try {
        await execFileAsync('arch', ['-x86_64', '/usr/bin/true']);
        return 'available';
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return `unavailable (${detail})`;
    }
}

async function checkPortFree(port: number): Promise<{ free: boolean; detail: string }> {
    return new Promise((resolve) => {
        const server = createNetServer();
        server.once('error', (error: NodeJS.ErrnoException) => {
            const detail = error.code ? `${error.code}` : error.message;
            resolve({ free: false, detail: `in use (${detail})` });
        });
        server.listen(port, '127.0.0.1', () => {
            server.close(() => {
                resolve({ free: true, detail: 'free' });
            });
        });
    });
}

async function runDoctor(home: string, io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
    const rosetta = await checkRosettaStatus();
    const sdbPortStatus = await checkPortFree(SDB_DEFAULT_PORT);
    const sdbOnPath = await findExecutableInPath('sdb', env.PATH);
    const userHome = env.HOME || os.homedir();
    const studioSdbPath = path.join(userHome, 'tizen-studio', 'tools', 'sdb');
    const sdbInStudio = (await isExecutableFile(studioSdbPath)) ? studioSdbPath : null;
    const dotnetVersion = await probeDotnetVersion(env);
    const nuiHostPath = resolveNuiHostDllPath(env);
    const nuiBuilt = await isRegularFile(nuiHostPath);

    io.stdout(`Node.js: ${process.version}`);
    io.stdout(`Arch: ${process.arch} (${process.platform})`);
    io.stdout(`Rosetta 2 (arch -x86_64 /usr/bin/true): ${rosetta}`);
    io.stdout(`Home dir: ${home}`);
    io.stdout(`Port ${SDB_DEFAULT_PORT}: ${sdbPortStatus.detail}`);
    io.stdout(`Samsung sdb (PATH): ${sdbOnPath ?? 'not found'}`);
    io.stdout(`Samsung sdb (~/tizen-studio/tools/sdb): ${sdbInStudio ?? 'not found'}`);
    const videoHelper = resolveVideoPlaneHelper(env);
    io.stdout(`Video plane: ${videoHelper ? `native (${videoHelper})` : 'browser engine only (run: pnpm build:video for H.264/HLS)'}`);
    io.stdout(`dotnet: ${dotnetVersion ?? 'not found'}`);
    io.stdout(
        `NUI runtime: ${
            nuiBuilt
                ? `built (${nuiHostPath})`
                : `not built (${nuiHostPath}; run: dotnet build dotnet/Tvemu.sln -c Release)`
        }`,
    );
    io.stdout('Profiles:');

    for (const baseProfile of DEFAULT_PROFILES) {
        const profile = await loadDeviceProfile(home, baseProfile);
        let status = 'missing';
        try {
            const resolved = await resolveEngine(profile.chromiumMilestone, { home, env });
            status = resolved.exact
                ? `exact (${resolved.source}: ${resolved.version}) [${resolved.executablePath}]`
                : `APPROXIMATE (Chromium ${resolved.version} instead of M${profile.chromiumMilestone}, ` +
                  `${resolved.source}) [${resolved.executablePath}]`;
        } catch {
        }
        io.stdout(`  ${profile.name}\tTizen ${profile.tizenVersion}\tM${profile.chromiumMilestone}\t${status}`);
    }

    return 0;
}

async function runForegroundHost(
    home: string,
    profile: DeviceProfile,
    flags: { scale?: number; headless: boolean; noSdb: boolean; noRemote: boolean; strictEngine: boolean },
    io: CliIo,
    env: NodeJS.ProcessEnv,
    afterStart?: (host: TvemuHost) => Promise<void>,
): Promise<void> {
    let remoteChild: ChildProcess | null = null;
    let hostRef: TvemuHost | null = null;
    let closed = false;

    const cleanup = (): void => {
        if (closed) {
            return;
        }
        closed = true;
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        killRemoteChild(remoteChild);
        remoteChild = null;
    };

    const shutdown = async (): Promise<void> => {
        cleanup();
        if (hostRef) {
            await hostRef.stop();
        }
    };

    const onSignal = (): void => {
        void shutdown().finally(() => {
            process.exitCode = 0;
        });
    };

    const host = createHost({
        home,
        profile,
        headless: flags.headless,
        scale: flags.scale,
        sdbPort: flags.noSdb ? false : undefined,
        strictEngine: flags.strictEngine,
        env,
        log: (line) => io.stdout(line),
        onStopRequested: cleanup,
    });
    hostRef = host;

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
        await host.start();
        io.stdout(`Remote UI: ${host.urls().remote}`);
        if (afterStart) {
            await afterStart(host);
        }
        if (!flags.noRemote && !flags.headless) {
            remoteChild = await openRemoteUiWindow(home, profile, host.urls().remote, io, env);
        }
    } catch (error) {
        await shutdown();
        throw error;
    }
}

function withOriginMap(env: NodeJS.ProcessEnv, mapOrigins: string[]): NodeJS.ProcessEnv {
    return mapOrigins.length === 0 ? env : { ...env, TVEMU_HTTP_MAP: mapOrigins.join(';') };
}

async function runDetached(home: string, command: 'start' | 'run', args: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
    const started = await startDetached(home, command, args.filter((arg) => arg !== '--detach'), env);
    io.stdout(`Emulator started in the background (pid ${started.pid}, port ${started.port}).`);
    io.stdout(`Log: ${started.logPath}`);
    if (started.running) {
        io.stdout(`Running ${started.running.manifest.appId}`);
    }
    return 0;
}

export async function runCli(argv: string[], io: CliIo = DEFAULT_IO, inputEnv: NodeJS.ProcessEnv = process.env): Promise<number> {
    let env = inputEnv;
    const command = argv[0];
    if (!command || command === '--help' || command === '-h' || command === 'help') {
        io.stdout(usageText());
        return 0;
    }

    const home = resolveTvemuHome(env);
    const rest = argv.slice(1);

    try {
        switch (command) {
            case 'start': {
                const flags = parseStartRunFlags(rest);
                if (flags.detach) {
                    return await runDetached(home, 'start', rest, io, env);
                }
                env = withOriginMap(env, flags.mapOrigins);
                const existing = await readRunState(home);
                if (existing) {
                    throw new Error(`Emulator is already running (pid ${existing.pid}, port ${existing.port})`);
                }
                const selection = await selectDeviceProfile(home, flags.profile, {
                    env,
                    overrides: flags.setOverrides,
                    strictEngine: flags.strictEngine,
                });
                io.stdout(`Selected profile: ${selection.profile.name} (${selection.reason})`);
                if (selection.resolved && !selection.resolved.exact) {
                    io.stdout(
                        `WARNING: Approximate engine for ${selection.profile.name}: ` +
                        `running Chromium ${selection.resolved.version} instead of ` +
                        `M${selection.profile.chromiumMilestone} (${selection.resolved.source})`,
                    );
                }
                await runForegroundHost(home, selection.profile, flags, io, env);
                return 0;
            }

            case 'install': {
                const { positionals } = parseArgs({ args: rest, allowPositionals: true });
                const rawPath = positionals[0];
                if (!rawPath) {
                    throw new Error('Usage: tvemu install <file.wgt|file.tpk>');
                }
                const wgtPath = path.resolve(rawPath);
                const existing = await readRunState(home);
                let app: InstalledApp;
                if (existing) {
                    const response = await callControl<{ app: InstalledApp }>(existing, 'install', { wgtPath });
                    app = response.app;
                } else {
                    const store = createAppStore(home);
                    app = await store.install(wgtPath);
                }
                io.stdout(`Installed ${app.manifest.appId} (${app.manifest.packageId}) v${app.manifest.version}`);
                return 0;
            }

            case 'run': {
                const flags = parseStartRunFlags(rest);
                const target = flags.positionals[0];
                if (!target) {
                    throw new Error('Usage: tvemu run <appId|packageId|file.wgt|file.tpk> [--profile <name>]');
                }
                const isPackage = await isPackageTarget(target);
                const existing = await readRunState(home);
                if (flags.detach && !existing) {
                    return await runDetached(home, 'run', rest, io, env);
                }
                env = withOriginMap(env, flags.mapOrigins);
                if (existing) {
                    if (flags.mapOrigins.length > 0) {
                        io.stderr('--map-origin is ignored: the emulator is already running. Stop it and start again to change it.');
                    }
                    let appId = target;
                    if (isPackage) {
                        const wgtPath = path.resolve(target);
                        const installed = await callControl<{ app: InstalledApp }>(existing, 'install', { wgtPath });
                        appId = installed.app.manifest.appId;
                    } else {
                        const listed = await callControl<{ apps: InstalledApp[] }>(existing, 'list');
                        const match = listed.apps.find(
                            (app) => app.manifest.appId === target || app.manifest.packageId === target,
                        );
                        if (match) {
                            appId = match.manifest.appId;
                        }
                    }
                    await callControl(existing, 'launch', { appId });
                    io.stdout(`Launched ${appId}`);
                    return 0;
                }

                const selection = await selectDeviceProfile(home, flags.profile, {
                    env,
                    overrides: flags.setOverrides,
                    strictEngine: flags.strictEngine,
                });
                io.stdout(`Selected profile: ${selection.profile.name} (${selection.reason})`);
                if (selection.resolved && !selection.resolved.exact) {
                    io.stdout(
                        `WARNING: Approximate engine for ${selection.profile.name}: ` +
                        `running Chromium ${selection.resolved.version} instead of ` +
                        `M${selection.profile.chromiumMilestone} (${selection.resolved.source})`,
                    );
                }
                await runForegroundHost(home, selection.profile, flags, io, env, async (host) => {
                    let appId = target;
                    if (isPackage) {
                        const app = await host.installWgt(path.resolve(target));
                        appId = app.manifest.appId;
                        io.stdout(`Installed ${app.manifest.appId} (${app.manifest.packageId})`);
                    } else {
                        const apps = await host.listApps();
                        const match = apps.find(
                            (app) => app.manifest.appId === target || app.manifest.packageId === target,
                        );
                        if (!match) {
                            throw new Error(`App not found: ${target}`);
                        }
                        appId = match.manifest.appId;
                    }
                    await host.launch(appId);
                    io.stdout(`Running ${appId} at ${host.urls().app ?? ''}`);
                });
                return 0;
            }

            case 'uninstall': {
                const { positionals } = parseArgs({ args: rest, allowPositionals: true });
                const packageId = positionals[0];
                if (!packageId) {
                    throw new Error('Usage: tvemu uninstall <packageId>');
                }
                const existing = await readRunState(home);
                if (existing) {
                    await callControl(existing, 'uninstall', { packageId });
                } else {
                    await createAppStore(home).uninstall(packageId);
                }
                io.stdout(`Uninstalled ${packageId}`);
                return 0;
            }

            case 'list': {
                const existing = await readRunState(home);
                let apps: InstalledApp[];
                if (existing) {
                    const res = await callControl<{ apps: InstalledApp[] }>(existing, 'list');
                    apps = res.apps;
                } else {
                    apps = await createAppStore(home).list();
                }
                io.stdout(formatAppList(apps));
                return 0;
            }

            case 'inspect': {
                const { positionals } = parseArgs({ args: rest, allowPositionals: true });
                const target = positionals[0];
                if (!target) {
                    throw new Error('Usage: tvemu inspect <file.tpk|installed id>');
                }
                const runtime = await checkNuiRuntimeAvailable(env);
                const store = createAppStore(home);
                const tpkPath = path.resolve(target);
                const isFile = await isRegularFile(tpkPath);
                const installed = isFile
                    ? null
                    : (await store.findByAppId(target)) ??
                      (!target.startsWith('.') && !/[\\/:\0]/.test(target)
                          ? await store.findByPackageId(target)
                          : null);
                if (installed) {
                    if (installed.manifest.kind !== 'tpk') {
                        throw new Error(`App ${installed.manifest.appId} is not a .tpk package`);
                    }
                    const execName = installed.manifest.exec ?? installed.manifest.contentSrc;
                    const assemblyPath = path.join(store.contentDir(installed), 'bin', execName);
                    const report = await inspectDotnetAssembly({
                        command: runtime.command,
                        hostDllPath: runtime.hostDllPath,
                        assemblyPath,
                        env,
                    });
                    formatInspectReport(
                        `${installed.manifest.packageId} (${installed.manifest.appId})`,
                        execName,
                        report,
                        io,
                    );
                    return report.missing.length > 0 ? 2 : 0;
                }

                if (!isFile) {
                    throw new Error(`Package or installed app not found: ${target}`);
                }
                const tpk = await loadTpkModule();
                if (!tpk) {
                    throw new Error('@tvemu/tpk is required to inspect .tpk files');
                }
                if (!(await tpk.isTpk(tpkPath))) {
                    throw new Error(`Not a .tpk package: ${tpkPath}`);
                }
                const manifest = await tpk.readTpkManifest(tpkPath);
                const uiApp = tpk.mainUiApp(manifest);
                const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tvemu-inspect-'));
                try {
                    await tpk.extractTpk(tpkPath, tempDir);
                    const assemblyPath = path.join(tempDir, 'bin', uiApp.exec);
                    const report = await inspectDotnetAssembly({
                        command: runtime.command,
                        hostDllPath: runtime.hostDllPath,
                        assemblyPath,
                        env,
                    });
                    formatInspectReport(`${manifest.packageId} (${uiApp.appId})`, uiApp.exec, report, io);
                    return report.missing.length > 0 ? 2 : 0;
                } finally {
                    await rm(tempDir, { recursive: true, force: true });
                }
            }

            case 'profiles': {
                for (const baseProfile of DEFAULT_PROFILES) {
                    const profile = await loadDeviceProfile(home, baseProfile);
                    let availability = 'missing';
                    try {
                        const resolved = await resolveEngine(profile.chromiumMilestone, { home, env });
                        availability = resolved.exact
                            ? `exact (${resolved.source}: ${resolved.version})`
                            : `APPROXIMATE (Chromium ${resolved.version} instead of M${profile.chromiumMilestone}) [${resolved.source}]`;
                    } catch {
                    }
                    io.stdout(
                        `${profile.name}\tTizen ${profile.tizenVersion}\tM${profile.chromiumMilestone}\t${availability}\t${profile.label}`,
                    );
                }
                return 0;
            }

            case 'doctor':
                return await runDoctor(home, io, env);

            case 'engine': {
                const sub = rest[0];
                if (sub === 'list') {
                    for (const entry of ENGINE_REGISTRY) {
                        let status = 'not installed';
                        try {
                            const resolved = await resolveEngine(entry.milestone, { home, env });
                            status = resolved.exact
                                ? `exact (${resolved.source}: ${resolved.version})`
                                : `APPROXIMATE (Chromium ${resolved.version} instead of M${entry.milestone}) [${resolved.source}]`;
                        } catch {
                        }
                        const verifiedLabel = entry.verified ? 'verified' : 'unverified';
                        const row = [
                            `M${entry.milestone}`,
                            `Tizen ${entry.tizenVersion}`,
                            String(entry.modelYear),
                            entry.platform,
                            verifiedLabel,
                            status,
                        ].join('\t');
                        io.stdout(row);
                    }
                    return 0;
                }
                if (sub === 'install') {
                    const rawMilestone = rest[1];
                    const milestone = rawMilestone ? Number.parseInt(rawMilestone, 10) : Number.NaN;
                    if (!Number.isInteger(milestone)) {
                        throw new Error('Usage: tvemu engine install <milestone>');
                    }
                    io.stdout(`Downloading Chromium M${milestone}...`);
                    let lastPercent = -1;
                    const result = await downloadEngine(milestone, {
                        home,
                        onProgress: ({ receivedBytes, totalBytes }) => {
                            if (totalBytes && totalBytes > 0) {
                                const pct = Math.floor((receivedBytes / totalBytes) * 100);
                                if (pct >= lastPercent + 10 || pct === 100) {
                                    lastPercent = pct;
                                    io.stdout(`  ${pct}% (${receivedBytes}/${totalBytes} bytes)`);
                                }
                            }
                        },
                    });
                    io.stdout(
                        `Installed M${milestone} to ${result.installDir} (${result.executablePath ?? 'no executable'}) sha256=${result.sha256}`,
                    );
                    return 0;
                }
                throw new Error('Usage: tvemu engine list | install <milestone>');
            }

            case 'key': {
                const parsed = parseArgs({
                    args: rest,
                    allowPositionals: true,
                    options: {
                        action: { type: 'string', default: 'press' },
                        repeat: { type: 'string', default: '1' },
                        delay: { type: 'string', default: '150' },
                        ui: { type: 'boolean', default: false },
                    },
                });
                const keyNames = parsed.positionals;
                if (keyNames.length === 0) {
                    throw new Error('Usage: tvemu key <name>... [--repeat <n>] [--delay <ms>] [--action press|down|up] [--ui]');
                }
                const action = parsed.values.action;
                if (action !== 'press' && action !== 'down' && action !== 'up') {
                    throw new Error(`Invalid --action: ${action}. Expected press, down, or up`);
                }
                const repeat = Number(parsed.values.repeat);
                const delay = Number(parsed.values.delay);
                if (!Number.isInteger(repeat) || repeat < 1 || !Number.isFinite(delay) || delay < 0) {
                    throw new Error('Invalid --repeat or --delay value');
                }
                const existing = await requireRunning(home);
                const sequence = Array.from({ length: repeat }, () => keyNames).flat();
                for (const [index, keyName] of sequence.entries()) {
                    await callControl(existing, 'key', { key: keyName, action: action as KeyAction });
                    if (index < sequence.length - 1 || parsed.values.ui) {
                        await new Promise((resolve) => setTimeout(resolve, delay));
                    }
                }
                io.stdout(`Sent ${sequence.length === 1 ? `key ${sequence[0]}` : `keys ${sequence.join(' ')}`} (${action})`);
                if (parsed.values.ui) {
                    const settled = await callControl<{ snapshot: UiSnapshot; running: InstalledApp | null }>(existing, 'wait', { timeoutMs: 3000 })
                        .catch(() => null);
                    io.stdout(settled?.running ? formatUiSnapshot(settled.snapshot) : 'No app is running.');
                }
                return 0;
            }

            case 'ui': {
                const parsed = parseArgs({ args: rest, options: { json: { type: 'boolean', default: false } } });
                const existing = await requireRunning(home);
                const response = await callControl<{ snapshot: UiSnapshot }>(existing, 'ui');
                io.stdout(parsed.values.json ? JSON.stringify(response.snapshot, null, 2) : formatUiSnapshot(response.snapshot));
                return 0;
            }

            case 'type': {
                const parsed = parseArgs({ args: rest, allowPositionals: true, options: { append: { type: 'boolean', default: false } } });
                if (parsed.positionals.length !== 1) {
                    throw new Error('Usage: tvemu type <text> [--append]');
                }
                const existing = await requireRunning(home);
                await callControl(existing, 'type', { text: parsed.positionals[0], mode: parsed.values.append ? 'append' : 'replace' });
                io.stdout(`Typed ${parsed.positionals[0]!.length} characters`);
                return 0;
            }

            case 'focus': {
                const parsed = parseArgs({ args: rest, allowPositionals: true, options: { enter: { type: 'boolean', default: false } } });
                if (parsed.positionals.length !== 1) {
                    throw new Error('Usage: tvemu focus <text> [--enter]');
                }
                const existing = await requireRunning(home);
                const response = await callControl<{ snapshot: UiSnapshot }>(existing, 'focus', { text: parsed.positionals[0] });
                if (parsed.values.enter) {
                    await callControl(existing, 'key', { key: 'Enter', action: 'press' });
                    io.stdout(`Focused "${parsed.positionals[0]}" and pressed Enter`);
                } else {
                    io.stdout(formatUiSnapshot(response.snapshot));
                }
                return 0;
            }

            case 'wait': {
                const parsed = parseArgs({
                    args: rest,
                    options: {
                        text: { type: 'string' },
                        gone: { type: 'string' },
                        focus: { type: 'string' },
                        exited: { type: 'boolean', default: false },
                        timeout: { type: 'string', default: '10000' },
                        json: { type: 'boolean', default: false },
                    },
                });
                const timeoutMs = Number(parsed.values.timeout);
                if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                    throw new Error(`Invalid --timeout value: ${parsed.values.timeout}`);
                }
                const existing = await requireRunning(home);
                const response = await callControl<{ snapshot: UiSnapshot; running: InstalledApp | null }>(existing, 'wait', {
                    text: parsed.values.text,
                    gone: parsed.values.gone,
                    focus: parsed.values.focus,
                    exited: parsed.values.exited,
                    timeoutMs,
                });
                if (!response.running) {
                    io.stdout('No app is running.');
                } else {
                    io.stdout(parsed.values.json ? JSON.stringify(response.snapshot, null, 2) : formatUiSnapshot(response.snapshot));
                }
                return 0;
            }

            case 'status': {
                const parsed = parseArgs({ args: rest, options: { json: { type: 'boolean', default: false } } });
                const existing = await readRunState(home);
                if (!existing) {
                    io.stdout(parsed.values.json ? JSON.stringify({ emulator: 'stopped' }) : 'The emulator is not running.');
                    return 0;
                }
                const status = await callControl<{ running: InstalledApp | null; apps: InstalledApp[]; profile: DeviceProfile; urls: unknown }>(existing, 'status');
                if (parsed.values.json) {
                    io.stdout(JSON.stringify({ emulator: 'running', pid: existing.pid, port: existing.port, ...status }, null, 2));
                } else {
                    io.stdout(`Emulator running (pid ${existing.pid}, port ${existing.port}), profile ${status.profile.name}`);
                    io.stdout(status.running ? `Running app: ${status.running.manifest.appId}` : 'No app is running.');
                }
                return 0;
            }

            case 'logs': {
                const parsed = parseArgs({
                    args: rest,
                    options: { since: { type: 'string', default: '0' }, engine: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } },
                });
                const existing = await requireRunning(home);
                const response = await callControl<{ logs: { seq: number; at: number; line: string }[] }>(existing, 'logs', {
                    since: Number(parsed.values.since) || 0,
                });
                const entries = response.logs.filter((entry) => parsed.values.engine || !entry.line.includes('[chromium:stderr]'));
                io.stdout(parsed.values.json ? JSON.stringify(entries) : entries.map((entry) => `${entry.seq}\t${entry.line}`).join('\n'));
                return 0;
            }

            case 'mcp': {
                await runMcpServer(home, env);
                return 0;
            }

            case 'screenshot': {
                const { positionals } = parseArgs({ args: rest, allowPositionals: true });
                const outPath = positionals[0];
                if (!outPath) {
                    throw new Error('Usage: tvemu screenshot <out.png>');
                }
                const existing = await requireRunning(home);
                const response = await callControl<{ pngBase64: string }>(existing, 'screenshot');
                const resolvedOut = path.resolve(outPath);
                await writeFile(resolvedOut, Buffer.from(response.pngBase64, 'base64'));
                io.stdout(`Saved screenshot to ${resolvedOut}`);
                return 0;
            }

            case 'stop': {
                const existing = await readRunState(home);
                if (!existing) {
                    throw new Error('No running emulator found');
                }
                await callControl(existing, 'stop');
                io.stdout('Emulator stopped.');
                return 0;
            }

            default:
                throw new Error(`Unknown command: ${command}\n\n${usageText()}`);
        }
    } catch (error) {
        io.stderr(error instanceof Error ? error.message : String(error));
        return 1;
    }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntrypoint) {
    void runCli(process.argv.slice(2)).then((code) => {
        if (code !== 0) {
            process.exitCode = code;
        }
    });
}
