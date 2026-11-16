import { TIMEOUT_ERR, WebAPIException } from './errors.js';

export interface PendingRequest {
    resolve: (result: unknown) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

export type BridgeEventHandler = (event: string, payload: unknown) => void;

export class Bridge {
    private nextId = 1;
    private readonly pending = new Map<number, PendingRequest>();
    private readonly eventHandlers: BridgeEventHandler[] = [];

    constructor(
        private readonly sendFunction: ((json: string) => void) | null,
        private readonly timeoutMs: number,
        private readonly onTimeout: (api: string, method: string) => void
    ) {}

    get available(): boolean {
        return this.sendFunction !== null;
    }

    request(api: string, method: string, args: unknown[]): Promise<unknown> {
        const id = this.nextId;
        this.nextId += 1;
        const send = this.sendFunction;
        if (!send) {
            return Promise.reject(new WebAPIException(TIMEOUT_ERR, 'no host bridge available'));
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                this.onTimeout(api, method);
                reject(new WebAPIException(TIMEOUT_ERR, `bridge request ${api}.${method} timed out`));
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            try {
                send(JSON.stringify({ id, api, method, args }));
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error);
            }
        });
    }

    notify(api: string, method: string, args: unknown[]): void {
        if (!this.sendFunction) {
            return;
        }
        try {
            this.sendFunction(JSON.stringify({ id: 0, api, method, args }));
        } catch {
            this.onTimeout(api, method);
        }
    }

    receive(json: string): void {
        let message: { id?: number; ok?: boolean; result?: unknown; error?: { name: string; message: string }; event?: string; payload?: unknown };
        try {
            message = JSON.parse(json);
        } catch {
            return;
        }
        if (message === null || typeof message !== 'object') {
            return;
        }
        if (typeof message.id === 'number' && message.id > 0 && typeof message.ok === 'boolean') {
            const entry = this.pending.get(message.id);
            if (!entry) {
                return;
            }
            clearTimeout(entry.timer);
            this.pending.delete(message.id);
            if (message.ok) {
                entry.resolve(message.result);
            } else {
                entry.reject(new WebAPIException(undefined, message.error ? message.error.message : 'bridge error', message.error ? message.error.name : undefined));
            }
            return;
        }
        if (typeof message.event === 'string') {
            for (const handler of this.eventHandlers.slice()) {
                try {
                    handler(message.event, message.payload);
                } catch (error) {
                    this.onTimeout('event', String(error));
                }
            }
        }
    }

    onEvent(handler: BridgeEventHandler): void {
        this.eventHandlers.push(handler);
    }
}

export function errorDescription(error: unknown): { name: string; message: string } {
    if (error instanceof WebAPIException) {
        return { name: error.name, message: error.message };
    }
    if (error instanceof Error) {
        return { name: 'UnknownError', message: error.message };
    }
    return { name: 'UnknownError', message: String(error) };
}
