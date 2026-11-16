import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AppManifest, InstalledApp } from '@tvemu/protocol';
import { extractWgt, readWgtManifest } from './archive.js';
import { WgtError } from './wgt-error.js';
import { parseConfigXml } from './manifest.js';
import { loadTpkModule, type TpkApp, type TpkManifest, type TpkModule } from './tpk-loader.js';

export interface AppStore {
    install(wgtPath: string): Promise<InstalledApp>;
    uninstall(packageId: string): Promise<void>;
    list(): Promise<InstalledApp[]>;
    findByAppId(appId: string): Promise<InstalledApp | null>;
    findByPackageId(packageId: string): Promise<InstalledApp | null>;
    contentDir(app: InstalledApp): string;
}

export interface CreateAppStoreOptions {
    loadTpk?: () => Promise<TpkModule | null>;
}

const queues = new Map<string, Promise<unknown>>();

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (queues.get(key) ?? Promise.resolve()).then(operation);
    const tail = result.catch(() => undefined);
    queues.set(key, tail);
    void tail.then(() => {
        if (queues.get(key) === tail) queues.delete(key);
    });
    return result;
}

function packageSegment(packageId: string): string {
    if (!packageId || packageId.startsWith('.') || /[\\/:\0]/.test(packageId)) {
        throw new WgtError('UNSAFE_ENTRY', `Unsafe package id: ${packageId}`);
    }
    return packageId;
}

function isAbsent(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        const stat = await lstat(path);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new WgtError('UNSAFE_ENTRY', `Unsafe app directory: ${path}`);
        return true;
    } catch (error) {
        if (isAbsent(error)) return false;
        throw error;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === 'string';
}

function isManifest(value: unknown): value is AppManifest {
    if (!isRecord(value)) return false;
    const strings = ['widgetId', 'appId', 'packageId', 'name', 'version', 'requiredVersion', 'contentSrc'];
    const nullable = ['icon', 'contentSecurityPolicy', 'profile'];
    return strings.every((key) => typeof value[key] === 'string')
        && nullable.every((key) => value[key] === null || typeof value[key] === 'string')
        && (value.kind === undefined || value.kind === 'wgt' || value.kind === 'tpk')
        && isOptionalString(value.exec)
        && isOptionalString(value.appType)
        && isOptionalString(value.apiVersion)
        && Array.isArray(value.privileges) && value.privileges.every((item) => isRecord(item) && typeof item.name === 'string')
        && Array.isArray(value.features) && value.features.every((item) => typeof item === 'string')
        && Array.isArray(value.accessOrigins) && value.accessOrigins.every((item) => typeof item === 'string')
        && isRecord(value.settings) && Object.values(value.settings).every((item) => typeof item === 'string');
}

function toAppManifestFromTpk(tpkManifest: TpkManifest, uiApp: TpkApp): AppManifest {
    return {
        widgetId: tpkManifest.packageId,
        appId: uiApp.appId,
        packageId: tpkManifest.packageId,
        name: uiApp.label || tpkManifest.label || uiApp.appId,
        version: tpkManifest.version,
        requiredVersion: tpkManifest.apiVersion,
        contentSrc: uiApp.exec,
        icon: uiApp.icon,
        privileges: tpkManifest.privileges.map((name) => ({ name })),
        features: [],
        contentSecurityPolicy: null,
        accessOrigins: [],
        settings: {},
        profile: tpkManifest.profiles[0] ?? null,
        kind: 'tpk',
        exec: uiApp.exec,
        appType: uiApp.type,
        apiVersion: tpkManifest.apiVersion,
    };
}

