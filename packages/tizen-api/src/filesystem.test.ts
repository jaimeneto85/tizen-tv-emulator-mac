import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { loadApp, nextTick, SAMPLE_MANIFEST, thrownName } from './testing/harness.js';

const STORAGE_KEY = 'tvemu.fs.v1:ABCDEFGHIJ.myapp';

describe('tizen.filesystem', () => {
    it('resolves virtual roots and round-trips file content through streams', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const root = await new Promise<any>((resolve, reject) => fs.resolve('documents', resolve, reject));
        expect(root.isDirectory).toBe(true);
        expect(root.fullPath).toBe('/documents');
        expect(root.toURI()).toBe('file:///documents');

        const file = root.createFile('hello.txt');
        expect(file.isFile).toBe(true);
        expect(file.name).toBe('hello.txt');

        const stream = await new Promise<any>((resolve, reject) => file.openStream('w', resolve, reject));
        stream.write('hello world');
        expect(stream.bytesAvailable).toBe(-1);
        stream.close();
        expect(() => stream.read(1)).toThrow();

        const reopened = await new Promise<any>((resolve, reject) => fs.resolve('documents/hello.txt', resolve, reject));
        const text = await new Promise<string>((resolve, reject) => reopened.readAsText(resolve, reject));
        expect(text).toBe('hello world');
        expect(reopened.fileSize).toBe(11);

        const listing = await new Promise<any[]>((resolve, reject) => root.listFiles(resolve, reject));
        expect(listing.map((entry) => entry.name)).toEqual(['hello.txt']);

        const filtered = await new Promise<any[]>((resolve, reject) => root.listFiles(resolve, reject, { name: 'HEL%.txt' }));
        expect(filtered).toHaveLength(1);
    });

    it('persists the virtual filesystem across a reload through one namespaced localStorage key', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const root = await new Promise<any>((resolve, reject) => fs.resolve('downloads', resolve, reject));
        root.createFile('persistent.txt');
        const snapshot = window.localStorage.getItem(STORAGE_KEY);
        expect(snapshot).toBeTruthy();
        const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
        expect(keys.filter((key) => key && key.indexOf('tvemu.fs.v1:') === 0)).toEqual([STORAGE_KEY]);

        const reloaded = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
        const window2 = reloaded.window as unknown as Record<string, any>;
        window2.__tvemuManifest = SAMPLE_MANIFEST;
        window2.localStorage.setItem(STORAGE_KEY, snapshot as string);
        const here = path.dirname(fileURLToPath(import.meta.url));
        window2.eval(readFileSync(path.resolve(here, '../dist/tizen-api.js'), 'utf8'));
        const tizen2 = window2.tizen as Record<string, any>;
        const file = await new Promise<any>((resolve, reject) => tizen2.filesystem.resolve('downloads/persistent.txt', resolve, reject));
        expect(file.isFile).toBe(true);
    });

    it('enforces read-only wgt-package and r-mode SecurityError', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const packageRoot = await new Promise<any>((resolve, reject) => fs.resolve('wgt-package', resolve, reject));
        expect(packageRoot.isDirectory).toBe(true);
        expect(thrownName(() => packageRoot.createFile('x.txt'))).toBe('SecurityError');

        const root = await new Promise<any>((resolve, reject) => fs.resolve('documents', resolve, reject));
        root.createFile('readonly.txt');
        const readonlyFile = await new Promise<any>((resolve, reject) => fs.resolve('documents/readonly.txt', resolve, reject, 'r'));
        expect(thrownName(() => readonlyFile.createFile('nope.txt'))).toBe('SecurityError');
        const stream = await new Promise<any>((resolve, reject) => readonlyFile.openStream('r', resolve, reject));
        expect(thrownName(() => stream.write('x'))).toBe('SecurityError');
        stream.close();
    });

    it('reports NotFoundError for unknown paths and validates path segments', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const error = await new Promise<any>((resolve) => {
            fs.resolve('documents/missing.txt', () => void 0, resolve);
        });
        expect(error.name).toBe('NotFoundError');
        expect(fs.maxPathLength).toBe(256);
        await new Promise<void>((resolve) => {
            fs.resolve('badroot/file.txt', () => void 0, (err: any) => {
                expect(err.name).toBe('NotFoundError');
                resolve();
            });
        });
    });

    it('supports directory deletion rules and copy/move', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const root = await new Promise<any>((resolve, reject) => fs.resolve('wgt-private', resolve, reject));
        const sub = root.createDirectory('sub');
        sub.createFile('inner.txt');
        await new Promise<void>((resolve) => {
            root.deleteDirectory('sub', false, () => void 0, (err: any) => {
                expect(err.name).toBe('IOError');
                resolve();
            });
        });
        await new Promise<void>((resolve) => root.deleteDirectory('sub', true, resolve));
        root.createFile('a.txt');
        await new Promise<void>((resolve) => root.copyTo('a.txt', 'b.txt', false, resolve));
        const copied = await new Promise<any>((resolve, reject) => fs.resolve('wgt-private/b.txt', resolve, reject));
        expect(copied.isFile).toBe(true);
        await new Promise<void>((resolve) => root.moveTo('b.txt', 'c.txt', false, resolve));
        expect(root.resolve('b.txt')).toBe(null);
        expect((root.resolve('c.txt') as any).name).toBe('c.txt');
    });

    it('validates openStream modes and encodings', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const root = await new Promise<any>((resolve, reject) => fs.resolve('documents', resolve, reject));
        const file = root.createFile('modes.txt');
        await new Promise<void>((resolve) => {
            file.openStream('x', () => void 0, (err: any) => {
                expect(err.name).toBe('InvalidValuesError');
                resolve();
            });
        });
        await new Promise<void>((resolve) => {
            file.openStream('r', () => void 0, (err: any) => {
                expect(err.name).toBe('InvalidValuesError');
                resolve();
            }, 'UTF-16');
        });
    });

    it('lists storages and rejects unknown storage labels', async () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        const fs = tizen.filesystem;
        const storages = await new Promise<any[]>((resolve) => fs.listStorages(resolve));
        expect(storages.map((entry) => entry.label)).toEqual(['InternalFlash', 'MMC']);
        const storage = await new Promise<any>((resolve) => fs.getStorage('InternalFlash', resolve));
        expect(storage.state).toBe('MOUNTED');
        await new Promise<void>((resolve) => {
            fs.getStorage('nope', () => void 0, (err: any) => {
                expect(err.name).toBe('NotFoundError');
                resolve();
            });
        });
    });
});
