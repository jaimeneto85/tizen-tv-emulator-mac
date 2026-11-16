import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createChromiumEngine, resolveEngine, type ResolvedEngine } from '@tvemu/engine';
import { nuiRendererAssetsDir } from '@tvemu/nui-renderer';
import {
    BRIDGE_MANIFEST_GLOBAL,
    BRIDGE_PROFILE_GLOBAL,
    REMOTE_KEYS,
    SDB_DEFAULT_PORT,
    findRemoteKey,
    type BridgeRequest,
    type BridgeResponse,
    type DeviceProfile,
    type Engine,
    type HostApi,
    type InstalledApp,
    type KeyAction,
    type LaunchOptions,
    type NuiHostMessage,
    type RemoteUiClientMessage,
    type RemoteUiServerMessage,
} from '@tvemu/protocol';
import { remoteUiAssetsDir } from '@tvemu/remote-ui';
import { createAppStore } from '@tvemu/wgt';
import { createHostHttpServer, type ControlResponse, type HostHttpServer } from './http-server.js';
import {
    checkNuiRuntimeAvailable,
    createNuiSession,
    inspectDotnetAssembly,
    type NuiSession,
} from './nui-runtime.js';
import { removeRunState, writeRunState } from './run-file.js';

export interface SdbBridgeInstance {
    start(): Promise<{ port: number }>;
    stop(): Promise<void>;
}

export type SdbBridgeFactory = (options: {
    host: HostApi;
    port?: number;
    home: string;
    serialName?: string;
    log?: (line: string) => void;
}) => SdbBridgeInstance;

export interface EngineFactoryOptions {
    profile: DeviceProfile;
    allowCrossOrigin: boolean;
    log: (line: string) => void;
}

export interface CreateHostOptions {
    home: string;
    profile: DeviceProfile;
    headless?: boolean;
    scale?: number;
    sdbPort?: number | false;
    uiPort?: number;
    strictEngine?: boolean;
    env?: NodeJS.ProcessEnv;
    log?: (line: string) => void;
    controlToken?: string;
    playwrightCacheDir?: string;
    nuiAssetsDir?: string;
    onStopRequested?: () => void;
    createEngine?: (options: EngineFactoryOptions) => Promise<Engine> | Engine;
    loadTizenApiScript?: () => Promise<string | null>;
    loadSdbBridge?: () => Promise<SdbBridgeFactory | null>;
}

export interface TvemuHost extends HostApi {
    start(): Promise<void>;
    stop(): Promise<void>;
    urls(): { remote: string; app: string | null };
    screenshot(): Promise<Buffer>;
    evaluate<T>(expression: string): Promise<T>;
}

interface KeyRepeatEntry {
    cancelled: boolean;
    initialTimer?: ReturnType<typeof setTimeout>;
    repeatTimer?: ReturnType<typeof setInterval>;
}

const KEY_REPEAT_INITIAL_MS = 500;
const KEY_REPEAT_INTERVAL_MS = 100;

