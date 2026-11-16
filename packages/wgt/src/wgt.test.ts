import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppStore, inspectWgt, parseConfigXml, readWgtManifest, validateManifest, WgtError } from './index.js';

const config = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
    id="http://example.com/Demo.Example" version="1.0.3" viewmodes="maximized">
    <tizen:application id="Demo.Example" package="Demo" required_version="5.5"/>
    <access origin="*" subdomains="true"/>
    <tizen:content-security-policy>default-src * data: blob: 'unsafe-inline' 'unsafe-eval'</tizen:content-security-policy>
    <tizen:allow-navigation>*</tizen:allow-navigation>
    <content src="index.html"/>
    <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
    <icon src="icon.png"/>
    <name>Demo</name>
    <tizen:profile name="tv"/>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable"
        encryption="disable" install-location="auto" hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
</widget>`;

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'tvemu-wgt-'));
    temporaryDirectories.push(directory);
    return directory;
}

async function fixture(directory: string, files: Record<string, string>, name = 'app.wgt'): Promise<string> {
    const path = join(directory, name);
    await writeFile(path, zipSync(Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)]))));
    return path;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('config.xml', () => {
    it('maps the production Samsung config including short package ids', () => {
        const manifest = parseConfigXml(config);
        expect(manifest).toEqual({
            widgetId: 'http://example.com/Demo.Example',
            appId: 'Demo.Example', packageId: 'Demo', name: 'Demo', version: '1.0.3', requiredVersion: '5.5',
            contentSrc: 'index.html', icon: 'icon.png',
            privileges: [{ name: 'http://tizen.org/privilege/internet' }],
            features: ['http://tizen.org/feature/screen.size.normal.1080.1920'],
            contentSecurityPolicy: "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
            accessOrigins: ['*'], profile: 'tv',
            settings: {
                'screen-orientation': 'landscape', 'context-menu': 'disable', 'background-support': 'disable',
                encryption: 'disable', 'install-location': 'auto', 'hwkey-event': 'enable',
            },
        });
        expect(validateManifest(manifest)).toEqual({ warnings: [] });
    });

    it('preserves unicode names, entities, CDATA and hosted URLs', () => {
        const xml = config.replace('<name>Demo</name>', '<name><![CDATA[日本語 📺]]> &amp; café</name>')
            .replace('src="index.html"', 'src="https://example.com/app?x=1&amp;y=2"');
        expect(parseConfigXml(xml)).toMatchObject({ name: '日本語 📺 & café', contentSrc: 'https://example.com/app?x=1&y=2' });
    });

    it('resolves namespace aliases and default Tizen namespace', () => {
        const xml = config.replaceAll('tizen:', 'tv:').replace('xmlns:tizen=', 'xmlns:tv=');
        expect(parseConfigXml(xml).appId).toBe('Demo.Example');
        const defaultNamespace = config.replace('<tizen:application', '<application xmlns="http://tizen.org/ns/widgets"');
        expect(parseConfigXml(defaultNamespace).appId).toBe('Demo.Example');
    });

    it.each([
        config.replace(/<tizen:application[^>]*\/>/, ''),
        config.replace('package="Demo"', 'package=""'),
        config.replace('http://tizen.org/ns/widgets', 'https://impostor.invalid'),
        config.replace('<tizen:application', '<tizen:application xmlns:tizen="wrong"'),
        config.replace('</widget>', '</broken>'),
    ])('rejects missing identity or invalid XML namespaces', (xml) => {
        expect(() => parseConfigXml(xml)).toThrowError(WgtError);
        try { parseConfigXml(xml); } catch (error) { expect(error).toMatchObject({ code: 'INVALID_CONFIG' }); }
    });

    it('uses first localized labels and collects repeated declarations', () => {
        const xml = config.replace('<name>Demo</name>', '<name>First</name><name>Second</name>')
            .replace('</widget>', `<feature name="extra"/><feature/>
                <access origin="https://example.com"/><access/>
                <tizen:privilege name="extra"/><tizen:privilege/></widget>`);
        const manifest = parseConfigXml(xml);
        expect(manifest.name).toBe('First');
        expect(manifest.features).toEqual(['http://tizen.org/feature/screen.size.normal.1080.1920', 'extra']);
        expect(manifest.accessOrigins).toEqual(['*', 'https://example.com']);
        expect(manifest.privileges).toEqual([{ name: 'http://tizen.org/privilege/internet' }, { name: 'extra' }]);
    });

    it('supplies all absent optional fields', () => {
        const xml = `<widget xmlns="http://www.w3.org/ns/widgets" xmlns:t="http://tizen.org/ns/widgets">
            <t:application id="0123456789.App" package="0123456789"/></widget>`;
        expect(parseConfigXml(xml)).toEqual({
            widgetId: '', version: '', appId: '0123456789.App', packageId: '0123456789', requiredVersion: '',
            name: '0123456789.App', contentSrc: 'index.html', icon: null, privileges: [], features: [],
            contentSecurityPolicy: null, accessOrigins: [], settings: {}, profile: null,
        });
        expect(validateManifest(parseConfigXml(xml))).toEqual({ warnings: [] });
    });

    it.each([
        config.replace('xmlns:tizen="http://tizen.org/ns/widgets"', ''),
        config.replace('http://www.w3.org/ns/widgets', 'wrong'),
        '<!DOCTYPE widget>' + config,
        config.replace('id="Demo.Example"', 'id=""'),
    ])('rejects unsupported or incomplete config', (xml) => {
        expect(() => parseConfigXml(xml)).toThrowError(WgtError);
    });

    it('defaults optional content/name and warns without throwing on unusual identity', () => {
        const xml = config.replace('<name>Demo</name>', '').replace('<content src="index.html"/>', '')
            .replace('package="Demo"', 'package="Demo_Test"');
        expect(parseConfigXml(xml)).toMatchObject({ name: 'Demo.Example', contentSrc: 'index.html' });
        expect(validateManifest(parseConfigXml(xml)).warnings).toHaveLength(2);
    });
});

describe('WGT archives and store', () => {
    it('reads and inspects a compressed archive with signatures and directory entries', async () => {
        const directory = await temporaryDirectory();
        const files = { 'config.xml': config, 'author-signature.xml': 'author', 'signature1.xml': 'distributor', 'empty/': '' };
        const path = await fixture(directory, files);
        expect(await readWgtManifest(path)).toEqual(parseConfigXml(config));
        expect(await inspectWgt(path)).toEqual({
            hasAuthorSignature: true, hasDistributorSignature: true, fileCount: 3,
            totalUncompressedSize: Buffer.byteLength(config) + 17,
        });
    });

    it.each(['../escape', '/absolute', 'C:/escape', 'nested/../../escape', 'nested\\escape'])('rejects unsafe entry %s', async (name) => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, { 'config.xml': config, [name]: 'bad' });
        await expect(createAppStore(directory).install(path)).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
    });

    it('rejects archive symlinks', async () => {
        const directory = await temporaryDirectory();
        const path = join(directory, 'symlink.wgt');
        const data = zipSync({ 'config.xml': strToU8(config), link: [strToU8('../outside'), { os: 3, attrs: 0xa1ff0000 }] });
        await writeFile(path, data);
        await expect(createAppStore(directory).install(path)).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
    });

    it('reinstalls without stale content and persists metadata across store instances', async () => {
        const directory = await temporaryDirectory();
        const store = createAppStore(directory);
        const first = await fixture(directory, { 'config.xml': config, 'old.txt': 'old', 'index.html': 'v1' });
        const app = await store.install(first);
        expect(store.contentDir(app)).toBe(join(directory, 'apps', 'Demo', 'content'));
        const second = await fixture(directory, { 'config.xml': config, 'index.html': 'v2' }, 'second.wgt');
        const replacement = await store.install(second);
        await expect(readFile(join(store.contentDir(replacement), 'old.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await readFile(join(store.contentDir(replacement), 'index.html'), 'utf8')).toBe('v2');
        const reopened = createAppStore(directory);
        expect(await reopened.list()).toEqual([replacement]);
        expect(await reopened.findByAppId('Demo.Example')).toEqual(replacement);
        expect(await reopened.findByPackageId('Demo')).toEqual(replacement);
        expect(await reopened.findByAppId('missing')).toBeNull();
        await reopened.uninstall('Demo');
        expect(await store.list()).toEqual([]);
        await expect(store.uninstall('Demo')).rejects.toMatchObject({ code: 'NOT_INSTALLED' });
    });

    it('preserves the old installation on failed extraction and recovers its queue', async () => {
        const directory = await temporaryDirectory();
        const store = createAppStore(directory);
        const first = await fixture(directory, { 'config.xml': config, 'index.html': 'original' });
        const app = await store.install(first);
        const bad = await fixture(directory, { 'config.xml': config, parent: 'file', 'parent/child': 'conflict' }, 'bad.wgt');
        await expect(store.install(bad)).rejects.toBeInstanceOf(WgtError);
        expect(await readFile(join(store.contentDir(app), 'index.html'), 'utf8')).toBe('original');
        expect(await store.findByPackageId('Demo')).toEqual(app);
    });

    it('serializes writes and reads across independent stores using the same home', async () => {
        const directory = await temporaryDirectory();
        const first = createAppStore(directory);
        const second = createAppStore(join(directory, '.'));
        const path = await fixture(directory, { 'config.xml': config, 'index.html': 'queued' });
        const install = first.install(path);
        const listing = second.list();
        const uninstall = second.uninstall('Demo');
        const finalListing = first.list();
        const app = await install;
        expect(await listing).toEqual([app]);
        await uninstall;
        expect(await finalListing).toEqual([]);
    });

    it.each(['../outside', '.hidden', 'C:drive', 'nested/path', 'nested\\path'])('rejects unsafe package id %s', async (id) => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, { 'config.xml': config.replace('package="Demo"', `package="${id}"`) });
        const store = createAppStore(directory);
        await expect(store.install(path)).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
        await expect(store.findByPackageId(id)).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
        await expect(store.uninstall(id)).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
        expect(await store.list()).toEqual([]);
    });

    it.each(['apps', 'package'])('rejects preexisting symlink at %s without writing outside', async (location) => {
        const directory = await temporaryDirectory();
        const outside = await temporaryDirectory();
        const apps = join(directory, 'apps');
        if (location === 'package') await mkdir(apps);
        await symlink(outside, location === 'apps' ? apps : join(apps, 'Demo'));
        const path = await fixture(directory, { 'config.xml': config });
        await expect(createAppStore(directory).install(path)).rejects.toMatchObject({ code: 'UNSAFE_ENTRY' });
        await expect(readFile(join(outside, 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects corrupted persisted metadata and ignores internal staging directories', async () => {
        const directory = await temporaryDirectory();
        const store = createAppStore(directory);
        const path = await fixture(directory, { 'config.xml': config, 'empty/': '', 'nested/file.txt': 'nested' });
        const app = await store.install(path);
        expect(await readFile(join(store.contentDir(app), 'nested/file.txt'), 'utf8')).toBe('nested');
        await mkdir(join(directory, 'apps', '.install-unused'));
        expect(await store.list()).toEqual([app]);
        await writeFile(join(app.installDir, 'manifest.json'), '{broken');
        await expect(store.findByPackageId('Demo')).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
        await writeFile(join(app.installDir, 'manifest.json'), JSON.stringify({ ...app, installedAt: 'invalid' }));
        await expect(store.findByPackageId('Demo')).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
        await writeFile(join(app.installDir, 'manifest.json'), JSON.stringify({ ...app, manifest: {} }));
        await expect(store.findByPackageId('Demo')).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    });

    it('classifies corrupt archives and archives without root config', async () => {
        const directory = await temporaryDirectory();
        const path = await fixture(directory, { 'nested/config.xml': config });
        await expect(readWgtManifest(path)).rejects.toMatchObject({ code: 'NOT_A_WGT' });
        await writeFile(path, 'not a zip');
        await expect(readWgtManifest(path)).rejects.toMatchObject({ code: 'NOT_A_WGT' });
    });
});
