import { mkdir, open, readdir, readFile, rename, rm, stat, utimes } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { DeviceFiles } from './device-files.js';
export function syncFrame(id: string, value = 0, data: Buffer = Buffer.alloc(0)): Buffer {
    const header = Buffer.alloc(8);
    header.write(id, 0, 4, 'ascii');
    header.writeUInt32LE(value >>> 0, 4);
    return Buffer.concat([header, data]);
}
export class SyncSession {
    private pending: Buffer = Buffer.alloc(0);
    private upload?: FileHandle;
    private destination?: string;
    private staging?: string;
    constructor(private readonly files: DeviceFiles, private readonly send: (data: Buffer) => Promise<void>) {}
    async close(): Promise<void> {
        await this.upload?.close(); this.upload = undefined;
        if (this.staging) await rm(this.staging, { force: true });
        this.staging = undefined;
    }
    async receive(chunk: Buffer): Promise<boolean> {
        this.pending = Buffer.concat([this.pending, chunk]);
        while (this.pending.length >= 8) {
            const id = this.pending.toString('ascii', 0, 4);
            const value = this.pending.readUInt32LE(4);
            const size = id === 'DONE' || id === 'QUIT' ? 0 : value;
            if (size > (id === 'DATA' ? 65536 : 1024)) throw new Error('Sync frame too large');
            if (this.pending.length < 8 + size) break;
            const data = this.pending.subarray(8, 8 + size);
            this.pending = this.pending.subarray(8 + size);
            try {
                if (id === 'QUIT') { await this.close(); return true; }
                await this.request(id, value, data);
            } catch (error) {
                await this.close();
                const message = Buffer.from(error instanceof Error ? error.message : String(error));
                await this.send(syncFrame('FAIL', message.length, message));
            }
        }
        return false;
    }
    private async request(id: string, value: number, data: Buffer): Promise<void> {
        if (id === 'DATA') {
            if (!this.upload) throw new Error('SEND required');
            await this.upload.writeFile(data);
            return;
        }
        if (id === 'DONE') {
            if (!this.upload || !this.destination) throw new Error('SEND required');
            await this.upload.close();
            this.upload = undefined;
            if (!this.staging) throw new Error('Missing staging file');
            await rename(this.staging, this.destination);
            this.staging = undefined;
            await utimes(this.destination, value, value);
            await this.send(syncFrame('OKAY'));
            return;
        }
        if (this.upload) throw new Error('Upload in progress');
        const remote = data.toString(isUtf8(data) ? 'utf8' : 'latin1');
        const path = await this.files.path(id === 'SEND' ? remote.replace(/,\d+$/, '') : remote);
        if (id === 'SEND') {
            await mkdir(dirname(path), { recursive: true });
            this.staging = `${path}.${randomUUID()}.upload`;
            this.upload = await open(this.staging, 'wx', 0o600);
            this.destination = path;
        } else if (id === 'STAT') {
            const result = Buffer.alloc(16);
            result.write('STAT');
            const entry = await stat(path).catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return undefined;
                throw error;
            });
            if (entry) {
                result.writeUInt32LE(entry.mode, 4);
                result.writeUInt32LE(entry.size >>> 0, 8);
                result.writeUInt32LE(Math.floor(entry.mtimeMs / 1000) >>> 0, 12);
            }
            await this.send(result);
        } else if (id === 'RECV') {
            const contents = await readFile(path);
            for (let offset = 0; offset < contents.length; offset += 65536) {
                const part = contents.subarray(offset, offset + 65536);
                await this.send(syncFrame('DATA', part.length, part));
            }
            await this.send(syncFrame('DONE'));
        } else if (id === 'LIST') {
            for (const name of await readdir(path)) {
                const entry = await stat(await this.files.path(remote + '/' + name));
                const encoded = Buffer.from(name);
                const result = Buffer.alloc(20);
                result.write('DENT');
                result.writeUInt32LE(entry.mode, 4);
                result.writeUInt32LE(entry.size >>> 0, 8);
                result.writeUInt32LE(Math.floor(entry.mtimeMs / 1000) >>> 0, 12);
                result.writeUInt32LE(encoded.length, 16);
                await this.send(Buffer.concat([result, encoded]));
            }
            await this.send(Buffer.concat([Buffer.from('DONE'), Buffer.alloc(16)]));
        } else throw new Error('Unknown sync request');
    }
}
