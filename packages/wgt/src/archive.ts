import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { open, type Entry, type ZipFile } from 'yauzl';
import type { AppManifest } from '@tvemu/protocol';
import { parseConfigXml } from './manifest.js';
import { WgtError } from './wgt-error.js';

export interface WgtInspection {
    hasAuthorSignature: boolean;
    hasDistributorSignature: boolean;
    fileCount: number;
    totalUncompressedSize: number;
}

function archiveError(error: unknown): WgtError {
    if (error instanceof WgtError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const unsafe = /invalid relative path|absolute path|invalid characters in fileName/i.test(message);
    return new WgtError(unsafe ? 'UNSAFE_ENTRY' : 'NOT_A_WGT', message, { cause: error });
}

function safeEntry(entry: Entry): void {
    const name = entry.fileName;
    const segments = name.replace(/\/$/, '').split('/');
    const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
    if (!name || name.includes('\\') || name.includes('\0') || /^[A-Za-z]:/.test(name)
        || segments.some((part) => !part || part === '.' || part === '..')
        || mode === 0xa000 || (mode !== 0 && mode !== 0x8000 && mode !== 0x4000)) {
        throw new WgtError('UNSAFE_ENTRY', `Unsafe archive entry: ${name}`);
    }
}

async function visitArchive(path: string, visitor: (zip: ZipFile, entry: Entry) => Promise<void>): Promise<void> {
    const zip = await new Promise<ZipFile>((resolve, reject) => {
        open(path, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, archive) => {
            if (error || !archive) reject(archiveError(error ?? new Error('Missing ZIP archive')));
            else resolve(archive);
        });
    });
    try {
        await new Promise<void>((resolve, reject) => {
            let stopped = false;
            const fail = (error: unknown) => {
                stopped = true;
                reject(archiveError(error));
            };
            zip.on('error', fail);
            zip.once('end', resolve);
            zip.on('entry', (entry: Entry) => {
                Promise.resolve().then(() => {
                    safeEntry(entry);
                    return visitor(zip, entry);
                }).then(() => {
                    if (!stopped) zip.readEntry();
                }, fail);
            });
            zip.readEntry();
        });
    } finally {
        zip.close();
    }
}

function entryStream(zip: ZipFile, entry: Entry): Promise<Readable> {
    return new Promise((resolve, reject) => {
        zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) reject(error ?? new Error('Missing ZIP entry stream'));
            else resolve(stream);
        });
    });
}

export async function readWgtManifest(wgtPath: string): Promise<AppManifest> {
    let xml: string | undefined;
    await visitArchive(wgtPath, async (zip, entry) => {
        if (entry.fileName !== 'config.xml') return;
        if (xml !== undefined) throw new WgtError('INVALID_CONFIG', 'Duplicate config.xml');
        const stream = await entryStream(zip, entry);
        const buffers: Buffer[] = [];
        for await (const chunk of stream) buffers.push(Buffer.from(chunk));
        xml = Buffer.concat(buffers).toString('utf8');
    });
    if (xml === undefined) throw new WgtError('NOT_A_WGT', 'Archive has no root config.xml');
    return parseConfigXml(xml);
}

export async function inspectWgt(wgtPath: string): Promise<WgtInspection> {
    const result: WgtInspection = {
        hasAuthorSignature: false,
        hasDistributorSignature: false,
        fileCount: 0,
        totalUncompressedSize: 0,
    };
    let hasConfig = false;
    await visitArchive(wgtPath, async (_zip, entry) => {
        if (entry.fileName.endsWith('/')) return;
        hasConfig ||= entry.fileName === 'config.xml';
        result.hasAuthorSignature ||= entry.fileName === 'author-signature.xml';
        result.hasDistributorSignature ||= entry.fileName === 'signature1.xml';
        result.fileCount++;
        result.totalUncompressedSize += entry.uncompressedSize;
    });
    if (!hasConfig) throw new WgtError('NOT_A_WGT', 'Archive has no root config.xml');
    return result;
}

export async function extractWgt(wgtPath: string, destination: string): Promise<void> {
    await visitArchive(wgtPath, async (zip, entry) => {
        const target = join(destination, entry.fileName);
        if (entry.fileName.endsWith('/')) {
            await mkdir(target, { recursive: true });
            return;
        }
        await mkdir(dirname(target), { recursive: true });
        const stream = await entryStream(zip, entry);
        await pipeline(stream, createWriteStream(target, { flags: 'wx' }));
    });
}
