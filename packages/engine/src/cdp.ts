import { readFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';

interface PendingCommand {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
}

type EventListener = (params: Record<string, unknown>, sessionId?: string) => void;
type CloseListener = (reason: string) => void;

export interface DevToolsEndpoint {
    port: number;
    browserPath: string;
}

export class CdpClient {
    private readonly socket: WebSocket;
    private nextId = 1;
    private readonly pending = new Map<number, PendingCommand>();
    private readonly eventListeners = new Map<string, Set<EventListener>>();
    private readonly closeListeners = new Set<CloseListener>();
    private closed = false;

    private constructor(socket: WebSocket) {
        this.socket = socket;
        socket.on('message', (raw) => {
            this.handleMessage(raw.toString());
        });
        socket.on('close', (code, reason) => {
            const text = reason.toString();
            const message = text ? `CDP WebSocket closed (${code}: ${text})` : `CDP WebSocket closed (${code})`;
            this.handleClose(message);
        });
        socket.on('error', (error) => {
            this.handleClose(`CDP WebSocket error: ${error.message}`);
        });
    }

    static async connect(wsUrl: string): Promise<CdpClient> {
        const socket = new WebSocket(wsUrl);
        await new Promise<void>((resolve, reject) => {
            const onOpen = () => {
                socket.off('error', onError);
                resolve();
            };
            const onError = (error: Error) => {
                socket.off('open', onOpen);
                reject(error);
            };
            socket.once('open', onOpen);
            socket.once('error', onError);
        });
        return new CdpClient(socket);
    }

    send<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T> {
        if (this.closed) {
            return Promise.reject(new Error(`CDP client is closed (cannot send ${method})`));
        }
        const id = this.nextId++;
        const payload: Record<string, unknown> = { id, method };
        if (params !== undefined) {
            payload.params = params;
        }
        if (sessionId !== undefined) {
            payload.sessionId = sessionId;
        }
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve: (value) => resolve(value as T),
                reject,
            });
            this.socket.send(JSON.stringify(payload), (error) => {
                if (error) {
                    this.pending.delete(id);
                    reject(error);
                }
            });
        });
    }

    on(method: string, listener: EventListener): () => void {
        let listeners = this.eventListeners.get(method);
        if (!listeners) {
            listeners = new Set();
            this.eventListeners.set(method, listeners);
        }
        listeners.add(listener);
        return () => {
            listeners?.delete(listener);
        };
    }

    onClose(listener: CloseListener): () => void {
        this.closeListeners.add(listener);
        return () => {
            this.closeListeners.delete(listener);
        };
    }

    async close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        await new Promise<void>((resolve) => {
            if (this.socket.readyState === WebSocket.CLOSED) {
                resolve();
                return;
            }
            this.socket.once('close', () => resolve());
            this.socket.close();
        });
    }

    private handleMessage(raw: string): void {
        let message: {
            id?: number;
            method?: string;
            params?: Record<string, unknown>;
            sessionId?: string;
            result?: unknown;
            error?: { code?: number; message?: string };
        };
        try {
            message = JSON.parse(raw) as typeof message;
        } catch {
            return;
        }

        if (typeof message.id === 'number') {
            const pending = this.pending.get(message.id);
            if (!pending) {
                return;
            }
            this.pending.delete(message.id);
            if (message.error) {
                pending.reject(new Error(`CDP error (${message.error.code ?? -1}): ${message.error.message ?? 'unknown'}`));
            } else {
                pending.resolve(message.result);
            }
            return;
        }

        if (typeof message.method === 'string') {
            const listeners = this.eventListeners.get(message.method);
            if (!listeners) {
                return;
            }
            const params = message.params ?? {};
            for (const listener of listeners) {
                listener(params, message.sessionId);
            }
        }
    }

    private handleClose(reason: string): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        const error = new Error(reason);
        for (const pending of this.pending.values()) {
            pending.reject(error);
        }
        this.pending.clear();
        for (const listener of this.closeListeners) {
            listener(reason);
        }
    }
}

export async function waitForDevToolsActivePort(
    userDataDir: string,
    hasExited: () => string | null,
    timeoutMs = 15000,
): Promise<DevToolsEndpoint> {
    const filePath = path.join(userDataDir, 'DevToolsActivePort');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const exitReason = hasExited();
        if (exitReason) {
            throw new Error(`Chromium exited before DevToolsActivePort was ready: ${exitReason}`);
        }
        try {
            const content = await readFile(filePath, 'utf8');
            const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const port = Number.parseInt(lines[0] ?? '', 10);
            const browserPath = lines[1];
            if (Number.isFinite(port) && port > 0 && browserPath) {
                return { port, browserPath };
            }
        } catch {
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${filePath}`);
}

export interface JsonListTarget {
    id: string;
    type: string;
    url: string;
    webSocketDebuggerUrl?: string;
}

export async function fetchPageTargetWsUrl(port: number): Promise<string> {
    const hosts = ['127.0.0.1', '[::1]'];
    const deadline = Date.now() + 10000;
    let lastError = 'no targets';

    while (Date.now() < deadline) {
        for (const host of hosts) {
            try {
                const response = await fetch(`http://${host}:${port}/json/list`);
                if (!response.ok) {
                    lastError = `HTTP ${response.status}`;
                    continue;
                }
                const targets = (await response.json()) as JsonListTarget[];
                const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
                if (page?.webSocketDebuggerUrl) {
                    return page.webSocketDebuggerUrl;
                }
                lastError = 'page target not yet available';
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Could not find page WebSocket debugger URL on port ${port}: ${lastError}`);
}
