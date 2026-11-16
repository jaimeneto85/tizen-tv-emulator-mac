import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface RunState {
    port: number;
    pid: number;
    token: string;
    profile?: string;
}

export function runFilePath(home: string): string {
    return path.join(home, 'run.json');
}

export function isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EPERM') {
            return true;
        }
        return false;
    }
}

function isValidRunState(value: unknown): value is RunState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        typeof record.port === 'number' &&
        Number.isInteger(record.port) &&
        record.port > 0 &&
        typeof record.pid === 'number' &&
        Number.isInteger(record.pid) &&
        record.pid > 0 &&
        typeof record.token === 'string' &&
        record.token.length > 0 &&
        (record.profile === undefined || typeof record.profile === 'string')
    );
}

export async function readRunState(home: string): Promise<RunState | null> {
    const filePath = runFilePath(home);
    let raw: string;
    try {
        raw = await readFile(filePath, 'utf8');
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        await rm(filePath, { force: true });
        return null;
    }

    if (!isValidRunState(parsed) || !isProcessAlive(parsed.pid)) {
        await rm(filePath, { force: true });
        return null;
    }

    return parsed;
}

export async function writeRunState(home: string, state: RunState): Promise<void> {
    const existing = await readRunState(home);
    if (existing && existing.pid !== state.pid) {
        throw new Error(`Emulator is already running (pid ${existing.pid}, port ${existing.port})`);
    }
    await mkdir(home, { recursive: true });
    await writeFile(runFilePath(home), JSON.stringify(state, null, 4), 'utf8');
}

export async function removeRunState(home: string, expectedToken?: string): Promise<void> {
    const filePath = runFilePath(home);
    if (expectedToken !== undefined) {
        try {
            const raw = await readFile(filePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<RunState>;
            if (parsed.token !== expectedToken) {
                return;
            }
        } catch {
            return;
        }
    }
    await rm(filePath, { force: true });
}