export function createAppStore(home: string, options?: CreateAppStoreOptions): AppStore {
    const appsDirectory = resolve(home, 'apps');
    const directoryFor = (packageId: string) => join(appsDirectory, packageSegment(packageId));
    const queued = <T>(operation: () => Promise<T>) => serialize(appsDirectory, operation);

    async function lookup(packageId: string): Promise<InstalledApp | null> {
        const installDir = directoryFor(packageId);
        if (!await directoryExists(appsDirectory) || !await directoryExists(installDir)) return null;
        const manifestPath = join(installDir, 'manifest.json');
        const stat = await lstat(manifestPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new WgtError('UNSAFE_ENTRY', 'Unsafe installed manifest');
        let value: unknown;
        try {
            value = JSON.parse(await readFile(manifestPath, 'utf8'));
        } catch (error) {
            throw new WgtError('INVALID_CONFIG', 'Invalid installed manifest', { cause: error });
        }
        if (!isRecord(value) || !isManifest(value.manifest) || value.manifest.packageId !== packageId
            || typeof value.installedAt !== 'string' || !Number.isFinite(Date.parse(value.installedAt))) {
            throw new WgtError('INVALID_CONFIG', 'Invalid installed app metadata');
        }
        return { manifest: value.manifest, installedAt: value.installedAt, installDir };
    }

    async function listing(): Promise<InstalledApp[]> {
        if (!await directoryExists(appsDirectory)) return [];
        const entries = await readdir(appsDirectory, { withFileTypes: true });
        const result: InstalledApp[] = [];
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (entry.name.startsWith('.') || !entry.isDirectory()) continue;
            const app = await lookup(entry.name);
            if (app) result.push(app);
        }
        return result;
    }

    return {
        install: (packagePath) => queued(async () => {
            const tpkLoader = options?.loadTpk ?? loadTpkModule;
            const tpk = await tpkLoader();
            const isTpkPackage = tpk ? await tpk.isTpk(packagePath) : false;
            const manifest = isTpkPackage && tpk
                ? (() => {
                    return tpk.readTpkManifest(packagePath).then((tpkManifest) => {
                        const uiApp = tpk.mainUiApp(tpkManifest);
                        return toAppManifestFromTpk(tpkManifest, uiApp);
                    });
                })()
                : readWgtManifest(packagePath);
            const resolvedManifest = await manifest;
            const installDir = directoryFor(resolvedManifest.packageId);
            await directoryExists(appsDirectory);
            await mkdir(appsDirectory, { recursive: true });
            const existed = await directoryExists(installDir);
            const staging = await mkdtemp(join(appsDirectory, '.install-'));
            const backup = `${staging}-backup`;
            let backedUp = false;
            let published = false;
            try {
                const content = join(staging, 'content');
                await mkdir(content);
                if (isTpkPackage && tpk) {
                    const extractedTpk = await tpk.extractTpk(packagePath, content);
                    const extractedUiApp = tpk.mainUiApp(extractedTpk);
                    const finalManifest = toAppManifestFromTpk(extractedTpk, extractedUiApp);
                    if (JSON.stringify(finalManifest) !== JSON.stringify(resolvedManifest)) {
                        throw new WgtError('INVALID_CONFIG', 'Package changed during installation');
                    }
                    const execStat = await lstat(join(content, 'bin', extractedUiApp.exec)).catch(() => null);
                    if (!execStat || !execStat.isFile()) {
                        throw new WgtError('INVALID_CONFIG', `Package has no bin/${extractedUiApp.exec}`);
                    }
                } else {
                    await extractWgt(packagePath, content);
                    const extractedManifest = await readFile(join(content, 'config.xml'), 'utf8');
                    const finalManifest = parseConfigXml(extractedManifest);
                    if (JSON.stringify(finalManifest) !== JSON.stringify(resolvedManifest)) {
                        throw new WgtError('INVALID_CONFIG', 'Package changed during installation');
                    }
                }
                const app: InstalledApp = { manifest: resolvedManifest, installDir, installedAt: new Date().toISOString() };
                await writeFile(join(staging, 'manifest.json'), JSON.stringify(app, null, 4), { flag: 'wx' });
                if (existed) {
                    await rename(installDir, backup);
                    backedUp = true;
                }
                await rename(staging, installDir);
                published = true;
                if (backedUp) await rm(backup, { recursive: true, force: true });
                return app;
            } catch (error) {
                if (backedUp && !published) await rename(backup, installDir);
                throw error;
            } finally {
                await rm(staging, { recursive: true, force: true });
            }
        }),
        uninstall: (packageId) => queued(async () => {
            const path = directoryFor(packageId);
            if (!await directoryExists(appsDirectory) || !await directoryExists(path)) {
                throw new WgtError('NOT_INSTALLED', `Package is not installed: ${packageId}`);
            }
            await rm(path, { recursive: true });
        }),
        list: () => queued(listing),
        findByPackageId: (packageId) => queued(() => lookup(packageId)),
        findByAppId: (appId) => queued(async () => (await listing()).find((app) => app.manifest.appId === appId) ?? null),
        contentDir: (app) => join(directoryFor(app.manifest.packageId), 'content'),
    };
}
