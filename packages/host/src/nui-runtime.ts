import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
    DeviceProfile,
    InstalledApp,
    NuiHostMessage,
    NuiOp,
    NuiPlayerMessage,
    NuiRuntimeLogLevel,
    NuiRuntimeMessage,
} from '@tvemu/protocol';

const MAX_NDJSON_LINE_BYTES = 8 * 1024 * 1024;
const FRAME_CHUNK_BYTES = 512 * 1024;
const TERMINATE_TIMEOUT_MS = 2000;
const KILL_GRACE_MS = 300;
const STDERR_TAIL_LINES = 20;

export interface NuiInspectReport {
    supported: string[];
    missing: string[];
    exitCode: number;
    raw: unknown;
}

export interface NuiEndedInfo {
    code: number | null;
    reason: string;
    error?: string;
    stderrTail: string[];
}

export interface NuiSession {
    send(message: NuiHostMessage): void;
    terminate(): Promise<void>;
    pid(): number | null;
}

export interface CreateNuiSessionOptions {
    app: InstalledApp;
    contentDir: string;
    dataDir: string;
    profile: DeviceProfile;
    command: string;
    hostDllPath: string;
    env?: NodeJS.ProcessEnv;
    onReady: () => void;
    onFrame: (payloadJson: string) => void;
    onPlayer: (payloadJson: string) => void;
    onLog: (level: 'log' | 'warn' | 'error', text: string) => void;
    onMissing: (member: string) => void;
    onEnded: (info: NuiEndedInfo) => void;
}

function repoRootPath(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(currentDir, '..', '..', '..');
}

export function resolveNuiCommand(env: NodeJS.ProcessEnv = process.env): string {
    const raw = env.TVEMU_NUI_COMMAND?.trim();
    return raw ? raw : 'dotnet';
}

export function resolveNuiHostDllPath(env: NodeJS.ProcessEnv = process.env): string {
    const raw = env.TVEMU_NUI_HOST?.trim();
    if (raw) {
        return path.resolve(raw);
    }
    return path.join(repoRootPath(), 'dotnet', 'artifacts', 'nui-host', 'Tvemu.NuiHost.dll');
}

async function isRegularFile(filePath: string): Promise<boolean> {
    try {
        const info = await stat(filePath);
        return info.isFile();
    } catch {
        return false;
    }
}

async function isExecutableFile(filePath: string): Promise<boolean> {
    try {
        const info = await stat(filePath);
        if (!info.isFile()) {
            return false;
        }
        await access(filePath, fsConstants.X_OK);
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

export async function checkNuiRuntimeAvailable(
    env: NodeJS.ProcessEnv = process.env,
): Promise<{ command: string; commandPath: string; hostDllPath: string }> {
    const hostDllPath = resolveNuiHostDllPath(env);
    if (!(await isRegularFile(hostDllPath))) {
        throw new Error(`NUI runtime not found at ${hostDllPath}. run: dotnet build dotnet/Tvemu.sln -c Release`);
    }
    const command = resolveNuiCommand(env);
    let commandPath: string | null;
    if (path.isAbsolute(command) || command.includes(path.sep)) {
        commandPath = (await isExecutableFile(command)) ? command : null;
    } else {
        commandPath = await findExecutableInPath(command, env.PATH);
    }
    if (!commandPath) {
        throw new Error(`NUI runtime launcher "${command}" not found on PATH`);
    }
    return { command, commandPath, hostDllPath };
}

export async function probeDotnetVersion(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
    const command = resolveNuiCommand(env);
    return new Promise((resolve) => {
        execFile(command, ['--version'], { env, timeout: 5000 }, (error, stdout) => {
            if (error) {
                resolve(null);
                return;
            }
            const trimmed = stdout.trim();
            resolve(trimmed || null);
        });
    });
}

function extractMemberLabel(entry: unknown): string | null {
    if (typeof entry === 'string') {
        return entry;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
    }
    const rec = entry as Record<string, unknown>;
    const candidate = rec.member ?? rec.signature ?? rec.name ?? rec.id;
    return typeof candidate === 'string' ? candidate : null;
}

function parseInspectJson(rawText: string, exitCode: number): NuiInspectReport {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return { supported: [], missing: [], exitCode, raw: null };
    }
    const parsed: unknown = JSON.parse(trimmed);
    const supported: string[] = [];
    const missing: string[] = [];

    const classifyList = (items: unknown[]): void => {
        for (const item of items) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                const label = extractMemberLabel(item);
                if (label) {
                    missing.push(label);
                }
                continue;
            }
            const rec = item as Record<string, unknown>;
            const label = extractMemberLabel(rec);
            if (!label) {
                continue;
            }
            if (rec.status === 'missing' || rec.supported === false || rec.missing === true) {
                missing.push(label);
            } else {
                supported.push(label);
            }
        }
    };

    if (Array.isArray(parsed)) {
        classifyList(parsed);
        return { supported, missing, exitCode, raw: parsed };
    }

    if (parsed && typeof parsed === 'object') {
        const rec = parsed as Record<string, unknown>;
        if (Array.isArray(rec.missing)) {
            for (const item of rec.missing) {
                const label = extractMemberLabel(item);
                if (label) {
                    missing.push(label);
                }
            }
        }
        if (Array.isArray(rec.supported)) {
            for (const item of rec.supported) {
                const label = extractMemberLabel(item);
                if (label) {
                    supported.push(label);
                }
            }
        }
        const listField = rec.members ?? rec.items ?? rec.results ?? rec.references;
        if (Array.isArray(listField)) {
            classifyList(listField);
        }
    }

    return { supported, missing, exitCode, raw: parsed };
}