function serializeForScript(value: unknown): string {
    return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function buildBootstrapScript(profile: DeviceProfile, manifest: InstalledApp['manifest']): string {
    return (
        `window[${JSON.stringify(BRIDGE_PROFILE_GLOBAL)}] = ${serializeForScript(profile)};\n` +
        `window[${JSON.stringify(BRIDGE_MANIFEST_GLOBAL)}] = ${serializeForScript(manifest)};\n`
    );
}

function resolveAppUrl(app: InstalledApp, port: number): string {
    if (app.manifest.kind === 'tpk') {
        return `http://127.0.0.1:${port}/nui/`;
    }
    const src = app.manifest.contentSrc;
    if (/^https?:\/\//i.test(src)) {
        return src;
    }
    const cleanSrc = src.replace(/^\.?\//, '');
    return `http://127.0.0.1:${port}/app/${encodeURIComponent(app.manifest.packageId)}/${cleanSrc}`;
}

async function defaultLoadTizenApiScript(log: (line: string) => void): Promise<string | null> {
    const pkgName = '@tvemu/tizen-api';
    try {
        const mod = (await import(pkgName)) as { tizenApiBundlePath?: () => string };
        if (typeof mod.tizenApiBundlePath !== 'function') {
            log('[host] @tvemu/tizen-api does not export tizenApiBundlePath; injection disabled');
            return null;
        }
        const bundlePath = mod.tizenApiBundlePath();
        return await readFile(bundlePath, 'utf8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`[host] @tvemu/tizen-api unavailable (${message}); injection disabled`);
        return null;
    }
}

async function defaultLoadSdbBridge(log: (line: string) => void): Promise<SdbBridgeFactory | null> {
    const pkgName = '@tvemu/sdb-bridge';
    try {
        const mod = (await import(pkgName)) as { createSdbBridge?: SdbBridgeFactory };
        if (typeof mod.createSdbBridge !== 'function') {
            log('[host] @tvemu/sdb-bridge does not export createSdbBridge; sdb bridge disabled');
            return null;
        }
        return mod.createSdbBridge;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`[host] @tvemu/sdb-bridge unavailable (${message}); sdb bridge disabled`);
        return null;
    }
}

function normalizeLogLevel(raw: unknown): 'log' | 'warn' | 'error' {
    if (raw === 'warn' || raw === 'error' || raw === 'log') {
        return raw;
    }
    return 'log';
}

function formatApproximateEngineWarning(profile: DeviceProfile, resolved: ResolvedEngine): string {
    return (
        `APPROXIMATE engine: profile ${profile.name} expects M${profile.chromiumMilestone}, ` +
        `running Chromium ${resolved.version} instead of M${profile.chromiumMilestone} (${resolved.source})`
    );
}

export function createHost(options: CreateHostOptions): TvemuHost {
    const appStore = createAppStore(options.home);
    const controlToken = options.controlToken ?? randomBytes(24).toString('hex');
    const emitLog = (line: string): void => {
        options.log?.(line);
    };

    let started = false;
    let stopping = false;
    let running: InstalledApp | null = null;
    let registeredKeys: string[] = [];
    let activeEngine: Engine | null = null;
    let activeEngineAllowCrossOrigin = false;
    let activeEngineManifestJson: string | null = null;
    let activeEngineIsTpk = false;
    let activeEngineWarning: string | null = null;
    let activeNuiSession: NuiSession | null = null;
    let shuttingDownEngine = false;
    let sdbBridge: SdbBridgeInstance | null = null;
    let httpServer: HostHttpServer | null = null;

    async function stopActiveNuiSession(): Promise<void> {
        if (!activeNuiSession) {
            return;
        }
        const session = activeNuiSession;
        activeNuiSession = null;
        await session.terminate().catch(() => {});
    }

    const repeatTimers = new Map<string, KeyRepeatEntry>();

    function clearKeyRepeat(keyName: string): void {
        const existing = repeatTimers.get(keyName);
        if (!existing) {
            return;
        }
        existing.cancelled = true;
        if (existing.initialTimer) {
            clearTimeout(existing.initialTimer);
        }
        if (existing.repeatTimer) {
            clearInterval(existing.repeatTimer);
        }
        repeatTimers.delete(keyName);
    }

    function clearAllKeyRepeats(): void {
        for (const keyName of [...repeatTimers.keys()]) {
            clearKeyRepeat(keyName);
        }
    }

    async function buildStateMessage(): Promise<Extract<RemoteUiServerMessage, { type: 'state' }>> {
        const apps = await appStore.list();
        return {
            type: 'state',
            profile: options.profile,
            apps,
            running: running?.manifest.appId ?? null,
            registeredKeys: [...registeredKeys],
        };
    }

    async function broadcastState(): Promise<void> {
        if (!httpServer) {
            return;
        }
        try {
            const state = await buildStateMessage();
            httpServer.broadcast(state);
        } catch (error) {
            emitLog(`[host] failed to broadcast state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async function resolveDefaultEngineInstance(engineOptions: EngineFactoryOptions): Promise<Engine> {
        let resolved: ResolvedEngine;
        try {
            resolved = await resolveEngine(engineOptions.profile.chromiumMilestone, {
                home: options.home,
                env: options.env,
                playwrightCacheDir: options.playwrightCacheDir,
                strict: options.strictEngine,
            });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(
                `${detail}. Install it with: tvemu engine install ${engineOptions.profile.chromiumMilestone}`,
                { cause: error },
            );
        }
        if (!resolved.exact) {
            const warning = formatApproximateEngineWarning(engineOptions.profile, resolved);
            if (activeEngineWarning !== warning) {
                activeEngineWarning = warning;
                emitLog(`[host] WARNING: ${warning}`);
                httpServer?.broadcast({ type: 'log', level: 'warn', text: warning });
            }
        } else {
            activeEngineWarning = null;
        }
        return createChromiumEngine({
            executablePath: resolved.executablePath,
            allowCrossOrigin: engineOptions.allowCrossOrigin,
            log: engineOptions.log,
        });
    }

    async function handleBridgeCall(engine: Engine, request: BridgeRequest): Promise<void> {
        const route = `${request.api}.${request.method}`;
        const reply = async (response: BridgeResponse): Promise<void> => {
            await engine.resolveBinding(response).catch(() => {});
        };

        if (route === 'application.exit') {
            await reply({ id: request.id, ok: true });
            const current = running;
            if (current) {
                await terminate(current.manifest.appId).catch((error) => {
                    emitLog(`[host] application.exit terminate error: ${error instanceof Error ? error.message : String(error)}`);
                });
            }
            return;
        }

        if (route === 'application.hide') {
            emitLog('[host] application.hide');
            await reply({ id: request.id, ok: true });
            return;
        }

        if (route === 'tvinputdevice.keysChanged') {
            const rawKeys = request.args[0];
            registeredKeys = Array.isArray(rawKeys)
                ? rawKeys.filter((item): item is string => typeof item === 'string')
                : [];
            await broadcastState();
            await reply({ id: request.id, ok: true });
            return;
        }

        if (route === 'nui.event') {
            const payload = request.args[0] as NuiHostMessage | undefined;
            if (payload && activeNuiSession) {
                activeNuiSession.send(payload);
            }
            await reply({ id: request.id, ok: true });
            return;
        }

        if (route === 'console.log') {
            const level = normalizeLogLevel(request.args[0]);
            const text = request.args[1] !== undefined ? String(request.args[1]) : '';
            emitLog(`[app:${level}] ${text}`);
            httpServer?.broadcast({ type: 'log', level, text });
            await reply({ id: request.id, ok: true });
            return;
        }

        await reply({
            id: request.id,
            ok: false,
            error: {
                name: 'NotSupportedError',
                message: `Unsupported bridge call: ${route}`,
            },
        });
    }

    async function ensureEngineStarted(app: InstalledApp): Promise<Engine> {
        const allowCrossOrigin = app.manifest.accessOrigins.includes('*');
        const manifestJson = JSON.stringify(app.manifest);
        const isTpk = app.manifest.kind === 'tpk';

        if (activeEngine) {
            if (
                activeEngineAllowCrossOrigin === allowCrossOrigin &&
                activeEngineManifestJson === manifestJson &&
                activeEngineIsTpk === isTpk
            ) {
                return activeEngine;
            }
            shuttingDownEngine = true;
            try {
                await activeEngine.stop();
            } finally {
                shuttingDownEngine = false;
                activeEngine = null;
                activeEngineManifestJson = null;
                activeEngineIsTpk = false;
            }
        }

        const engineFactory = options.createEngine ?? resolveDefaultEngineInstance;
        const engine = await engineFactory({
            profile: options.profile,
            allowCrossOrigin,
            log: emitLog,
        });

        engine.onBindingCall((request) => {
            void handleBridgeCall(engine, request);
        });

        engine.onExit((reason) => {
            if (activeEngine === engine) {
                activeEngine = null;
                activeEngineManifestJson = null;
                activeEngineIsTpk = false;
            }
            if (shuttingDownEngine) {
                return;
            }
            clearAllKeyRepeats();
            running = null;
            registeredKeys = [];
            void stopActiveNuiSession();
            emitLog(`[host] engine exited: ${reason}`);
            void broadcastState();
        });

        const bootstrap = buildBootstrapScript(options.profile, app.manifest);
        let injectedScripts: string[] = [bootstrap];
        if (!isTpk) {
            const loadTizenApi = options.loadTizenApiScript ?? (() => defaultLoadTizenApiScript(emitLog));
            const tizenApiScript = await loadTizenApi();
            if (tizenApiScript) {
                injectedScripts = [bootstrap, tizenApiScript];
            }
        }
        const userDataDir = path.join(options.home, 'profiles', options.profile.name);

        await engine.start({
            profile: options.profile,
            userDataDir,
            injectedScripts,
            windowTitle: app.manifest.name,
            headless: options.headless,
            scale: options.scale,
        });

        activeEngine = engine;
        activeEngineAllowCrossOrigin = allowCrossOrigin;
        activeEngineManifestJson = manifestJson;
        activeEngineIsTpk = isTpk;
        return engine;
    }

    async function listApps(): Promise<InstalledApp[]> {
        return appStore.list();
    }

    async function installWgt(wgtPath: string): Promise<InstalledApp> {
        const installed = await appStore.install(wgtPath);
        await broadcastState();
        return installed;
    }

    async function uninstall(packageId: string): Promise<void> {
        if (running?.manifest.packageId === packageId) {
            await terminate(running.manifest.appId);
        }
        await appStore.uninstall(packageId);
        await broadcastState();
    }

    async function endRunningApp(): Promise<void> {
        clearAllKeyRepeats();
        running = null;
        registeredKeys = [];
        if (activeEngine && httpServer && httpServer.port() > 0) {
            const idleUrl = `http://127.0.0.1:${httpServer.port()}/idle`;
            await activeEngine.navigate(idleUrl).catch(() => {});
        }
        await broadcastState();
    }

    async function launchTpkApp(app: InstalledApp): Promise<void> {
        if (!httpServer || httpServer.port() <= 0) {
            throw new Error('Host is not started');
        }
        const runtime = await checkNuiRuntimeAvailable(options.env);
        const contentDir = appStore.contentDir(app);
        const execName = app.manifest.exec ?? app.manifest.contentSrc;
        const assemblyPath = path.join(contentDir, 'bin', execName);

        try {
            const report = await inspectDotnetAssembly({
                command: runtime.command,
                hostDllPath: runtime.hostDllPath,
                assemblyPath,
                env: options.env,
            });
            for (const member of report.missing) {
                const warnText = `Missing NUI API: ${member}`;
                emitLog(`[host] WARNING: ${warnText}`);
                httpServer.broadcast({ type: 'log', level: 'warn', text: warnText });
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            const warnText = `NUI inspect skipped (${detail})`;
            emitLog(`[host] WARNING: ${warnText}`);
            httpServer.broadcast({ type: 'log', level: 'warn', text: warnText });
        }

        const engine = await ensureEngineStarted(app);
        clearAllKeyRepeats();
        registeredKeys = REMOTE_KEYS.map((item) => item.name);
        running = app;
        await broadcastState();

        let pageLoaded = false;
        const pendingPayloads: string[] = [];
        let applyChain = Promise.resolve();

        const scheduleApply = (payloadJson: string): void => {
            if (!pageLoaded) {
                pendingPayloads.push(payloadJson);
                return;
            }
            applyChain = applyChain
                .then(async () => {
                    if (activeEngine !== engine || running?.manifest.appId !== app.manifest.appId) {
                        return;
                    }
                    await engine.evaluate<void>(
                        `window.__tvemuNui && window.__tvemuNui.apply(${JSON.stringify(payloadJson)});`,
                    );
                })
                .catch((error) => {
                    const detail = error instanceof Error ? error.message : String(error);
                    emitLog(`[nui] apply error: ${detail}`);
                });
        };

        const targetUrl = resolveAppUrl(app, httpServer.port());
        try {
            await engine.navigate(targetUrl);
        } catch (error) {
            running = null;
            registeredKeys = [];
            await broadcastState();
            throw error;
        }

        pageLoaded = true;
        while (pendingPayloads.length > 0) {
            const next = pendingPayloads.shift();
            if (next) {
                scheduleApply(next);
            }
        }

        const dataDir = path.join(options.home, 'appdata', app.manifest.packageId);
        let sessionRef: NuiSession | null = null;
        try {
            sessionRef = await createNuiSession({
                app,
                contentDir,
                dataDir,
                profile: options.profile,
                command: runtime.command,
                hostDllPath: runtime.hostDllPath,
                env: options.env,
                onReady: () => {
                    emitLog('[nui] app ready');
                },
                onFrame: scheduleApply,
                onPlayer: scheduleApply,
                onLog: (level, text) => {
                    emitLog(text);
                    httpServer?.broadcast({ type: 'log', level, text });
                },
                onMissing: (member) => {
                    const warnText = `Missing NUI API: ${member}`;
                    emitLog(`[host] WARNING: ${warnText}`);
                    httpServer?.broadcast({ type: 'log', level: 'warn', text: warnText });
                },
                onEnded: (info) => {
                    if (activeNuiSession !== sessionRef) {
                        return;
                    }
                    activeNuiSession = null;
                    if (info.code !== 0 || info.reason === 'crash') {
                        const errText =
                            `NUI runtime exited (${info.reason}, code=${info.code ?? 'unknown'})` +
                            `${info.error ? `: ${info.error}` : ''}`;
                        emitLog(`[host] ERROR: ${errText}`);
                        httpServer?.broadcast({ type: 'log', level: 'error', text: errText });
                        for (const line of info.stderrTail) {
                            emitLog(`[nui:stderr] ${line}`);
                            httpServer?.broadcast({ type: 'log', level: 'error', text: `[stderr] ${line}` });
                        }
                    }
                    if (!stopping) {
                        void endRunningApp();
                    }
                },
            });
            activeNuiSession = sessionRef;
        } catch (error) {
            await endRunningApp();
            throw error;
        }
    }

    let lifecycleQueue: Promise<unknown> = Promise.resolve();

    function serialized<T>(task: () => Promise<T>): Promise<T> {
        const result = lifecycleQueue.then(task, task);
        lifecycleQueue = result.catch(() => {});
        return result;
    }

    function launch(appId: string, launchOptions?: LaunchOptions): Promise<void> {
        return serialized(() => launchNow(appId, launchOptions));
    }

    function terminate(appId: string): Promise<void> {
        return serialized(() => terminateNow(appId));
    }

    async function launchNow(appId: string, _launchOptions?: LaunchOptions): Promise<void> {
        if (!httpServer || httpServer.port() <= 0) {
            throw new Error('Host is not started');
        }
        const app = (await appStore.findByAppId(appId)) ?? (await appStore.findByPackageId(appId));
        if (!app) {
            throw new Error(`App not found: ${appId}`);
        }

        await stopActiveNuiSession();

        if (app.manifest.kind === 'tpk') {
            await launchTpkApp(app);
            return;
        }

        const engine = await ensureEngineStarted(app);
        clearAllKeyRepeats();
        registeredKeys = [];
        running = app;
        await broadcastState();

        const targetUrl = resolveAppUrl(app, httpServer.port());
        try {
            await engine.navigate(targetUrl);
        } catch (error) {
            running = null;
            registeredKeys = [];
            await broadcastState();
            throw error;
        }
    }

    async function terminateNow(appId: string): Promise<void> {
        if (running && running.manifest.appId !== appId && running.manifest.packageId !== appId) {
            throw new Error(`App is not running: ${appId}`);
        }
        await stopActiveNuiSession();
        await endRunningApp();
    }

    async function runningApp(): Promise<InstalledApp | null> {
        return running;
    }

    async function sendKey(keyName: string, action: KeyAction = 'press'): Promise<void> {
        const key = findRemoteKey(keyName);
        if (!key) {
            throw new Error(`Unknown remote key: ${keyName}`);
        }
        const engine = activeEngine;
        if (!engine) {
            throw new Error('No running engine');
        }

        clearKeyRepeat(key.name);

        if (action === 'down') {
            const entry: KeyRepeatEntry = { cancelled: false };
            repeatTimers.set(key.name, entry);
            try {
                await engine.dispatchKey(key.code, key.name, 'down');
            } catch (error) {
                clearKeyRepeat(key.name);
                throw error;
            }
            if (entry.cancelled || activeEngine !== engine) {
                clearKeyRepeat(key.name);
                return;
            }
            entry.initialTimer = setTimeout(() => {
                if (entry.cancelled || activeEngine !== engine) {
                    return;
                }
                void engine.dispatchKey(key.code, key.name, 'down').catch(() => {});
                entry.repeatTimer = setInterval(() => {
                    if (entry.cancelled || activeEngine !== engine) {
                        clearKeyRepeat(key.name);
                        return;
                    }
                    void engine.dispatchKey(key.code, key.name, 'down').catch(() => {});
                }, KEY_REPEAT_INTERVAL_MS);
            }, KEY_REPEAT_INITIAL_MS);
            return;
        }

        await engine.dispatchKey(key.code, key.name, action);
    }

    function deviceInfo(): DeviceProfile {
        return options.profile;
    }

    function urls(): { remote: string; app: string | null } {
        const port = httpServer?.port() ?? 0;
        if (port <= 0) {
            return { remote: '', app: null };
        }
        return {
            remote: `http://127.0.0.1:${port}/remote/`,
            app: running ? resolveAppUrl(running, port) : null,
        };
    }

    async function screenshot(): Promise<Buffer> {
        if (!activeEngine) {
            throw new Error('No running engine');
        }
        return activeEngine.screenshot();
    }

    async function evaluate<T>(expression: string): Promise<T> {
        if (!activeEngine) {
            throw new Error('No running engine');
        }
        return activeEngine.evaluate<T>(expression);
    }

    async function handleRemoteMessage(message: RemoteUiClientMessage): Promise<void> {
        if (message.type === 'key') {
            await sendKey(message.key, message.action);
            return;
        }
        if (message.type === 'launch') {
            await launch(message.appId);
            return;
        }
        if (message.type === 'terminate' && running) {
            await terminate(running.manifest.appId);
        }
    }

    async function handleControl(command: string, body: Record<string, unknown>): Promise<ControlResponse> {
        switch (command) {
            case 'status': {
                const apps = await listApps();
                return {
                    body: {
                        ok: true,
                        profile: options.profile,
                        running,
                        apps,
                        urls: urls(),
                    },
                };
            }
            case 'list': {
                const apps = await listApps();
                return { body: { ok: true, apps } };
            }
            case 'install': {
                if (typeof body.wgtPath !== 'string' || !body.wgtPath) {
                    return { status: 400, body: { ok: false, error: 'Missing wgtPath' } };
                }
                const app = await installWgt(body.wgtPath);
                return { body: { ok: true, app } };
            }
            case 'uninstall': {
                if (typeof body.packageId !== 'string' || !body.packageId) {
                    return { status: 400, body: { ok: false, error: 'Missing packageId' } };
                }
                await uninstall(body.packageId);
                return { body: { ok: true } };
            }
            case 'launch': {
                if (typeof body.appId !== 'string' || !body.appId) {
                    return { status: 400, body: { ok: false, error: 'Missing appId' } };
                }
                await launch(body.appId, {
                    debug: typeof body.debug === 'boolean' ? body.debug : undefined,
                    profile: typeof body.profile === 'string' ? body.profile : undefined,
                });
                return { body: { ok: true } };
            }
            case 'terminate': {
                const targetId = typeof body.appId === 'string' ? body.appId : running?.manifest.appId;
                if (targetId) {
                    await terminate(targetId);
                }
                return { body: { ok: true } };
            }
            case 'key': {
                if (typeof body.key !== 'string' || !body.key) {
                    return { status: 400, body: { ok: false, error: 'Missing key' } };
                }
                const action: KeyAction =
                    body.action === 'down' || body.action === 'up' || body.action === 'press'
                        ? body.action
                        : 'press';
                await sendKey(body.key, action);
                return { body: { ok: true } };
            }
            case 'screenshot': {
                const png = await screenshot();
                return { body: { ok: true, pngBase64: png.toString('base64') } };
            }
            case 'stop': {
                return {
                    body: { ok: true },
                    afterSend: async () => {
                        await stop();
                    },
                };
            }
            default:
                return { status: 404, body: { ok: false, error: `Unknown control command: ${command}` } };
        }
    }

    const hostApi: HostApi = {
        listApps,
        installWgt,
        uninstall,
        launch,
        terminate,
        runningApp,
        sendKey,
        deviceInfo,
    };

    async function start(): Promise<void> {
        if (started) {
            return;
        }
        if (!options.createEngine) {
            try {
                const resolved = await resolveEngine(options.profile.chromiumMilestone, {
                    home: options.home,
                    env: options.env,
                    playwrightCacheDir: options.playwrightCacheDir,
                });
                if (!resolved.exact && !options.strictEngine) {
                    const warning = formatApproximateEngineWarning(options.profile, resolved);
                    activeEngineWarning = warning;
                    emitLog(`[host] WARNING: ${warning}`);
                } else {
                    activeEngineWarning = null;
                }
            } catch {
                activeEngineWarning = null;
            }
        }
        const server = createHostHttpServer({
            appStore,
            remoteAssetsDir: remoteUiAssetsDir(),
            nuiAssetsDir: options.nuiAssetsDir ?? nuiRendererAssetsDir(),
            profile: options.profile,
            controlToken,
            port: options.uiPort,
            getStateMessage: buildStateMessage,
            getInitialLogs: () => (activeEngineWarning ? [{ type: 'log', level: 'warn', text: activeEngineWarning }] : []),
            onRemoteMessage: handleRemoteMessage,
            onControl: handleControl,
            log: emitLog,
        });
        const port = await server.start();
        httpServer = server;

        try {
            await writeRunState(options.home, {
                port,
                pid: process.pid,
                token: controlToken,
                profile: options.profile.name,
            });
        } catch (error) {
            httpServer = null;
            await server.stop().catch(() => {});
            throw error;
        }

        if (options.sdbPort !== false) {
            const loadSdb = options.loadSdbBridge ?? (() => defaultLoadSdbBridge(emitLog));
            const factory = await loadSdb();
            if (factory) {
                const requestedPort = typeof options.sdbPort === 'number' ? options.sdbPort : SDB_DEFAULT_PORT;
                const bridge = factory({
                    host: hostApi,
                    port: requestedPort,
                    home: options.home,
                    log: emitLog,
                });
                try {
                    const bound = await bridge.start();
                    sdbBridge = bridge;
                    emitLog(`[host] sdb bridge listening on 127.0.0.1:${bound.port}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    emitLog(`[host] sdb bridge disabled (port ${requestedPort} failed: ${message})`);
                }
            }
        }

        started = true;
    }

    async function stop(): Promise<void> {
        if (stopping) {
            return;
        }
        stopping = true;
        started = false;
        clearAllKeyRepeats();
        running = null;
        registeredKeys = [];

        await stopActiveNuiSession();

        if (activeEngine) {
            const engine = activeEngine;
            activeEngine = null;
            activeEngineManifestJson = null;
            shuttingDownEngine = true;
            try {
                await engine.stop();
            } finally {
                shuttingDownEngine = false;
            }
        }

        if (sdbBridge) {
            const bridge = sdbBridge;
            sdbBridge = null;
            await bridge.stop().catch(() => {});
        }

        if (httpServer) {
            const server = httpServer;
            httpServer = null;
            await server.stop().catch(() => {});
        }

        await removeRunState(options.home, controlToken).catch(() => {});
        stopping = false;
        options.onStopRequested?.();
    }

    return {
        ...hostApi,
        start,
        stop,
        urls,
        screenshot,
        evaluate,
    };
}
