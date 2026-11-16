import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstalledApp } from '@tvemu/protocol';
import { isProcessAlive, readRunState, type RunState } from './run-file.js';

export async function callControl<T extends Record<string, unknown>>(
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

export async function requireRunning(home: string): Promise<RunState> {
    const existing = await readRunState(home);
    if (!existing) {
        throw new Error('No running emulator found. Start one with: tvemu start --detach');
    }
    return existing;
}

export function emulatorLogPath(home: string): string {
    return path.join(home, 'emulator.log');
}

async function logTail(home: string): Promise<string> {
    try {
        const text = await readFile(emulatorLogPath(home), 'utf8');
        return text.split('\n').filter((line) => !line.includes('[chromium:stderr]')).slice(-15).join('\n');
    } catch {
        return '';
    }
}

export interface DetachedStart {
    pid: number;
    port: number;
    logPath: string;
    running: InstalledApp | null;
}

export async function startDetached(
    home: string,
    command: 'start' | 'run',
    args: string[],
    env: NodeJS.ProcessEnv,
    timeoutMs = 60000,
): Promise<DetachedStart> {
    const existing = await readRunState(home);
    if (existing) {
        throw new Error(`Emulator is already running (pid ${existing.pid}, port ${existing.port})`);
    }
    mkdirSync(home, { recursive: true });
    const logPath = emulatorLogPath(home);
    const out = openSync(logPath, 'w');
    const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js');
    const child = spawn(process.execPath, [cliPath, command, ...args], {
        detached: true,
        stdio: ['ignore', out, out],
        env,
    });
    closeSync(out);
    child.unref();
    const childPid = child.pid ?? 0;
    const expectsApp = command === 'run';
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await readRunState(home);
        if (state) {
            const status = await callControl<{ running: InstalledApp | null }>(state, 'status').catch(() => null);
            if (status && (!expectsApp || status.running)) {
                return { pid: state.pid, port: state.port, logPath, running: status.running };
            }
        }
        if (!isProcessAlive(childPid)) {
            throw new Error(`The emulator exited during startup.\n${await logTail(home)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`The emulator did not become ready within ${timeoutMs} ms.\n${await logTail(home)}`);
}
