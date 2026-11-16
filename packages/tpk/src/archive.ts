import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { open, type Entry, type ZipFile } from 'yauzl';
import { parseTizenManifest, type TpkManifest } from './manifest.js';
import { TpkError } from './tpk-error.js';

const TPK_MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
export const TPK_MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

function archiveError(error: unknown): TpkError {
    if (error instanceof TpkError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const unsafe = /invalid relative path|absolute path|invalid characters in fileName/i.test(message);
    return new TpkError(unsafe ? 'UNSAFE_ENTRY' : 'NOT_A_TPK', message, { cause: error });
}

function safeEntry(entry: Entry): void {
    const name = entry.fileName;
    const segments = name.replace(/\/$/, '').split('/');
    const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
    if (!name || name.includes('\\') || name.includes('\0') || /^[A-Za-z]:/.test(name)
        || segments.some((part) => !part || part === '.' || part === '..')
        || mode === 0xa000 || (mode !== 0 && mode !== 0x8000 && mode !== 0x4000)) {
        throw new TpkError('UNSAFE_ENTRY', `Unsafe archive entry: ${name}`);
    }
}

async function visitArchive(
    path: string,
    visitor: (zip: ZipFile, entry: Entry) => Promise<void>,
    checkEntries = true,
): Promise<void> {
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
                    if (checkEntries) safeEntry(entry);
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

async function readEntryText(zip: ZipFile, entry: Entry): Promise<string> {
    const stream = await entryStream(zip, entry);
    const buffers: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > TPK_MAX_MANIFEST_BYTES) {
            stream.destroy();
            throw new TpkError('TOO_LARGE', 'tizen-manifest.xml exceeds the size limit');
        }
        buffers.push(buffer);
    }
    return Buffer.concat(buffers).toString('utf8');
}

interface ArchiveManifest {
    manifest: Omit<TpkManifest, 'signed'>;
    author: boolean;
    distributor: boolean;
}

async function scanManifest(tpkPath: string): Promise<ArchiveManifest> {
    let xml: string | undefined;
    let author = false;
    let distributor = false;
    await visitArchive(tpkPath, async (zip, entry) => {
        if (entry.fileName === 'author-signature.xml') {
            author = true;
            return;
        }
        if (entry.fileName === 'signature1.xml') {
            distributor = true;
            return;
        }
        if (entry.fileName !== 'tizen-manifest.xml') return;
        if (xml !== undefined) throw new TpkError('INVALID_MANIFEST', 'Duplicate tizen-manifest.xml');
        xml = await readEntryText(zip, entry);
    });
    if (xml === undefined) throw new TpkError('NOT_A_TPK', 'Archive has no root tizen-manifest.xml');
    return { manifest: parseTizenManifest(xml), author, distributor };
}

export async function isTpk(filePath: string): Promise<boolean> {
    let found = false;
    try {
        await visitArchive(filePath, async (_zip, entry) => {
            found ||= entry.fileName === 'tizen-manifest.xml';
        }, false);
    } catch {
        return false;
    }
    return found;
}

export async function readTpkManifest(tpkPath: string): Promise<TpkManifest> {
    const { manifest, author, distributor } = await scanManifest(tpkPath);
    return { ...manifest, signed: { author, distributor } };
}

export async function extractTpk(tpkPath: string, destDir: string): Promise<TpkManifest> {
    let xml: string | undefined;
    let author = false;
    let distributor = false;
    let totalUncompressedSize = 0;
    const seenNames = new Set<string>();
    await visitArchive(tpkPath, async (zip, entry) => {
        const foldedName = entry.fileName.replace(/\/$/, '').toLowerCase();
        if (!entry.fileName.endsWith('/')) {
            if (seenNames.has(foldedName)) {
                throw new TpkError('UNSAFE_ENTRY', `Duplicate or case-colliding entry: ${entry.fileName}`);
            }
            seenNames.add(foldedName);
        }
        if (entry.fileName === 'author-signature.xml') {
            author = true;
            return;
        }
        if (entry.fileName === 'signature1.xml') {
            distributor = true;
            return;
        }
        if (entry.fileName === 'tizen-manifest.xml') {
            if (xml !== undefined) throw new TpkError('INVALID_MANIFEST', 'Duplicate tizen-manifest.xml');
            xml = await readEntryText(zip, entry);
        }
        totalUncompressedSize += entry.uncompressedSize;
        if (totalUncompressedSize > TPK_MAX_TOTAL_UNCOMPRESSED_BYTES) {
            throw new TpkError('TOO_LARGE', 'Archive exceeds the total uncompressed size limit');
        }
        const target = join(destDir, entry.fileName);
        if (entry.fileName.endsWith('/')) {
            await mkdir(target, { recursive: true });
            return;
        }
        await mkdir(dirname(target), { recursive: true });
        const stream = await entryStream(zip, entry);
        await pipeline(stream, createWriteStream(target, { flags: 'wx' }));
    });
    if (xml === undefined) throw new TpkError('NOT_A_TPK', 'Archive has no root tizen-manifest.xml');
    return { ...parseTizenManifest(xml), signed: { author, distributor } };
}
