import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { findAppBundlesInDirectory } from './plist.js';
import { ENGINE_REGISTRY, findRegistryEntry, type EngineRegistryEntry } from './registry.js';

const execFileAsync = promisify(execFile);

export interface DownloadProgress {
    receivedBytes: number;
    totalBytes: number | null;
}

export interface DownloadEngineOptions {
    home: string;
    onProgress?: (progress: DownloadProgress) => void;
    registry?: readonly EngineRegistryEntry[];
}

export interface DownloadEngineResult {
    installDir: string;
    executablePath: string | null;
    version: string | null;
    sha256: string;
}

export async function downloadEngine(milestone: number, options: DownloadEngineOptions): Promise<DownloadEngineResult> {
    const entry = findRegistryEntry(milestone, options.registry ?? ENGINE_REGISTRY);
    if (!entry) {
        throw new Error(`Unsupported Chromium milestone: ${milestone}`);
    }

    const enginesDir = path.join(options.home, 'engines');
    const installDir = path.join(enginesDir, String(milestone));
    await mkdir(enginesDir, { recursive: true });
    const tempZipPath = path.join(enginesDir, `.download-${milestone}-${Date.now()}.zip`);

    try {
        const response = await fetch(entry.url);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to download Chromium ${milestone}: HTTP ${response.status}`);
        }

        const headerLength = response.headers.get('content-length');
        const totalBytes = headerLength ? Number.parseInt(headerLength, 10) : null;
        const hash = createHash('sha256');
        const fileStream = createWriteStream(tempZipPath);
        const reader = response.body.getReader();
        let receivedBytes = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const chunk = Buffer.from(value);
                hash.update(chunk);
                receivedBytes += chunk.byteLength;
                await new Promise<void>((resolve, reject) => {
                    fileStream.write(chunk, (error) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve();
                    });
                });
                options.onProgress?.({ receivedBytes, totalBytes });
            }
        } finally {
            await new Promise<void>((resolve, reject) => {
                fileStream.end((error?: Error | null) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }

        const actualSha256 = hash.digest('hex');
        if (entry.sha256 !== null && actualSha256.toLowerCase() !== entry.sha256.toLowerCase()) {
            throw new Error(`SHA-256 mismatch for Chromium ${milestone}: expected ${entry.sha256}, got ${actualSha256}`);
        }

        await mkdir(installDir, { recursive: true });
        await execFileAsync('/usr/bin/unzip', ['-q', '-o', tempZipPath, '-d', installDir]);

        const bundles = await findAppBundlesInDirectory(installDir, 3);
        const chosen = bundles[0];
        return {
            installDir,
            executablePath: chosen?.executablePath ?? null,
            version: chosen?.version ?? null,
            sha256: actualSha256,
        };
    } finally {
        await rm(tempZipPath, { force: true });
    }
}