export async function inspectDotnetAssembly(options: {
    command: string;
    hostDllPath: string;
    assemblyPath: string;
    env?: NodeJS.ProcessEnv;
}): Promise<NuiInspectReport> {
    return new Promise((resolve, reject) => {
        execFile(
            options.command,
            [options.hostDllPath, 'inspect', options.assemblyPath, '--json'],
            { env: options.env, maxBuffer: 8 * 1024 * 1024, timeout: 15000 },
            (error, stdout, stderr) => {
                const exitCode = error && typeof (error as { code?: unknown }).code === 'number'
                    ? (error as { code: number }).code
                    : error
                        ? 1
                        : 0;
                if (error && exitCode !== 2) {
                    const detail = stderr.trim() || error.message;
                    reject(new Error(`NUI inspect failed (exit ${exitCode}): ${detail}`));
                    return;
                }
                try {
                    resolve(parseInspectJson(stdout, exitCode));
                } catch (parseError) {
                    const msg = parseError instanceof Error ? parseError.message : String(parseError);
                    reject(new Error(`Invalid NUI inspect JSON output: ${msg}`));
                }
            },
        );
    });
}

export function rewriteLocalUrl(rawUrl: string, contentDir: string, packageId: string): string {
    if (!rawUrl || /^https?:\/\//i.test(rawUrl) || /^(data|blob):/i.test(rawUrl) || rawUrl.startsWith('/app/')) {
        return rawUrl;
    }
    let candidatePath = rawUrl;
    if (rawUrl.startsWith('file://')) {
        try {
            candidatePath = fileURLToPath(rawUrl);
        } catch {
            return rawUrl;
        }
    }
    if (!path.isAbsolute(candidatePath)) {
        return rawUrl;
    }
    const resolvedRoot = path.resolve(contentDir);
    const resolvedTarget = path.resolve(candidatePath);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return rawUrl;
    }
    const segments = relative.split(path.sep).filter((seg) => seg.length > 0).map(encodeURIComponent);
    return `/app/${encodeURIComponent(packageId)}/${segments.join('/')}`;
}

export function rewriteLocalUrlsForFrame(ops: NuiOp[], contentDir: string, packageId: string): NuiOp[] {
    return ops.map((op) => {
        if (op[0] !== 'set') {
            return op;
        }
        const props = op[2];
        if (typeof props.url !== 'string') {
            return op;
        }
        const rewritten = rewriteLocalUrl(props.url, contentDir, packageId);
        if (rewritten === props.url) {
            return op;
        }
        return ['set', op[1], { ...props, url: rewritten }];
    });
}

