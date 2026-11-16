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
import { readRunState, type RunState } from './run-file.js';

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
        '  start [--profile <name>] [--scale <n>] [--headless] [--no-sdb] [--no-remote] ' +
        '[--strict-engine] [--set <key=value>]',
        '  install <file.wgt|file.tpk>',
        '  run <appId|packageId|file.wgt|file.tpk> [--profile <name>] [--scale <n>] [--headless] ' +
        '[--no-sdb] [--no-remote] [--strict-engine] [--set <key=value>]',
        '  uninstall <packageId>',
        '  list',
        '  inspect <file.tpk|installed id>',
        '  profiles',
        '  doctor',
        '  engine list | install <milestone>',
        '  key <name> [--action press|down|up]',
        '  screenshot <out.png>',
        '  stop',
    ].join('\n');
}

async function callControl<T extends Record<string, unknown>>(
    runState: RunState,
    command: string,
    body?: Record<string, unknown>,
): Promise<T> {
    const response = await fetch(`http://127.0.0.1:${runState.port}/control/${command}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${runState.token}`,
        },
        body: JSON.stringify(body ?? {}),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string } & T;
    if (!response.ok || !data.ok) {
        throw new Error(data.error ?? `Control request ${command} failed with HTTP ${response.status}`);
    }
    return data;
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

export async function runCli(argv: string[], io: CliIo = DEFAULT_IO, env: NodeJS.ProcessEnv = process.env): Promise<number> {
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
                if (existing) {
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
                    const assemblyPath = path.isAbsolute(execName)
                        ? execName
                        : path.join(store.contentDir(installed), 'bin', execName);
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
                    },
                });
                const keyName = parsed.positionals[0];
                if (!keyName) {
                    throw new Error('Usage: tvemu key <name> [--action press|down|up]');
                }
                const action = parsed.values.action;
                if (action !== 'press' && action !== 'down' && action !== 'up') {
                    throw new Error(`Invalid --action: ${action}. Expected press, down, or up`);
                }
                const existing = await readRunState(home);
                if (!existing) {
                    throw new Error('No running emulator found');
                }
                await callControl(existing, 'key', { key: keyName, action: action as KeyAction });
                io.stdout(`Sent key ${keyName} (${action})`);
                return 0;
            }

            case 'screenshot': {
                const { positionals } = parseArgs({ args: rest, allowPositionals: true });
                const outPath = positionals[0];
                if (!outPath) {
                    throw new Error('Usage: tvemu screenshot <out.png>');
                }
                const existing = await readRunState(home);
                if (!existing) {
                    throw new Error('No running emulator found');
                }
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
