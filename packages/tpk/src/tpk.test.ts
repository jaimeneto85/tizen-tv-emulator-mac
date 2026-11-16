import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, Zip, ZipPassThrough, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
    extractTpk,
    isDotnetApp,
    isTpk,
    mainUiApp,
    parseTizenManifest,
    readTpkManifest,
    TpkError,
} from './index.js';

const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest package="SampleTV" version="1.0.0" api-version="8" xmlns="http://tizen.org/ns/packages">
    <profile name="tv"/>
    <label>Sample</label>
    <privileges>
        <privilege>http://tizen.org/privilege/internet</privilege>
        <privilege>http://tizen.org/privilege/network.get</privilege>
    </privileges>
    <ui-application appid="SampleTV.Sample" exec="Sample.Tv.dll" multiple="false" nodisplay="false"
        taskmanage="true" type="dotnet-nui" launch_mode="single">
        <label>Sample</label>
        <label xml:lang="pt-br">Sample Brasil</label>
        <icon>Sample.png</icon>
        <metadata key="author" value="Sample"/>
        <metadata key="scheme" value="sample"/>
    </ui-application>
    <service-application appid="SampleTV.Sync" exec="Sync.dll" type="dotnet" nodisplay="true">
        <label>Sync</label>
    </service-application>
</manifest>`;

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'tvemu-tpk-'));
    temporaryDirectories.push(directory);
    return directory;
}

async function fixture(directory: string, files: Record<string, string>, name = 'app.tpk'): Promise<string> {
    const path = join(directory, name);
    await writeFile(path, zipSync(Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)]))));
    return path;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('tizen-manifest.xml', () => {
    it('maps a production-style manifest with apps, labels, metadata and privileges', () => {
        const parsed = parseTizenManifest(manifest);
        expect(parsed).toEqual({
            packageId: 'SampleTV',
            version: '1.0.0',
            apiVersion: '8',
            profiles: ['tv'],
            label: 'Sample',
            privileges: ['http://tizen.org/privilege/internet', 'http://tizen.org/privilege/network.get'],
            apps: [
                {
                    appId: 'SampleTV.Sample', exec: 'Sample.Tv.dll', type: 'dotnet-nui', kind: 'ui',
                    label: 'Sample', labels: { '': 'Sample', 'pt-br': 'Sample Brasil' },
                    icon: 'Sample.png', metadata: { author: 'Sample', scheme: 'sample' },
                    nodisplay: false, launchMode: 'single',
                },
                {
                    appId: 'SampleTV.Sync', exec: 'Sync.dll', type: 'dotnet', kind: 'service',
                    label: 'Sync', labels: { '': 'Sync' }, icon: null, metadata: {},
                    nodisplay: true, launchMode: null,
                },
            ],
        });
    });

    it.each([
        ['widget-application', 'widget'],
        ['watch-application', 'watch'],
        ['component-based-application', 'component'],
    ] as const)('classifies %s as kind %s', (element, kind) => {
        const xml = manifest
            .replace(/<ui-application[\s\S]*?<\/ui-application>/, `<${element} appid="SampleTV.X" exec="x.dll" type="dotnet"/>`)
            .replace(/<service-application[\s\S]*?<\/service-application>/, '');
        expect(parseTizenManifest(xml).apps).toEqual([expect.objectContaining({ appId: 'SampleTV.X', kind })]);
    });

    it('tolerates unknown elements and attributes', () => {
        const xml = manifest
            .replace('<profile name="tv"/>', '<profile name="tv"/><unknown-element foo="bar">text</unknown-element>')
            .replace('type="dotnet-nui"', 'type="dotnet-nui" extra="1"')
            .replace('</ui-application>', '<strange-child a="b"/></ui-application>');
        const parsed = parseTizenManifest(xml);
        expect(parsed.apps[0]).toMatchObject({ appId: 'SampleTV.Sample', type: 'dotnet-nui' });
        expect(parsed.profiles).toEqual(['tv']);
    });

    it('defaults absent optional fields', () => {
        const xml = `<manifest package="Demo" xmlns="http://tizen.org/ns/packages">
            <ui-application appid="Demo.App"/></manifest>`;
        expect(parseTizenManifest(xml)).toEqual({
            packageId: 'Demo', version: '', apiVersion: '', profiles: [], label: '',
            privileges: [],
            apps: [{
                appId: 'Demo.App', exec: '', type: '', kind: 'ui', label: '', labels: {}, icon: null,
                metadata: {}, nodisplay: false, launchMode: null,
            }],
        });
    });

    it.each([
        manifest.replace('package="SampleTV"', ''),
        manifest.replace('package="SampleTV"', 'package=""'),
        manifest.replace(/<ui-application[\s\S]*?<\/service-application>/, ''),
        manifest.replace('http://tizen.org/ns/packages', 'https://impostor.invalid'),
        manifest.replace('</manifest>', '</broken>'),
        '<!DOCTYPE manifest>' + manifest,
        'not xml at all',
    ])('rejects invalid manifests', (xml) => {
        expect(() => parseTizenManifest(xml)).toThrowError(TpkError);
        try {
            parseTizenManifest(xml);
        } catch (error) {
            expect(error).toMatchObject({ code: 'INVALID_MANIFEST' });
        }
    });
});

describe('app selection', () => {
    it('detects dotnet app types case-insensitively', () => {
        const parsed = parseTizenManifest(manifest);
        expect(isDotnetApp(parsed.apps[0]!)).toBe(true);
        expect(isDotnetApp({ ...parsed.apps[0]!, type: 'DOTNET-INHOUSE' })).toBe(true);
        expect(isDotnetApp({ ...parsed.apps[0]!, type: 'capp' })).toBe(false);
        expect(isDotnetApp({ ...parsed.apps[0]!, type: 'c++app' })).toBe(false);
    });

    it('returns the first ui app', () => {
        const parsed = parseTizenManifest(manifest);
        expect(mainUiApp(parsed).appId).toBe('SampleTV.Sample');
    });

    it('throws NO_UI_APP when the package has no ui-application', () => {
        const xml = manifest.replace(/<ui-application[\s\S]*?<\/ui-application>/, '');
        expect(() => mainUiApp(parseTizenManifest(xml))).toThrowError(
            expect.objectContaining({ code: 'NO_UI_APP' }),
        );
    });

    it('throws NOT_DOTNET with an explanatory message for native apps', () => {
        const xml = manifest.replace('type="dotnet-nui"', 'type="capp"').replace(/<service-application[\s\S]*?<\/service-application>/, '');
        try {
            mainUiApp(parseTizenManifest(xml));
            expect.unreachable();
        } catch (error) {
            expect(error).toMatchObject({ code: 'NOT_DOTNET' });
            expect((error as TpkError).message).toMatch(/native.*Tizen OS.*not supported/s);
        }
    });
});

describe('tpk archives', () => {
    it('isTpk decides by content, not extension', async () => {
        const directory = await temporaryDirectory();
        const tpk = await fixture(directory, { 'tizen-manifest.xml': manifest }, 'package.bin');
        expect(await isTpk(tpk)).toBe(true);
        const other = await fixture(directory, { 'config.xml': '<widget/>' }, 'other.tpk');
        expect(await isTpk(other)).toBe(false);
        const plain = join(directory, 'plain.tpk');
        await writeFile(plain, 'not a zip');
        expect(await isTpk(plain)).toBe(false);
    });

    it('reads the manifest and signature flags', async () => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, {
            'tizen-manifest.xml': manifest,
            'author-signature.xml': 'author',
            'bin/Sample.Tv.dll': 'dll',
            'shared/res/': '',
        });
        const parsed = await readTpkManifest(path);
        expect(parsed).toEqual({ ...parseTizenManifest(manifest), signed: { author: true, distributor: false } });
        const signed = await fixture(directory, { 'tizen-manifest.xml': manifest, 'signature1.xml': 'dist' }, 'signed.tpk');
        expect((await readTpkManifest(signed)).signed).toEqual({ author: false, distributor: true });
    });

    it('classifies archives without a root manifest and duplicate manifests', async () => {
        const directory = await temporaryDirectory();
        const nested = await fixture(directory, { 'nested/tizen-manifest.xml': manifest });
        await expect(readTpkManifest(nested)).rejects.toMatchObject({ code: 'NOT_A_TPK' });
        const duplicate = join(directory, 'dup.tpk');
        const chunks: Buffer[] = [];
        const zip = new Zip((error, chunk) => {
            if (error) throw error;
            chunks.push(Buffer.from(chunk));
        });
        for (let index = 0; index < 2; index++) {
            const entry = new ZipPassThrough('tizen-manifest.xml');
            zip.add(entry);
            entry.push(strToU8(manifest), true);
        }
        zip.end();
        await writeFile(duplicate, Buffer.concat(chunks));
        await expect(readTpkManifest(duplicate)).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
    });

    it('extracts the tree as-is and returns the manifest', async () => {
        const directory = await temporaryDirectory();
        const destination = join(directory, 'out');
        const path = await fixture(directory, {
            'tizen-manifest.xml': manifest,
            'author-signature.xml': 'author',
            'bin/Sample.Tv.dll': 'dll-bytes',
            'shared/res/image.png': 'png-bytes',
        });
        const parsed = await extractTpk(path, destination);
        expect(parsed).toEqual({ ...parseTizenManifest(manifest), signed: { author: true, distributor: false } });
        expect(await readFile(join(destination, 'bin/Sample.Tv.dll'), 'utf8')).toBe('dll-bytes');
        expect(await readFile(join(destination, 'shared/res/image.png'), 'utf8')).toBe('png-bytes');
    });

    it.each(['../escape', '/absolute', 'C:/escape', 'nested/../../escape', 'nested\\escape'])('rejects unsafe entry %s', async (name) => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, { 'tizen-manifest.xml': manifest, [name]: 'bad' });
        await expect(extractTpk(path, join(directory, 'out'))).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
    });

    it('rejects archive symlinks', async () => {
        const directory = await temporaryDirectory();
        const path = join(directory, 'symlink.tpk');
        const data = zipSync({
            'tizen-manifest.xml': strToU8(manifest),
            link: [strToU8('../outside'), { os: 3, attrs: 0xa1ff0000 }],
        });
        await writeFile(path, data);
        await expect(extractTpk(path, join(directory, 'out'))).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
    });
});

const realPackagePaths = (process.env.TVEMU_TEST_TPKS ?? '').split(':').filter((path) => path.length > 0 && existsSync(path));

describe('real packages from TVEMU_TEST_TPKS', () => {
    it.skipIf(realPackagePaths.length === 0)('parses every listed dotnet tpk', async () => {
        for (const path of realPackagePaths) {
            expect(await isTpk(path)).toBe(true);
            const parsed = await readTpkManifest(path);
            expect(parsed.packageId.length).toBeGreaterThan(0);
            const app = mainUiApp(parsed);
            expect(app.kind).toBe('ui');
            expect(isDotnetApp(app)).toBe(true);
        }
    });
});

describe('launchable application checks', () => {
    const withExec = (exec: string): TpkManifest => ({
        ...parseTizenManifest(manifest.replace('exec="Sample.Tv.dll"', `exec="${exec}"`)),
        signed: { author: false, distributor: false },
    });

    it.each(['../../outside.dll', '/etc/hosts', '', 'sub/../x.dll', 'C:/x.dll'])('rejects exec %j', (exec) => {
        expect(() => mainUiApp(withExec(exec))).toThrowError(expect.objectContaining({ code: 'INVALID_MANIFEST' }));
    });

    it('rejects an empty appid', () => {
        const parsed = { ...parseTizenManifest(manifest.replace('appid="SampleTV.Sample"', 'appid=""')), signed: { author: false, distributor: false } };
        expect(() => mainUiApp(parsed)).toThrowError(expect.objectContaining({ code: 'INVALID_MANIFEST' }));
    });

    it('accepts a nested exec inside bin', () => {
        expect(mainUiApp(withExec('net/App.dll')).exec).toBe('net/App.dll');
    });

    it('reports case-colliding entries as unsafe instead of not-a-tpk', async () => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, { 'tizen-manifest.xml': manifest, 'bin/Foo.dll': 'a', 'bin/foo.dll': 'b' });
        await expect(extractTpk(path, join(directory, 'out'))).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
    });

    it('rejects an oversized manifest', async () => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, { 'tizen-manifest.xml': manifest + ' '.repeat(5 * 1024 * 1024) });
        await expect(readTpkManifest(path)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    });

    it('decodes numeric character references and ignores DOCTYPE inside comments', () => {
        const xml = manifest.replace('<label>Sample</label>', '<!-- <!DOCTYPE x> --><label>A &#38; B</label>');
        expect(parseTizenManifest(xml).label).toBe('A & B');
    });
});
