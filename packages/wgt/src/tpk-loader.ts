export type TpkAppKind = 'ui' | 'service' | 'widget' | 'watch' | 'component';

export interface TpkApp {
    appId: string;
    exec: string;
    type: string;
    kind: TpkAppKind;
    label: string;
    labels: Record<string, string>;
    icon: string | null;
    metadata: Record<string, string>;
    nodisplay: boolean;
    launchMode: string | null;
}

export interface TpkManifest {
    packageId: string;
    version: string;
    apiVersion: string;
    profiles: string[];
    label: string;
    privileges: string[];
    apps: TpkApp[];
    signed: { author: boolean; distributor: boolean };
}

export interface TpkModule {
    isTpk(filePath: string): Promise<boolean>;
    readTpkManifest(tpkPath: string): Promise<TpkManifest>;
    extractTpk(tpkPath: string, destDir: string): Promise<TpkManifest>;
    mainUiApp(manifest: TpkManifest): TpkApp;
    isDotnetApp?(app: TpkApp): boolean;
}

function isTpkModule(value: unknown): value is TpkModule {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.isTpk === 'function'
        && typeof record.readTpkManifest === 'function'
        && typeof record.extractTpk === 'function'
        && typeof record.mainUiApp === 'function';
}

export async function loadTpkModule(): Promise<TpkModule | null> {
    const pkgName = '@tvemu/tpk';
    try {
        const mod: unknown = await import(pkgName);
        if (isTpkModule(mod)) return mod;
    } catch {
    }
    try {
        const siblingUrl = new URL('../../tpk/dist/index.js', import.meta.url).href;
        const mod: unknown = await import(siblingUrl);
        if (isTpkModule(mod)) return mod;
    } catch {
    }
    return null;
}
