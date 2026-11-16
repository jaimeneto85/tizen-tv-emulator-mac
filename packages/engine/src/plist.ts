import { execFile } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AppBundleMetadata {
    appPath: string;
    executablePath: string;
    executableName: string;
    version: string;
    majorMilestone: number | null;
}

export function parsePlistXmlString(xml: string, key: string): string | null {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<key>${escaped}<\\/key>\\s*<string>([^<]+)<\\/string>`);
    const match = pattern.exec(xml);
    return match?.[1]?.trim() ?? null;
}

export function extractMajorMilestone(version: string): number | null {
    const match = /^(\d+)/.exec(version.trim());
    if (!match?.[1]) {
        return null;
    }
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export async function fileExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function readPlistAsXml(plistPath: string): Promise<string | null> {
    if (!(await fileExists(plistPath))) {
        return null;
    }
    const raw = await readFile(plistPath);
    if (raw.subarray(0, 6).toString('ascii') === 'bplist') {
        const { stdout } = await execFileAsync('plutil', ['-convert', 'xml1', '-o', '-', plistPath]);
        return stdout;
    }
    return raw.toString('utf8');
}

export async function readAppBundleMetadata(appPath: string): Promise<AppBundleMetadata | null> {
    const plistPath = path.join(appPath, 'Contents', 'Info.plist');
    const xml = await readPlistAsXml(plistPath);
    if (!xml) {
        return null;
    }
    const version = parsePlistXmlString(xml, 'CFBundleShortVersionString') ?? parsePlistXmlString(xml, 'CFBundleVersion');
    if (!version) {
        return null;
    }
    const fallbackName = path.basename(appPath, '.app');
    const executableName = parsePlistXmlString(xml, 'CFBundleExecutable') ?? fallbackName;
    const executablePath = path.join(appPath, 'Contents', 'MacOS', executableName);
    if (!(await fileExists(executablePath))) {
        return null;
    }
    return {
        appPath,
        executablePath,
        executableName,
        version,
        majorMilestone: extractMajorMilestone(version),
    };
}

export async function readExecutableVersion(executablePath: string): Promise<{ version: string; majorMilestone: number | null } | null> {
    const plistPath = path.resolve(path.dirname(executablePath), '..', 'Info.plist');
    const xml = await readPlistAsXml(plistPath);
    if (!xml) {
        return null;
    }
    const version = parsePlistXmlString(xml, 'CFBundleShortVersionString') ?? parsePlistXmlString(xml, 'CFBundleVersion');
    if (!version) {
        return null;
    }
    return {
        version,
        majorMilestone: extractMajorMilestone(version),
    };
}

export async function findAppBundlesInDirectory(rootDir: string, maxDepth = 3): Promise<AppBundleMetadata[]> {
    const found: AppBundleMetadata[] = [];

    async function walk(currentDir: string, depth: number): Promise<void> {
        let entries;
        try {
            entries = await readdir(currentDir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const fullPath = path.join(currentDir, entry.name);
            if (entry.name.endsWith('.app')) {
                const metadata = await readAppBundleMetadata(fullPath);
                if (metadata) {
                    found.push(metadata);
                }
                continue;
            }
            if (depth < maxDepth) {
                await walk(fullPath, depth + 1);
            }
        }
    }

    await walk(rootDir, 0);
    return found;
}
