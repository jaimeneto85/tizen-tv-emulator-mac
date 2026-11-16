import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type {
    DeviceProfile,
    InstalledApp,
    RemoteUiClientMessage,
    RemoteUiServerMessage,
} from '@tvemu/protocol';
import type { AppStore } from '@tvemu/wgt';
import { WebSocket, WebSocketServer } from 'ws';
import { contentTypeForPath, isHtmlPath } from './mime.js';

export interface ControlResponse {
    status?: number;
    body: Record<string, unknown>;
    afterSend?: () => Promise<void> | void;
}

export interface HostHttpServerOptions {
    appStore: AppStore;
    remoteAssetsDir: string;
    nuiAssetsDir?: string;
    profile: DeviceProfile;
    controlToken: string;
    port?: number;
    getStateMessage: () => Promise<Extract<RemoteUiServerMessage, { type: 'state' }>>;
    getInitialLogs?: () => Array<Extract<RemoteUiServerMessage, { type: 'log' }>>;
    onRemoteMessage: (message: RemoteUiClientMessage) => Promise<void>;
    onControl: (command: string, body: Record<string, unknown>) => Promise<ControlResponse>;
    log?: (line: string) => void;
}

export interface HostHttpServer {
    start(): Promise<number>;
    stop(): Promise<void>;
    port(): number;
    broadcast(message: RemoteUiServerMessage): void;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderIdleHtml(profile: DeviceProfile): string {
    const label = escapeHtml(profile.label);
    const meta = escapeHtml(`${profile.name} • Tizen ${profile.tizenVersion} • ${profile.width}x${profile.height}`);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>tvemu — ${label}</title>
<style>
html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at 50% 35%, #16202e 0%, #0b0f14 70%);
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
}
.idle-card {
    text-align: center;
    padding: 36px 48px;
    border-radius: 16px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.72);
}
.idle-badge {
    font-size: 13px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #38bdf8;
    margin-bottom: 12px;
}
.idle-title {
    margin: 0 0 10px 0;
    font-size: 32px;
    font-weight: 600;
}
.idle-meta {
    margin: 0;
    font-size: 16px;
    color: #94a3b8;
}
</style>
</head>
<body>
<div class="idle-card">
    <div class="idle-badge">tvemu idle</div>
    <h1 class="idle-title">${label}</h1>
    <p class="idle-meta">${meta}</p>