export function chunkFrameOps(ops: NuiOp[], maxBytes: number = FRAME_CHUNK_BYTES): NuiOp[][] {
    if (ops.length === 0) {
        return [[]];
    }
    const full = JSON.stringify({ t: 'frame', ops });
    if (Buffer.byteLength(full, 'utf8') <= maxBytes) {
        return [ops];
    }
    const chunks: NuiOp[][] = [];
    let current: NuiOp[] = [];
    let currentBytes = 20;
    for (const op of ops) {
        const opBytes = Buffer.byteLength(JSON.stringify(op), 'utf8') + 1;
        if (current.length > 0 && currentBytes + opBytes > maxBytes) {
            chunks.push(current);
            current = [op];
            currentBytes = 20 + opBytes;
        } else {
            current.push(op);
            currentBytes += opBytes;
        }
    }
    if (current.length > 0) {
        chunks.push(current);
    }
    return chunks;
}

function tokensEqual(provided: string, expected: string): boolean {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) {
        return false;
    }
    return timingSafeEqual(a, b);
}

function mapLogLevel(level: NuiRuntimeLogLevel): 'log' | 'warn' | 'error' {
    if (level === 'warn') {
        return 'warn';
    }
    if (level === 'error' || level === 'fatal') {
        return 'error';
    }
    return 'log';
}

