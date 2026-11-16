import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileExists, findAppBundlesInDirectory, readAppBundleMetadata, readExecutableVersion } from './plist.js';

export type EngineSource = 'env' | 'downloaded' | 'search-path' | 'playwright-cache';

export interface ResolvedEngine {
    executablePath: string;
    source: EngineSource;
    version: string;
    exact: boolean;
}

export interface ResolveEngineOptions {
    home: string;
    env?: NodeJS.ProcessEnv;
    playwrightCacheDir?: string;
    strict?: boolean;
}

async function resolveFromEnv(milestone: number, env: NodeJS.ProcessEnv): Promise<ResolvedEngine | null> {
    const raw = env[`TVEMU_CHROMIUM_${milestone}`];
    if (!raw) {
        return null;
    }
    const executablePath = path.resolve(raw);
    if (!(await fileExists(executablePath))) {
        throw new Error(`TVEMU_CHROMIUM_${milestone} points to missing executable: ${executablePath}`);
    }
    const meta = await readExecutableVersion(executablePath);
    const exact = meta?.majorMilestone !== null && meta?.majorMilestone !== undefined
        ? meta.majorMilestone === milestone
        : true;
    return {
        executablePath,
        source: 'env',
        version: meta?.version ?? `${milestone}.0.0.0`,
        exact,
    };
}

async function resolveFromDownloaded(milestone: number, home: string): Promise<ResolvedEngine | null> {
    const milestoneDir = path.join(home, 'engines', String(milestone));
    const bundles = await findAppBundlesInDirectory(milestoneDir, 3);
    const chosen = bundles[0];
    if (!chosen) {
        return null;
    }
    const exact = chosen.majorMilestone !== null ? chosen.majorMilestone === milestone : true;
    return {
        executablePath: chosen.executablePath,
        source: 'downloaded',
        version: chosen.version,
        exact,
    };
}

async function resolveFromSearchPaths(milestone: number, env: NodeJS.ProcessEnv): Promise<ResolvedEngine | null> {
    const rawPaths = env.TVEMU_ENGINE_SEARCH_PATHS;
    if (!rawPaths) {
        return null;
    }
    const dirs = rawPaths.split(':').map((item) => item.trim()).filter(Boolean);
    for (const dir of dirs) {
        const directApp = path.join(dir, 'Chromium.app');
        const directMeta = await readAppBundleMetadata(directApp);
        if (directMeta && directMeta.majorMilestone === milestone) {
            return {
                executablePath: directMeta.executablePath,
                source: 'search-path',
                version: directMeta.version,
                exact: true,
            };
        }
        const nestedBundles = await findAppBundlesInDirectory(dir, 2);
        for (const bundle of nestedBundles) {
            if (path.basename(bundle.appPath) === 'Chromium.app' && bundle.majorMilestone === milestone) {
                return {
                    executablePath: bundle.executablePath,
                    source: 'search-path',
                    version: bundle.version,
                    exact: true,
                };
            }
        }
    }
    return null;
}

function parsePlaywrightRevision(dirName: string): number {
    const match = /^chromium-(\d+)$/.exec(dirName);
    return match?.[1] ? Number.parseInt(match[1], 10) : -1;
}

async function resolveFromPlaywrightCache(cacheDir: string, milestone: number): Promise<ResolvedEngine | null> {
    let entries;
    try {
        entries = await readdir(cacheDir, { withFileTypes: true });
    } catch {
        return null;
    }
    const chromiumDirs = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
        .sort((a, b) => parsePlaywrightRevision(b.name) - parsePlaywrightRevision(a.name));

    let fallback: ResolvedEngine | null = null;
    for (const dir of chromiumDirs) {
        const armDir = path.join(cacheDir, dir.name, 'chrome-mac-arm64');
        const bundles = await findAppBundlesInDirectory(armDir, 1);
        const chosen = bundles[0];
        if (!chosen) {
            continue;
        }
        const exact = chosen.majorMilestone === milestone;
        const candidate: ResolvedEngine = {
            executablePath: chosen.executablePath,
            source: 'playwright-cache',
            version: chosen.version,
            exact,
        };
        if (exact) {
            return candidate;
        }
        if (!fallback) {
            fallback = candidate;
        }
    }
    return fallback;
}

export async function resolveEngine(milestone: number, options: ResolveEngineOptions): Promise<ResolvedEngine> {
    const env = options.env ?? process.env;
    const playwrightCacheDir = options.playwrightCacheDir ?? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');

    const resolved =
        (await resolveFromEnv(milestone, env)) ??
        (await resolveFromDownloaded(milestone, options.home)) ??
        (await resolveFromSearchPaths(milestone, env)) ??
        (await resolveFromPlaywrightCache(playwrightCacheDir, milestone));

    if (!resolved) {
        throw new Error(`No Chromium binary found for milestone ${milestone}`);
    }

    if (options.strict && !resolved.exact) {
        throw new Error(
            `Exact Chromium M${milestone} required, but resolved Chromium ${resolved.version} via ${resolved.source}`,
        );
    }

    return resolved;
}