</div>
</body>
</html>`;
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>, afterSend?: () => void): void {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(body.length),
        'cache-control': 'no-store',
    });
    res.end(body, afterSend);
}

function sendText(res: ServerResponse, status: number, text: string): void {
    const body = Buffer.from(text, 'utf8');
    res.writeHead(status, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': String(body.length),
    });
    res.end(body);
}

function isTokenAuthorized(authHeader: string | undefined, expectedToken: string): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const provided = authHeader.slice('Bearer '.length).trim();
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expectedToken, 'utf8');
    if (a.length !== b.length) {
        return false;
    }
    return timingSafeEqual(a, b);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 1024 * 1024;
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > maxBytes) {
            throw new Error('Request body too large');
        }
        chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
        return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected JSON object body');
    }
    return parsed as Record<string, unknown>;
}

function splitAndValidatePath(rawPath: string): { segments: string[] } | { status: number; message: string } {
    const rawSegments = rawPath.split('/');
    const decodedSegments: string[] = [];

    for (const rawSeg of rawSegments) {
        if (rawSeg === '') {
            continue;
        }
        if (rawSeg === '.' || rawSeg === '..' || rawSeg.includes('\\')) {
            return { status: 403, message: 'Forbidden path' };
        }
        let decoded: string;
        try {
            decoded = decodeURIComponent(rawSeg);
        } catch {
            return { status: 400, message: 'Malformed URI segment' };
        }
        if (
            decoded === '.' ||
            decoded === '..' ||
            decoded.includes('/') ||
            decoded.includes('\\') ||
            decoded.includes('\0')
        ) {
            return { status: 403, message: 'Forbidden path' };
        }
        decodedSegments.push(decoded);
    }

    return { segments: decodedSegments };
}

type ParsedRange = { kind: 'range'; start: number; end: number } | { kind: 'invalid' };

function parseByteRange(headerValue: string, size: number): ParsedRange {
    const trimmed = headerValue.trim();
    if (!trimmed.startsWith('bytes=') || trimmed.includes(',')) {
        return { kind: 'invalid' };
    }
    const spec = trimmed.slice('bytes='.length).trim();
    const dashIndex = spec.indexOf('-');
    if (dashIndex === -1 || size <= 0) {
        return { kind: 'invalid' };
    }
    const startPart = spec.slice(0, dashIndex).trim();
    const endPart = spec.slice(dashIndex + 1).trim();

    if (startPart === '') {
        if (!/^\d+$/.test(endPart)) {
            return { kind: 'invalid' };
        }
        const suffix = Number.parseInt(endPart, 10);
        if (suffix <= 0) {
            return { kind: 'invalid' };
        }
        const start = Math.max(0, size - suffix);
        return { kind: 'range', start, end: size - 1 };
    }

    if (!/^\d+$/.test(startPart)) {
        return { kind: 'invalid' };
    }
    const start = Number.parseInt(startPart, 10);
    if (start >= size) {
        return { kind: 'invalid' };
    }

    if (endPart === '') {
        return { kind: 'range', start, end: size - 1 };
    }

    if (!/^\d+$/.test(endPart)) {
        return { kind: 'invalid' };
    }
    const end = Math.min(Number.parseInt(endPart, 10), size - 1);
    if (end < start) {
        return { kind: 'invalid' };
    }
    return { kind: 'range', start, end };
}

async function serveFileFromDir(
    req: IncomingMessage,
    res: ServerResponse,
    rootDir: string,
    relativeSegments: string[],
    options: { allowDirectoryListing: false; csp?: string | null },
): Promise<void> {
    if (relativeSegments.length === 0) {
        sendText(res, 403, 'Directory listing is not allowed');
        return;
    }

    let rootReal: string;
    try {
        rootReal = await realpath(rootDir);
    } catch {
        sendText(res, 404, 'Not found');
        return;
    }

    const candidate = path.resolve(rootDir, ...relativeSegments);
    if (!candidate.startsWith(rootDir + path.sep)) {
        sendText(res, 403, 'Forbidden');
        return;
    }

    let stat;
    try {
        stat = await lstat(candidate);
    } catch {
        sendText(res, 404, 'Not found');
        return;
    }

    if (stat.isDirectory()) {
        sendText(res, 403, 'Directory listing is not allowed');
        return;
    }

    let targetReal: string;
    try {
        targetReal = await realpath(candidate);
    } catch {
        sendText(res, 404, 'Not found');
        return;
    }

    if (!targetReal.startsWith(rootReal + path.sep)) {
        sendText(res, 403, 'Forbidden');
        return;
    }

    const realStat = stat.isSymbolicLink() ? await lstat(targetReal) : stat;
    if (!realStat.isFile()) {
        sendText(res, 404, 'Not found');
        return;
    }

    const headers: Record<string, string> = {
        'content-type': contentTypeForPath(targetReal),
        'accept-ranges': 'bytes',
    };
    if (options.csp && isHtmlPath(targetReal)) {
        headers['content-security-policy'] = options.csp;
    }

    const rangeHeader = req.headers.range;
    if (typeof rangeHeader === 'string') {
        const parsed = parseByteRange(rangeHeader, realStat.size);
        if (parsed.kind === 'invalid') {
            res.writeHead(416, {
                'content-range': `bytes */${realStat.size}`,
                'accept-ranges': 'bytes',
            });
            res.end();
            return;
        }
        const chunkLength = parsed.end - parsed.start + 1;
        res.writeHead(206, {
            ...headers,
            'content-range': `bytes ${parsed.start}-${parsed.end}/${realStat.size}`,
            'content-length': String(chunkLength),
        });
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        await pipeStream(createReadStream(targetReal, { start: parsed.start, end: parsed.end }), res);
        return;
    }

    res.writeHead(200, {
        ...headers,
        'content-length': String(realStat.size),
    });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    if (realStat.size === 0) {
        res.end();
        return;
    }
    await pipeStream(createReadStream(targetReal), res);
}

function pipeStream(stream: ReturnType<typeof createReadStream>, res: ServerResponse): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.on('error', (error) => {
            if (!res.headersSent) {
                sendText(res, 500, 'File read error');
            } else {
                res.destroy();
            }
            reject(error);
        });
        res.on('close', () => {
            stream.destroy();
            resolve();
        });
        stream.on('end', () => {
            resolve();
        });
        stream.pipe(res);
    });
}

function parseRemoteUiClientMessage(raw: string): RemoteUiClientMessage | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.type === 'hello' || record.type === 'terminate') {
        return { type: record.type };
    }
    if (record.type === 'launch' && typeof record.appId === 'string') {
        return { type: 'launch', appId: record.appId };
    }
    if (
        record.type === 'key' &&
        typeof record.key === 'string' &&
        (record.action === 'press' || record.action === 'down' || record.action === 'up')
    ) {
        return { type: 'key', key: record.key, action: record.action };
    }
    return null;
}

export function createHostHttpServer(options: HostHttpServerOptions): HostHttpServer {
    let server: Server | null = null;
    let wss: WebSocketServer | null = null;
    let boundPort = 0;
    const sockets = new Set<WebSocket>();

    async function handleAppRequest(req: IncomingMessage, res: ServerResponse, segments: string[]): Promise<void> {
        const packageId = segments[1];
        if (!packageId) {
            sendText(res, 404, 'Not found');
            return;
        }
        const rest = segments.slice(2);
        if (rest.length === 3 && rest[0] === '$WEBAPIS' && rest[1] === 'webapis' && rest[2] === 'webapis.js') {
            res.writeHead(200, {
                'content-type': 'application/javascript; charset=utf-8',
                'content-length': '0',
            });
            res.end();
            return;
        }

        let app: InstalledApp | null;
        try {
            app = await options.appStore.findByPackageId(packageId);
        } catch {
            app = null;
        }
        if (!app) {
            sendText(res, 404, 'App not found');
            return;
        }

        const contentDir = options.appStore.contentDir(app);
        await serveFileFromDir(req, res, contentDir, rest, {
            allowDirectoryListing: false,
            csp: app.manifest.contentSecurityPolicy,
        });
    }

    async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const rawUrl = req.url ?? '/';
        const queryIndex = rawUrl.indexOf('?');
        const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);

        const validated = splitAndValidatePath(rawPath);
        if ('status' in validated) {
            sendText(res, validated.status, validated.message);
            return;
        }
        const segments = validated.segments;

        if (segments[0] === 'control') {
            if (!isTokenAuthorized(req.headers.authorization, options.controlToken)) {
                sendJson(res, 401, { ok: false, error: 'Unauthorized' });
                return;
            }
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, error: 'Method not allowed' });
                return;
            }
            const command = segments[1];
            if (!command || segments.length !== 2) {
                sendJson(res, 404, { ok: false, error: 'Unknown control command' });
                return;
            }
            let body: Record<string, unknown>;
            try {
                body = await readJsonBody(req);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                sendJson(res, 400, { ok: false, error: message });
                return;
            }
            try {
                const result = await options.onControl(command, body);
                sendJson(res, result.status ?? 200, result.body, () => {
                    if (result.afterSend) {
                        void Promise.resolve(result.afterSend()).catch((err) => {
                            options.log?.(`[host] post-control error: ${err instanceof Error ? err.message : String(err)}`);
                        });
                    }
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                sendJson(res, 400, { ok: false, error: message });
            }
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendText(res, 405, 'Method not allowed');
            return;
        }

        if (segments.length === 3 && segments[0] === '$WEBAPIS' && segments[1] === 'webapis' && segments[2] === 'webapis.js') {
            res.writeHead(200, {
                'content-type': 'application/javascript; charset=utf-8',
                'content-length': '0',
            });
            res.end();
            return;
        }

        if (segments.length === 1 && segments[0] === 'idle') {
            const html = Buffer.from(renderIdleHtml(options.profile), 'utf8');
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'content-length': String(html.length),
            });
            res.end(req.method === 'HEAD' ? undefined : html);
            return;
        }

        if (segments[0] === 'remote') {
            if (rawPath === '/remote') {
                res.writeHead(302, { location: '/remote/' });
                res.end();
                return;
            }
            const rest = segments.slice(1);
            const targetSegments = rest.length === 0 ? ['index.html'] : rest;
            await serveFileFromDir(req, res, options.remoteAssetsDir, targetSegments, {
                allowDirectoryListing: false,
            });
            return;
        }

        if (segments[0] === 'nui') {
            if (!options.nuiAssetsDir) {
                sendText(res, 404, 'Not found');
                return;
            }
            if (rawPath === '/nui') {
                res.writeHead(302, { location: '/nui/' });
                res.end();
                return;
            }
            const rest = segments.slice(1);
            const targetSegments = rest.length === 0 ? ['index.html'] : rest;
            await serveFileFromDir(req, res, options.nuiAssetsDir, targetSegments, {
                allowDirectoryListing: false,
            });
            return;
        }

        if (segments[0] === 'app') {
            await handleAppRequest(req, res, segments);
            return;
        }

        sendText(res, 404, 'Not found');
    }

    return {
        async start(): Promise<number> {
            if (server) {
                return boundPort;
            }
            const wsServer = new WebSocketServer({ noServer: true });
            wss = wsServer;

            wsServer.on('connection', (socket) => {
                sockets.add(socket);
                socket.on('close', () => {
                    sockets.delete(socket);
                });
                socket.on('message', (data) => {
                    const text = typeof data === 'string' ? data : data.toString('utf8');
                    const message = parseRemoteUiClientMessage(text);
                    if (!message) {
                        return;
                    }
                    if (message.type === 'hello') {
                        void options
                            .getStateMessage()
                            .then((state) => {
                                if (socket.readyState === WebSocket.OPEN) {
                                    socket.send(JSON.stringify(state));
                                }
                            })
                            .catch(() => {});
                        return;
                    }
                    void options.onRemoteMessage(message).catch((error) => {
                        options.log?.(`[remote-ui] ${error instanceof Error ? error.message : String(error)}`);
                    });
                });

                void options
                    .getStateMessage()
                    .then((state) => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify(state));
                            const initialLogs = options.getInitialLogs?.() ?? [];
                            for (const entry of initialLogs) {
                                socket.send(JSON.stringify(entry));
                            }
                        }
                    })
                    .catch(() => {});
            });

            const httpServer = createServer((req, res) => {
                void handleHttpRequest(req, res).catch((error) => {
                    options.log?.(`[http] ${error instanceof Error ? error.message : String(error)}`);
                    if (!res.headersSent) {
                        sendText(res, 500, 'Internal server error');
                    }
                });
            });

            httpServer.on('upgrade', (req, socket, head) => {
                const rawUrl = req.url ?? '/';
                const queryIndex = rawUrl.indexOf('?');
                const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
                if (rawPath !== '/remote/ws') {
                    socket.destroy();
                    return;
                }
                wsServer.handleUpgrade(req, socket, head, (ws) => {
                    wsServer.emit('connection', ws, req);
                });
            });

            server = httpServer;

            await new Promise<void>((resolve, reject) => {
                httpServer.once('error', reject);
                httpServer.listen(options.port ?? 0, '127.0.0.1', () => {
                    httpServer.off('error', reject);
                    resolve();
                });
            });

            const addr = httpServer.address();
            if (!addr || typeof addr === 'string') {
                throw new Error('Failed to resolve HTTP server port');
            }
            boundPort = addr.port;
            return boundPort;
        },

        async stop(): Promise<void> {
            for (const socket of sockets) {
                socket.terminate();
            }
            sockets.clear();

            if (wss) {
                const activeWss = wss;
                wss = null;
                await new Promise<void>((resolve) => {
                    activeWss.close(() => resolve());
                });
            }

            if (server) {
                const activeServer = server;
                server = null;
                activeServer.closeAllConnections?.();
                await new Promise<void>((resolve) => {
                    activeServer.close(() => resolve());
                });
            }
            boundPort = 0;
        },

        port(): number {
            return boundPort;
        },

        broadcast(message: RemoteUiServerMessage): void {
            const payload = JSON.stringify(message);
            for (const socket of sockets) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(payload);
                }
            }
        },
    };
}
