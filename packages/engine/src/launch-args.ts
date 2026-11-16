import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { DeviceProfile } from '@tvemu/protocol';

export interface BuildLaunchArgsOptions {
    profile: DeviceProfile;
    userDataDir: string;
    initialUrl?: string;
    headless?: boolean;
    scale?: number;
    allowCrossOrigin?: boolean;
    milestone?: number | null;
}

const STALE_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'];

export async function cleanStaleUserDataLocks(userDataDir: string): Promise<void> {
    await Promise.all(
        STALE_LOCK_FILES.map((fileName) => rm(path.join(userDataDir, fileName), { force: true })),
    );
}

export function buildChromiumLaunchArgs(options: BuildLaunchArgsOptions): string[] {
    const scale = options.scale ?? 1;
    const windowWidth = Math.max(1, Math.round(options.profile.width * scale));
    const windowHeight = Math.max(1, Math.round(options.profile.height * scale));
    const initialUrl = options.initialUrl ?? 'about:blank';

    const args: string[] = [
        `--user-data-dir=${options.userDataDir}`,
        '--remote-debugging-port=0',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate',
        '--autoplay-policy=no-user-gesture-required',
        `--window-size=${windowWidth},${windowHeight}`,
    ];

    if (options.milestone === undefined || options.milestone === null || options.milestone <= 76) {
        args.push('--no-sandbox');
    }

    if (options.allowCrossOrigin) {
        args.push('--disable-web-security');
    }

    if (options.headless) {
        args.push('--headless');
    }

    args.push(`--app=${initialUrl}`);
    return args;
}
