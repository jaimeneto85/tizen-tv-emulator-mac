import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NuiHostMessage, NuiPlayerMessage } from '@tvemu/protocol';
import type { UiVideo } from './agent.js';

export type VideoBackend = 'native' | 'browser';

export function resolveVideoPlaneHelper(env: NodeJS.ProcessEnv = process.env): string | null {
    if (process.platform !== 'darwin') {
        return null;
    }
    const override = env.TVEMU_VIDEO_PLANE;
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidate = override && override.trim() !== ''
        ? path.resolve(override)
        : path.resolve(here, '..', '..', '..', 'native', 'video-plane', 'build', 'tvemu-video-plane');
    return existsSync(candidate) ? candidate : null;
}

export function chooseVideoBackend(url: string, helperPath: string | null, env: NodeJS.ProcessEnv = process.env): VideoBackend {
    const mode = (env.TVEMU_VIDEO ?? 'auto').toLowerCase();
    if (mode === 'browser' || !helperPath) {
        return 'browser';
    }
    if (mode === 'native') {
        return 'native';
    }
    return /\.(webm|ogv|ogg)(\?|#|$)/i.test(url) ? 'browser' : 'native';
}

interface PlaneEntry {
    child: ChildProcess;
    url: string;
    state: 'idle' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
    positionMs: number;
    durationMs: number;
    error: string | null;
    visible: boolean;
}

export interface NativeVideoOptions {
    helperPath: string;
    muted: boolean;
    onEvent: (message: Extract<NuiHostMessage, { t: 'player' }>) => void;
    onFrame: (id: number, jpegBase64: string) => void;
    log: (line: string) => void;
}

export interface NativeVideo {
    owns(id: number): boolean;
    open(id: number, url: string): void;
    handle(message: NuiPlayerMessage): void;
    states(): UiVideo[];
    dispose(): void;
}

export function createNativeVideo(options: NativeVideoOptions): NativeVideo {
    const planes = new Map<number, PlaneEntry>();
    const displayModes = new Map<number, boolean>();

    const close = (id: number): void => {
        const entry = planes.get(id);
        if (!entry) {
            return;
        }
        planes.delete(id);
        entry.child.removeAllListeners('exit');
        try {
            entry.child.kill('SIGKILL');
        } catch {
        }
    };

    const send = (entry: PlaneEntry, command: Record<string, unknown>): void => {
        if (entry.child.stdin && !entry.child.stdin.destroyed) {
            entry.child.stdin.write(JSON.stringify(command) + '\n');
        }
    };

    const open = (id: number, url: string): void => {
        close(id);
        const child = spawn(options.helperPath, options.muted ? ['--muted'] : [], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
        const entry: PlaneEntry = { child, url, state: 'idle', positionMs: 0, durationMs: 0, error: null, visible: displayModes.get(id) === true };
        planes.set(id, entry);

        let eventBuffer = '';
        child.stdout?.on('data', (chunk: Buffer) => {
            eventBuffer += chunk.toString('utf8');
            let newline = eventBuffer.indexOf('\n');
            while (newline !== -1) {
                const line = eventBuffer.slice(0, newline);
                eventBuffer = eventBuffer.slice(newline + 1);
                newline = eventBuffer.indexOf('\n');
                if (planes.get(id) !== entry || !line.trim()) {
                    continue;
                }
                let event: { event?: string; positionMs?: number; durationMs?: number; message?: string };
                try {
                    event = JSON.parse(line);
                } catch {
                    continue;
                }
                if (typeof event.positionMs === 'number') entry.positionMs = event.positionMs;
                if (typeof event.durationMs === 'number') entry.durationMs = event.durationMs;
                switch (event.event) {
                    case 'prepared': entry.state = 'ready'; break;
                    case 'playing': entry.state = 'playing'; break;
                    case 'paused': entry.state = 'paused'; break;
                    case 'ended': entry.state = 'ended'; break;
                    case 'error': entry.state = 'error'; entry.error = event.message ?? 'Media playback error'; break;
                    case 'time':
                    case 'seeked': break;
                    default: continue;
                }
                options.onEvent({
                    t: 'player',
                    id,
                    event: event.event,
                    positionMs: event.positionMs,
                    durationMs: event.durationMs,
                    message: event.message,
                });
            }
        });

        let frameBuffer: Buffer = Buffer.alloc(0);
        const frames = child.stdio[3] as NodeJS.ReadableStream | null | undefined;
        frames?.on('data', (chunk: Buffer) => {
            frameBuffer = frameBuffer.length === 0 ? chunk : Buffer.concat([frameBuffer, chunk]);
            let latest: Buffer | null = null;
            while (frameBuffer.length >= 4) {
                const length = frameBuffer.readUInt32BE(0);
                if (frameBuffer.length < 4 + length) {
                    break;
                }
                latest = frameBuffer.subarray(4, 4 + length);
                frameBuffer = frameBuffer.subarray(4 + length);
            }
            if (latest && planes.get(id) === entry) {
                options.onFrame(id, latest.toString('base64'));
            }
        });

        child.stderr?.on('data', () => {});
        child.stdin?.on('error', () => {});
        child.on('error', (error) => {
            options.log(`[video] helper failed to start: ${error.message}`);
        });
        child.on('exit', (code) => {
            if (planes.get(id) !== entry) {
                return;
            }
            if (entry.state !== 'error' && code !== 0) {
                entry.state = 'error';
                entry.error = `Video helper exited with code ${code}`;
                options.onEvent({ t: 'player', id, event: 'error', message: entry.error });
            }
        });

        send(entry, { op: 'open', url });
    };

    return {
        owns: (id) => planes.has(id),
        open,
        handle(message) {
            if (message.op === 'display') {
                displayModes.set(message.id, message.mode === 'window');
            }
            const entry = planes.get(message.id);
            if (!entry) {
                return;
            }
            if (message.op === 'close') {
                close(message.id);
                return;
            }
            if (message.op === 'display') {
                entry.visible = message.mode === 'window';
                return;
            }
            if (message.op === 'stop') {
                entry.state = 'ready';
                entry.positionMs = 0;
            }
            send(entry, message as unknown as Record<string, unknown>);
        },
        states() {
            return [...planes.values()].map((entry) => ({
                src: entry.url,
                rect: { x: 0, y: 0, w: entry.visible ? 1920 : 0, h: entry.visible ? 1080 : 0 },
                paused: entry.state !== 'playing',
                ended: entry.state === 'ended',
                positionMs: entry.positionMs,
                durationMs: entry.durationMs,
                readyState: entry.state === 'idle' ? 0 : 4,
                error: entry.error,
            }));
        },
        dispose() {
            for (const id of [...planes.keys()]) {
                close(id);
            }
        },
    };
}
