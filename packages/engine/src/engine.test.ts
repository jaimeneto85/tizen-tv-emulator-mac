import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_PROFILES,
    ENGINE_REGISTRY,
    buildChromiumLaunchArgs,
    cleanStaleUserDataLocks,
    downloadEngine,
    parseDevToolsAnnouncement,
    resolveEngine,
    type EngineRegistryEntry,
} from './index.js';

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        const crc = crc32(entry.content);
        const size = entry.content.length;

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(size, 18);
        localHeader.writeUInt32LE(size, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, nameBuf, entry.content);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(size, 20);
        centralHeader.writeUInt32LE(size, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);

        centralParts.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + entry.content.length;
    }

    const centralDir = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDir, eocd]);
}

async function createFakeAppBundle(
    parentDir: string,
    appName: string,
    executableName: string,
    version: string,
): Promise<string> {
    const contentsDir = path.join(parentDir, appName, 'Contents');
    const macOsDir = path.join(contentsDir, 'MacOS');
    await mkdir(macOsDir, { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>${executableName}</string>
    <key>CFBundleShortVersionString</key>
    <string>${version}</string>
</dict>
</plist>`;
    await writeFile(path.join(contentsDir, 'Info.plist'), plist, 'utf8');
    const executablePath = path.join(macOsDir, executableName);
    await writeFile(executablePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    return executablePath;
}

describe('registry and profiles', () => {
    it('contains pinned entries for all seven Tizen TV milestones', () => {
        const milestones = ENGINE_REGISTRY.map((entry) => entry.milestone);
        expect(milestones).toEqual([69, 76, 85, 94, 108, 120, 130]);
        const m69 = ENGINE_REGISTRY.find((entry) => entry.milestone === 69);
        expect(m69?.verified).toBe(true);
        expect(m69?.platform).toBe('mac-x64');
        expect(m69?.sha256).toBe('19fe5c201dfbee45168bfdfe9829c82000728c38e0eda128c232b1973cbfc2a9');
        const m94 = ENGINE_REGISTRY.find((entry) => entry.milestone === 94);
        expect(m94?.platform).toBe('mac-arm64');
        expect(m94?.verified).toBe(false);
        expect(m94?.sha256).toBeNull();
        const m130 = ENGINE_REGISTRY.find((entry) => entry.milestone === 130);
        expect(m130?.platform).toBe('mac-arm64');
        expect(m130?.tizenVersion).toBe('10.0');
        expect(m130?.modelYear).toBe(2026);
        expect(m130?.revision).toBe(1356025);
        expect(m130?.verified).toBe(true);
        expect(m130?.sha256).toBe('13e6e030825c21161fcb83de3800480271e04352bd5df86ee2bee0a942eee52b');
    });

    it('provides Smart TV default profiles for 2020-2026 with Emulator identity and no Chrome/ UA token', () => {
        expect(DEFAULT_PROFILES).toHaveLength(7);
        const p2020 = DEFAULT_PROFILES[0];
        expect(p2020?.tizenVersion).toBe('5.5');
        expect(p2020?.chromiumMilestone).toBe(69);
        expect(p2020?.width).toBe(1920);
        expect(p2020?.height).toBe(1080);
        expect(p2020?.cpuThrottle).toBe(1);
        expect(p2020?.model).toBe('Emulator');
        expect(p2020?.modelCode).toMatch(/^E-EMUL/);
        expect(p2020?.firmware).toMatch(/^E-EMUL\d+WWC-/);
        expect(p2020?.duid).toMatch(/^[A-Z2-7]{12}$/);
        expect(p2020?.locale).toBe('en_US');
        expect(p2020?.userAgent).toContain('SMART-TV; LINUX; Tizen 5.5');
        expect(p2020?.userAgent).toContain('69.0.3497.106/5.5 TV Safari/537.36');

        const p2026 = DEFAULT_PROFILES[6];
        expect(p2026?.name).toBe('tizen-10.0');
        expect(p2026?.modelYear).toBe(2026);
        expect(p2026?.tizenVersion).toBe('10.0');
        expect(p2026?.chromiumMilestone).toBe(130);
        expect(p2026?.userAgent).toBe(
            'Mozilla/5.0 (SMART-TV; LINUX; Tizen 10.0) AppleWebKit/537.36 (KHTML, like Gecko) 130.0.6723.116/10.0 TV Safari/537.36',
        );

        for (const profile of DEFAULT_PROFILES) {
            expect(profile.userAgent).not.toContain('Chrome/');
            expect(profile.model).toBe('Emulator');
            expect(profile.locale).toBe('en_US');
            expect(profile.duid).toMatch(/^[A-Z2-7]{12}$/);
        }
    });
});

describe('launch arguments and lock cleanup', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('builds Chromium 69 safe launch flags without --screen-info', () => {
        const profile = DEFAULT_PROFILES[0]!;
        const args = buildChromiumLaunchArgs({
            profile,
            userDataDir: '/tmp/tvemu-prof',
            initialUrl: 'http://127.0.0.1:3000/',
            headless: true,
            scale: 0.5,
            allowCrossOrigin: true,
            milestone: 69,
        });
        expect(args).toContain('--user-data-dir=/tmp/tvemu-prof');
        expect(args).toContain('--remote-debugging-port=0');
        expect(args).toContain('--force-color-profile=srgb');
        expect(args).toContain('--no-sandbox');
        expect(args).toContain('--disable-web-security');
        expect(args).toContain('--headless');
        expect(args).toContain('--window-size=960,540');
        expect(args).toContain('--app=http://127.0.0.1:3000/');
        expect(args).not.toContain('--screen-info');
    });

    it('omits --disable-web-security when allowCrossOrigin is false', () => {
        const profile = DEFAULT_PROFILES[5]!;
        const args = buildChromiumLaunchArgs({
            profile,
            userDataDir: '/tmp/tvemu-prof',
            milestone: 120,
        });
        expect(args).not.toContain('--disable-web-security');
        expect(args).not.toContain('--no-sandbox');
        expect(args).not.toContain('--headless');
    });

    it('cleans stale Chromium singleton lock files', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'tvemu-locks-'));
        tempDirs.push(dir);
        await writeFile(path.join(dir, 'SingletonLock'), '123');
        await writeFile(path.join(dir, 'SingletonCookie'), 'abc');
        await writeFile(path.join(dir, 'SingletonSocket'), 'sock');
        await writeFile(path.join(dir, 'DevToolsActivePort'), '9999');

        await cleanStaleUserDataLocks(dir);

        await expect(readFile(path.join(dir, 'SingletonLock'))).rejects.toThrow();
        await expect(readFile(path.join(dir, 'SingletonCookie'))).rejects.toThrow();
        await expect(readFile(path.join(dir, 'SingletonSocket'))).rejects.toThrow();
        await expect(readFile(path.join(dir, 'DevToolsActivePort'))).rejects.toThrow();
    });
});

describe('resolveEngine', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('follows env -> downloaded -> search-path -> playwright-cache priority order', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-resolve-'));
        tempDirs.push(root);

        const homeDir = path.join(root, 'home');
        const searchDir = path.join(root, 'search');
        const pwDir = path.join(root, 'pw');

        const pwExec = await createFakeAppBundle(
            path.join(pwDir, 'chromium-1243', 'chrome-mac-arm64'),
            'Google Chrome for Testing.app',
            'Google Chrome for Testing',
            '153.0.8010.12',
        );
        const searchExec = await createFakeAppBundle(
            searchDir,
            'Chromium.app',
            'Chromium',
            '69.0.3497.0',
        );
        await createFakeAppBundle(
            searchDir,
            'Other.app',
            'Other',
            '76.0.3809.0',
        );

        const fromPw = await resolveEngine(69, {
            home: homeDir,
            env: {},
            playwrightCacheDir: pwDir,
        });
        expect(fromPw).toEqual({
            executablePath: pwExec,
            source: 'playwright-cache',
            version: '153.0.8010.12',
            exact: false,
        });

        await expect(
            resolveEngine(69, {
                home: homeDir,
                env: {},
                playwrightCacheDir: pwDir,
                strict: true,
            }),
        ).rejects.toThrow(/Exact Chromium M69 required/);

        const pwExactExec = await createFakeAppBundle(
            path.join(pwDir, 'chromium-1200', 'chrome-mac-arm64'),
            'Google Chrome for Testing.app',
            'Google Chrome for Testing',
            '130.0.6723.116',
        );
        const fromPwExact = await resolveEngine(130, {
            home: homeDir,
            env: {},
            playwrightCacheDir: pwDir,
            strict: true,
        });
        expect(fromPwExact).toEqual({
            executablePath: pwExactExec,
            source: 'playwright-cache',
            version: '130.0.6723.116',
            exact: true,
        });

        const fromSearch = await resolveEngine(69, {
            home: homeDir,
            env: { TVEMU_ENGINE_SEARCH_PATHS: searchDir },
            playwrightCacheDir: pwDir,
        });
        expect(fromSearch).toEqual({
            executablePath: searchExec,
            source: 'search-path',
            version: '69.0.3497.0',
            exact: true,
        });

        const downloadedExec = await createFakeAppBundle(
            path.join(homeDir, 'engines', '69', 'chrome-mac'),
            'Chromium.app',
            'Chromium',
            '69.0.3497.0',
        );
        const fromDownloaded = await resolveEngine(69, {
            home: homeDir,
            env: { TVEMU_ENGINE_SEARCH_PATHS: searchDir },
            playwrightCacheDir: pwDir,
        });
        expect(fromDownloaded).toEqual({
            executablePath: downloadedExec,
            source: 'downloaded',
            version: '69.0.3497.0',
            exact: true,
        });

        const envExec = await createFakeAppBundle(
            path.join(root, 'explicit'),
            'Chromium.app',
            'Chromium',
            '69.0.3497.99',
        );
        const fromEnv = await resolveEngine(69, {
            home: homeDir,
            env: {
                TVEMU_CHROMIUM_69: envExec,
                TVEMU_ENGINE_SEARCH_PATHS: searchDir,
            },
            playwrightCacheDir: pwDir,
        });
        expect(fromEnv).toEqual({
            executablePath: envExec,
            source: 'env',
            version: '69.0.3497.99',
            exact: true,
        });
    });
});

describe('downloadEngine', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                await rm(dir, { recursive: true, force: true });
            }
        }
    });

    it('downloads a zip from HTTP, verifies sha256, reports progress, and extracts it', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tvemu-dl-'));
        tempDirs.push(root);

        const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Chromium</string>
<key>CFBundleShortVersionString</key><string>69.0.3497.0</string>
</dict></plist>`;
        const zipBuffer = createStoredZip([
            {
                name: 'chrome-mac/Chromium.app/Contents/Info.plist',
                content: Buffer.from(plistXml, 'utf8'),
            },
            {
                name: 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
                content: Buffer.from('#!/bin/sh\nexit 0\n', 'utf8'),
            },
        ]);
        const sha256 = createHash('sha256').update(zipBuffer).digest('hex');

        const server = createServer((_req, res) => {
            res.writeHead(200, {
                'content-type': 'application/zip',
                'content-length': String(zipBuffer.length),
            });
            res.end(zipBuffer);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Unexpected server address');
        }
        const url = `http://127.0.0.1:${address.port}/chrome-mac.zip`;

        try {
            const registry: EngineRegistryEntry[] = [
                {
                    milestone: 69,
                    tizenVersion: '5.5',
                    modelYear: 2020,
                    platform: 'mac-x64',
                    url,
                    sha256,
                    revision: 576753,
                    verified: true,
                },
            ];

            const progressUpdates: number[] = [];
            const result = await downloadEngine(69, {
                home: root,
                registry,
                onProgress: (progress) => progressUpdates.push(progress.receivedBytes),
            });

            expect(result.sha256).toBe(sha256);
            expect(result.version).toBe('69.0.3497.0');
            expect(result.executablePath).toBe(
                path.join(root, 'engines', '69', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
            );
            expect(progressUpdates.at(-1)).toBe(zipBuffer.length);

            const badRegistry: EngineRegistryEntry[] = [
                { ...registry[0]!, sha256: '0'.repeat(64) },
            ];
            await expect(
                downloadEngine(69, { home: path.join(root, 'bad'), registry: badRegistry }),
            ).rejects.toThrow(/SHA-256 mismatch/);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});

describe('parseDevToolsAnnouncement', () => {
    it('reads the port and browser path from the stderr line', () => {
        expect(
            parseDevToolsAnnouncement('DevTools listening on ws://127.0.0.1:49593/devtools/browser/771c4404'),
        ).toEqual({ port: 49593, browserPath: '/devtools/browser/771c4404' });
    });

    it('ignores unrelated lines', () => {
        expect(parseDevToolsAnnouncement('Error writing DevTools active port to file')).toBeNull();
    });
});