export async function createNuiSession(options: CreateNuiSessionOptions): Promise<NuiSession> {
    await mkdir(options.dataDir, { recursive: true });
    const token = randomBytes(24).toString('hex');
    const execName = options.app.manifest.exec ?? options.app.manifest.contentSrc;
    const stderrLines: string[] = [];
    let activeSocket: Socket | null = null;
    let authenticated = false;
    let ended = false;
    let terminating = false;
    let protocolExit: { code: number; reason: string; error?: string } | null = null;
    let server: Server | null = null;
    let child: ChildProcess | null = null;
    let socketCloseTimer: ReturnType<typeof setTimeout> | null = null;
    const openSockets = new Set<Socket>();

    const childAlive = (target: ChildProcess | null): target is ChildProcess =>
        target !== null && target.exitCode === null && target.signalCode === null;

    const reapChild = (): void => {
        const target = child;
        if (!childAlive(target)) {
            return;
        }
        try {
            target.kill('SIGTERM');
        } catch {
        }
        const killTimer = setTimeout(() => {
            if (childAlive(target)) {
                try {
                    target.kill('SIGKILL');
                } catch {
                }
            }
        }, KILL_GRACE_MS);
        killTimer.unref();
        target.once('exit', () => clearTimeout(killTimer));
    };

    const pushStderr = (chunk: string): void => {
        for (const rawLine of chunk.split(/\r?\n/)) {
            if (!rawLine.trim()) {
                continue;
            }
            stderrLines.push(rawLine);
            if (stderrLines.length > STDERR_TAIL_LINES) {
                stderrLines.shift();
            }
        }
    };

    const cleanupTransport = (): void => {
        if (socketCloseTimer) {
            clearTimeout(socketCloseTimer);
            socketCloseTimer = null;
        }
        for (const socket of openSockets) {
            socket.destroy();
        }
        openSockets.clear();
        activeSocket = null;
        if (server) {
            const activeServer = server;
            server = null;
            activeServer.close();
        }
    };

    const onProcessExit = (): void => {
        if (child && child.exitCode === null && child.signalCode === null) {
            try {
                child.kill('SIGKILL');
            } catch {
            }
        }
    };

    const finish = (info: NuiEndedInfo): void => {
        if (ended) {
            return;
        }
        ended = true;
        cleanupTransport();
        options.onEnded(info);
    };

    const handleRuntimeLine = (socket: Socket, line: string): void => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(line);
        } catch {
            return;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return;
        }
        const msg = parsed as NuiRuntimeMessage;
        if (activeSocket !== socket) {
            if (activeSocket) {
                socket.destroy();
                return;
            }
            const rawToken = (parsed as { token?: unknown }).token;
            if (msg.t !== 'hello' || typeof rawToken !== 'string' || !tokensEqual(rawToken, token)) {
                socket.destroy();
                return;
            }
            authenticated = true;
            activeSocket = socket;
            const welcome: NuiHostMessage = {
                t: 'welcome',
                v: 1,
                window: { w: options.profile.width, h: options.profile.height },
                profile: options.profile,
                app: {
                    packageId: options.app.manifest.packageId,
                    appId: options.app.manifest.appId,
                    exec: execName,
                    installDir: options.contentDir,
                    dataDir: options.dataDir,
                    locale: options.profile.locale,
                },
            };
            socket.write(JSON.stringify(welcome) + '\n');
            return;
        }

        if (msg.t === 'ready') {
            options.onReady();
            return;
        }
        if (msg.t === 'frame' && Array.isArray(msg.ops)) {
            const rewritten = rewriteLocalUrlsForFrame(msg.ops, options.contentDir, options.app.manifest.packageId);
            const chunks = chunkFrameOps(rewritten);
            for (const ops of chunks) {
                options.onFrame(JSON.stringify({ t: 'frame', ops }));
            }
            return;
        }
        if (msg.t === 'player') {
            const playerMsg: NuiPlayerMessage = msg.op === 'open'
                ? { ...msg, url: rewriteLocalUrl(msg.url, options.contentDir, options.app.manifest.packageId) }
                : msg;
            options.onPlayer(JSON.stringify(playerMsg));
            return;
        }
        if (msg.t === 'log') {
            const level = mapLogLevel(msg.level);
            const tagPrefix = msg.tag ? `[${msg.tag}] ` : '';
            options.onLog(level, `[nui:${msg.level}] ${tagPrefix}${msg.msg}`);
            return;
        }
        if (msg.t === 'missing' && typeof msg.member === 'string') {
            options.onMissing(msg.member);
            return;
        }
        if (msg.t === 'exit') {
            protocolExit = {
                code: typeof msg.code === 'number' ? msg.code : 0,
                reason: msg.reason || 'app-exit',
                error: msg.error,
            };
            if (child && child.exitCode === null && child.signalCode === null) {
                if (!socketCloseTimer) {
                    socketCloseTimer = setTimeout(() => {
                        reapChild();
                        finish({
                            code: protocolExit?.code ?? 0,
                            reason: protocolExit?.reason ?? 'app-exit',
                            error: protocolExit?.error,
                            stderrTail: [...stderrLines],
                        });
                    }, 250);
                }
            } else {
                finish({
                    code: protocolExit.code,
                    reason: protocolExit.reason,
                    error: protocolExit.error,
                    stderrTail: [...stderrLines],
                });
            }
        }
    };

    const tcpServer = createServer((socket) => {
        if (activeSocket || ended) {
            socket.destroy();
            return;
        }
        openSockets.add(socket);
        let buffer: Buffer = Buffer.alloc(0);
        socket.on('data', (chunk: Buffer) => {
            buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
            while (true) {
                const nlIndex = buffer.indexOf(0x0a);
                if (nlIndex === -1) {
                    if (buffer.length > MAX_NDJSON_LINE_BYTES) {
                        options.onLog('error', '[nui] runtime exceeded 8 MiB NDJSON line limit');
                        socket.destroy();
                        return;
                    }
                    break;
                }
                if (nlIndex > MAX_NDJSON_LINE_BYTES) {
                    options.onLog('error', '[nui] runtime exceeded 8 MiB NDJSON line limit');
                    socket.destroy();
                    return;
                }
                const line = buffer.subarray(0, nlIndex).toString('utf8').replace(/\r$/, '');
                buffer = buffer.subarray(nlIndex + 1);
                if (line.trim()) {
                    handleRuntimeLine(socket, line);
                }
            }
        });
        socket.on('error', () => {});
        socket.on('close', () => {
            openSockets.delete(socket);
            const wasRuntimeSocket = activeSocket === socket;
            if (wasRuntimeSocket) {
                activeSocket = null;
            }
            if (ended || terminating || !wasRuntimeSocket) {
                return;
            }
            if (!socketCloseTimer) {
                socketCloseTimer = setTimeout(() => {
                    reapChild();
                    finish({
                        code: protocolExit?.code ?? 1,
                        reason: protocolExit?.reason ?? 'socket-closed',
                        error: protocolExit?.error ?? 'Runtime socket closed',
                        stderrTail: [...stderrLines],
                    });
                }, 200);
            }
        });
    });

    server = tcpServer;

    await new Promise<void>((resolve, reject) => {
        tcpServer.once('error', reject);
        tcpServer.listen(0, '127.0.0.1', () => {
            tcpServer.off('error', reject);
            resolve();
        });
    });

    const address = tcpServer.address();
    if (!address || typeof address === 'string') {
        cleanupTransport();
        throw new Error('Failed to bind NUI host TCP listener');
    }

    const endpoint = `127.0.0.1:${address.port}`;
    const spawnEnv: NodeJS.ProcessEnv = {
        ...(options.env ?? process.env),
        TVEMU_NUI_ENDPOINT: endpoint,
        TVEMU_NUI_TOKEN: token,
    };

    const spawned = spawn(
        options.command,
        [options.hostDllPath, '--app-dir', options.contentDir, '--exec', execName, '--data-dir', options.dataDir],
        {
            env: spawnEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    child = spawned;
    process.on('exit', onProcessExit);

    spawned.stdout?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split(/\r?\n/)) {
            if (line.trim()) {
                options.onLog('log', `[nui:stdout] ${line}`);
            }
        }
    });

    spawned.stderr?.on('data', (chunk: Buffer) => {
        pushStderr(chunk.toString('utf8'));
    });

    spawned.on('error', (error) => {
        finish({
            code: 1,
            reason: 'crash',
            error: error.message,
            stderrTail: [...stderrLines],
        });
    });

    spawned.on('exit', (code, signal) => {
        process.off('exit', onProcessExit);
        if (terminating) {
            return;
        }
        const effectiveCode = protocolExit ? protocolExit.code : (code ?? (signal ? 1 : 0));
        const effectiveReason = protocolExit
            ? protocolExit.reason
            : effectiveCode === 0
                ? 'app-exit'
                : 'crash';
        const effectiveError = protocolExit?.error ?? (signal ? `Terminated by signal ${signal}` : undefined);
        finish({
            code: effectiveCode,
            reason: effectiveReason,
            error: effectiveError,
            stderrTail: [...stderrLines],
        });
    });

    return {
        send(message: NuiHostMessage): void {
            if (activeSocket && authenticated && !activeSocket.destroyed) {
                activeSocket.write(JSON.stringify(message) + '\n');
            }
        },

        async terminate(): Promise<void> {
            if (ended) {
                cleanupTransport();
                const lingering = child;
                if (childAlive(lingering)) {
                    reapChild();
                    await new Promise<void>((resolve) => lingering.once('exit', () => resolve()));
                }
                return;
            }
            terminating = true;
            if (activeSocket && authenticated && !activeSocket.destroyed) {
                try {
                    activeSocket.write(JSON.stringify({ t: 'lifecycle', event: 'terminate' } satisfies NuiHostMessage) + '\n');
                } catch {
                }
            }

            if (child && child.exitCode === null && child.signalCode === null) {
                const activeChild = child;
                await new Promise<void>((resolve) => {
                    let killTimer: ReturnType<typeof setTimeout> | null = null;
                    const terminateTimer = setTimeout(() => {
                        if (activeChild.exitCode === null && activeChild.signalCode === null) {
                            try {
                                activeChild.kill('SIGTERM');
                            } catch {
                            }
                            killTimer = setTimeout(() => {
                                if (activeChild.exitCode === null && activeChild.signalCode === null) {
                                    try {
                                        activeChild.kill('SIGKILL');
                                    } catch {
                                    }
                                }
                                resolve();
                            }, KILL_GRACE_MS);
                        } else {
                            resolve();
                        }
                    }, TERMINATE_TIMEOUT_MS);

                    activeChild.once('exit', () => {
                        clearTimeout(terminateTimer);
                        if (killTimer) {
                            clearTimeout(killTimer);
                        }
                        resolve();
                    });
                });
            }

            finish({
                code: 0,
                reason: 'terminated',
                stderrTail: [...stderrLines],
            });
        },

        pid(): number | null {
            return child?.pid ?? null;
        },
    };
}

export function pathToFileHref(filePath: string): string {
    return pathToFileURL(filePath).href;
}
