import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PacketDecoder, encodePacket } from './packet.js';
import { DeviceFiles } from './device-files.js';
import { SyncSession, syncFrame } from './sync.js';
import { DeviceShell } from './shell.js';
import { appCommand } from './app-command.js';
import { fakeHost } from './test-host.js';
const homes: string[] = [];
async function fixture() {
    const home = await mkdtemp(join(tmpdir(), 'sdb-unit-')); homes.push(home);
    const files = new DeviceFiles(home); await files.initialize(); return { home, files };
}
afterEach(async () => { for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true }); });
describe('packet codec', () => {
    it('decodes fragmented and coalesced packets', () => {
        const decoder = new PacketDecoder();
        const packet = encodePacket('WRTE', 1, 2, Buffer.from('hello'));
        expect(decoder.push(packet.subarray(0, 13))).toEqual([]);
        expect(decoder.push(Buffer.concat([packet.subarray(13), packet]))).toHaveLength(2);
    });
    it('rejects corruption and oversized frames', () => {
        const packet = encodePacket('WRTE', 1, 2, Buffer.from('hello'));
        packet[24] = 0;
        expect(() => new PacketDecoder().push(packet)).toThrow('checksum');
        packet.writeUInt32LE(0x40001, 12);
        expect(() => new PacketDecoder().push(packet)).toThrow('header');
    });
});
it('confines aliases, traversal and symlinks including tmp root', async () => {
    const { home, files } = await fixture();
    expect(await files.path('/home/owner/share/tmp/test')).toBe(join(home, 'tmp/test'));
    await expect(files.path('/tmp/../escape')).rejects.toThrow();
    await symlink(tmpdir(), join(home, 'tmp/link'));
    await expect(files.path('/tmp/link/escape')).rejects.toThrow();
    await rm(join(home, 'tmp'), { recursive: true });
    await symlink(tmpdir(), join(home, 'tmp'));
    await expect(files.path('/tmp/escape')).rejects.toThrow();
});
it('sync handles fragmented SEND DATA DONE timestamps and RECV STAT LIST', async () => {
    const { home, files } = await fixture();
    const responses: Buffer[] = [];
    const session = new SyncSession(files, async (data) => { responses.push(data); });
    const name = Buffer.from('/tmp/hello,33206');
    const upload = Buffer.concat([syncFrame('SEND', name.length, name), syncFrame('DATA', 3, Buffer.from('abc')),
        syncFrame('DONE', 1700000000)]);
    for (const byte of upload) await session.receive(Buffer.from([byte]));
    expect(await readFile(join(home, 'tmp/hello'), 'utf8')).toBe('abc');
    expect(responses[0]?.toString('ascii', 0, 4)).toBe('OKAY');
    for (const id of ['STAT', 'RECV', 'LIST']) {
        const path = Buffer.from(id === 'LIST' ? '/tmp' : '/tmp/hello');
        await session.receive(syncFrame(id, path.length, path));
    }
    expect(responses.map((data) => data.toString('ascii', 0, 4))).toEqual(['OKAY', 'STAT', 'DATA', 'DONE', 'DENT', 'DONE']);
    await session.close();
});
it('dispatches install launch terminate uninstall list and safe filesystem commands', async () => {
    const { home, files } = await fixture(); const events: string[] = [];
    const shell = new DeviceShell(fakeHost(events), files);
    await writeFile(join(home, 'tmp/a.wgt'), 'fixture');
    expect((await shell.execute('/usr/bin/wascmd -i TestPkg123.Test -p /tmp/a.wgt')).output).toContain('install completed');
    expect((await shell.execute('/usr/bin/app_launcher --start TestPkg123.Test')).output).toContain('launched');
    await shell.execute('/usr/bin/pkgcmd -k -n TestPkg123.Test');
    await shell.execute('/usr/bin/wascmd -u TestPkg123.Test');
    expect(events).toEqual([`install:${home}/tmp/a.wgt`, 'launch:TestPkg123.Test', 'terminate:TestPkg123.Test', 'uninstall:TestPkg123']);
    expect((await shell.execute('wascmd -l')).output).toContain('app_id                                =TestPkg123.Test');
    expect((await shell.execute('echo "hello world"')).output).toBe('hello world\n');
    expect((await shell.execute('cat /tmp/a.wgt')).output).toBe('fixture');
    expect((await shell.execute('unknown')).output).toBe('sh: unknown: command not found\n');
    expect((await shell.execute('cat /tmp/../../etc/passwd')).exitCode).toBe(1);
});
it('aborted sync upload preserves old content and removes staging files', async () => {
    const { home, files } = await fixture();
    await writeFile(join(home, 'tmp/a'), 'original');
    const session = new SyncSession(files, async () => {});
    const name = Buffer.from('/tmp/a,33206');
    await session.receive(Buffer.concat([syncFrame('SEND', name.length, name), syncFrame('DATA', 3, Buffer.from('new'))]));
    await session.close();
    expect(await readFile(join(home, 'tmp/a'), 'utf8')).toBe('original');
    expect((await new DeviceShell(fakeHost(), files).execute('ls /tmp')).output).toBe('a\n');
});
it('reports probes and shell command failures without host execution', async () => {
    const { files } = await fixture(); const shell = new DeviceShell(fakeHost(), files);
    for (const [command, expected] of [
        ['whoami', 'owner'], ['uname -m', 'x86_64'], ['uname -a', 'Linux'],
        ['/usr/bin/profile_command getversion', '10.0'], ['pkgcmd -a', 'Tizen Application Installation Path:'],
        ["cat /proc/cmdline | grep 'vm_name' | wc -l", '1'], ['pkginfo --pkg TestPkg123 | grep -i Removable', 'Removable: 1'],
    ]) expect((await shell.execute(command!)).output).toContain(expected);
    expect((await shell.execute('missing')).exitCode).toBe(127);
    expect((await shell.execute('echo "broken')).exitCode).toBe(1);
    await shell.execute('mkdir -p /tmp/new');
    expect((await shell.execute('ls /tmp')).output).toContain('new');
    await shell.execute('rm -r /tmp/new');
    expect((await shell.execute('ls /tmp')).output).not.toContain('new');
});
it('sync rejects invalid operations and closes on QUIT', async () => {
    const { files } = await fixture(); const responses: Buffer[] = [];
    const session = new SyncSession(files, async (data) => { responses.push(data); });
    await session.receive(syncFrame('DATA', 1, Buffer.from('x')));
    expect(responses.pop()?.toString('ascii', 0, 4)).toBe('FAIL');
    const invalid = Buffer.from('/tmp/../escape');
    await session.receive(syncFrame('RECV', invalid.length, invalid));
    expect(responses.pop()?.toString('ascii', 0, 4)).toBe('FAIL');
    const missing = Buffer.from('/tmp/missing');
    await session.receive(syncFrame('STAT', missing.length, missing));
    expect(responses.pop()?.readUInt32LE(4)).toBe(0);
    expect(await session.receive(syncFrame('QUIT'))).toBe(true);
    await expect(session.receive(syncFrame('DATA', 65537))).rejects.toThrow('too large');
});
it('maps generic and TV aliases and propagates host failures', async () => {
    const { home, files } = await fixture(); const events: string[] = [];
    const host = fakeHost(events); const shell = new DeviceShell(host, files);
    await writeFile(join(home, 'tmp/f.wgt'), 'fixture');
    for (const command of ['pkgcmd -i -t wgt -p /tmp/f.wgt -q', 'wascmd -r TestPkg123.Test',
        'wrt-launcher --s TestPkg123.Test --t 60000', 'launch_app TestPkg123.Test', 'pkgcmd -u -n TestPkg123 -q']) {
        expect((await shell.execute(command)).exitCode).toBe(0);
    }
    expect((await shell.execute('getprop ro.product.model')).output).toBe('tvemu\n');
    host.launch = async () => { throw new Error('Launch failed'); };
    expect(await shell.execute('app_launcher -s TestPkg123.Test')).toEqual({ output: 'Launch failed\n', exitCode: 1 });
});
it('accepts Latin1 sync names from Java and UTF8 names from native clients', async () => {
    const { home, files } = await fixture();
    for (const encoding of ['latin1', 'utf8'] as const) {
        const session = new SyncSession(files, async () => {});
        const remote = Buffer.from(`/tmp/café-${encoding},33206`, encoding);
        await session.receive(Buffer.concat([
            syncFrame('SEND', remote.length, remote), syncFrame('DATA', 1, Buffer.from('x')), syncFrame('DONE', 1700000000),
        ]));
        expect(await readFile(join(home, `tmp/café-${encoding}`), 'utf8')).toBe('x');
        await session.close();
    }
});
it('executes TV plugin lifecycle verbs and emits exact completion markers', async () => {
    const { home, files } = await fixture();
    const events: string[] = [];
    const shell = new DeviceShell(fakeHost(events), files);
    await shell.execute('0 mkdir');
    await writeFile(join(home, 'tmp/sdk_tools/tmp/app.wgt'), 'widget');
    expect(await shell.execute('0 vd_appinstall TestPkg123.Test /home/owner/share/tmp/sdk_tools/tmp/app.wgt'))
        .toEqual({ exitCode: 0, output: 'app_id[TestPkg123.Test] install start\napp_id[TestPkg123.Test] install completed\n' });
    expect(await shell.execute('0 was_execute TestPkg123.Test;echo cmd_ret:$?'))
        .toEqual({ exitCode: 0, output: 'app_id[TestPkg123.Test] launch start\napp_id[TestPkg123.Test] launched\ncmd_ret:0\n' });
    expect(await shell.execute('appuninstall TestPkg123'))
        .toEqual({ exitCode: 0, output: '__return_cb req_id[1] pkg_type[wgt] pkgid[TestPkg123] key[end] val[ok]\n' });
    expect(events).toEqual([`install:${home}/tmp/sdk_tools/tmp/app.wgt`, 'launch:TestPkg123.Test', 'uninstall:TestPkg123']);
    expect(await shell.execute('0 getappinstallpath')).toEqual({ exitCode: 0,
        output: 'Tizen Application Installation Path: /home/owner/apps_rw\n' });
    expect((await shell.execute('0 unknown;echo cmd_ret:$?')).output).toContain('cmd_ret:127\n');
});

it('never reports appcmd success for host failures, unknown packages or unsupported verbs', async () => {
    const { files } = await fixture();
    const host = fakeHost();
    host.launch = async () => { throw new Error('launch rejected'); };
    host.uninstall = async () => { throw new Error('uninstall rejected'); };
    host.installWgt = async () => { throw new Error('install rejected'); };
    for (const command of ['runapp:TestPkg123.Test', 'uninstall:TestPkg123',
        'install:wgt:/tmp/widget.wgt:null:null', 'packageinfo:missing', 'unsupported']) {
        const result = await appCommand(command, host, files);
        expect(result).toContain('appcmd_exitcode:1\n');
        expect(result).not.toContain('appcmd_exitcode:0');
        expect(result).not.toContain('val[ok]');
    }
});

it('reports running state without launching and rejects unavailable debugging', async () => {
    const { files } = await fixture();
    const events: string[] = [];
    const host = fakeHost(events);
    const shell = new DeviceShell(host, files);
    expect(await shell.execute('app_launcher -r TestPkg123.Test'))
        .toEqual({ output: 'result: not running\n', exitCode: 0 });
    host.runningApp = async () => (await host.listApps())[0]!;
    expect(await shell.execute('app_launcher --is-running TestPkg123.Test'))
        .toEqual({ output: 'result: running\n', exitCode: 0 });
    expect(await shell.execute('0 debug TestPkg123.Test;echo cmd_ret:$?'))
        .toEqual({ output: 'Web debugging is not supported\ncmd_ret:1\n', exitCode: 1 });
    expect((await shell.execute('app_launcher -s TestPkg123.Test -w')).exitCode).toBe(1);
    expect(events).toEqual([]);
});

it('installs, launches, terminates, queries pkginfo, and uninstalls tpk packages', async () => {
    const { home, files } = await fixture();
    const events: string[] = [];
    const baseHost = fakeHost(events);
    const tpkInstalled = {
        manifest: {
            widgetId: 'org.demo.tpk',
            appId: 'org.demo.tpk.app',
            packageId: 'org.demo.tpk',
            name: 'Demo TPK',
            version: '1.0.0',
            requiredVersion: '11.0',
            contentSrc: 'Demo.dll',
            icon: null,
            privileges: [],
            features: [],
            contentSecurityPolicy: null,
            accessOrigins: [],
            settings: {},
            profile: 'tv',
            kind: 'tpk' as const,
            exec: 'Demo.dll',
            appType: 'dotnet-nui',
            apiVersion: '11.0',
        },
        installDir: '/unused',
        installedAt: '2026-01-01',
    };
    baseHost.listApps = async () => [tpkInstalled];
    baseHost.installWgt = async (path) => {
        events.push(`install:${path}`);
        return tpkInstalled;
    };
    const shell = new DeviceShell(baseHost, files);
    await writeFile(join(home, 'tmp/app.tpk'), 'tpk-fixture');

    expect(await shell.execute('/usr/bin/pkgcmd -i -t tpk -p /tmp/app.tpk -q')).toEqual({
        exitCode: 0,
        output: '__return_cb req_id[1] pkg_type[tpk] pkgid[org.demo.tpk] key[end] val[ok]\n',
    });
    expect((await shell.execute('pkginfo --pkg org.demo.tpk')).output).toContain('Type: tpk\n');
    expect((await shell.execute('pkgcmd -l')).output).toContain('pkg_type [tpk] pkgid [org.demo.tpk]');
    expect((await shell.execute('launch_app org.demo.tpk.app')).output).toContain('successfully launched');
    expect((await shell.execute('app_launcher -t org.demo.tpk.app')).output).toContain('Terminate appId: org.demo.tpk.app');
    expect(await shell.execute('/usr/bin/pkgcmd -q -u -n org.demo.tpk')).toEqual({
        exitCode: 0,
        output: '__return_cb req_id[1] pkg_type[tpk] pkgid[org.demo.tpk] key[end] val[ok]\n',
    });
    expect(await appCommand('install:tpk:/tmp/app.tpk:null:null', baseHost, files)).toBe(
        'appcmd_returnstr:__return_cb pkgid[org.demo.tpk] key[end] val[ok]\nappcmd_exitcode:0\n',
    );
    expect(await appCommand('packageinfo:org.demo.tpk', baseHost, files)).toBe(
        'appcmd_returnstr:org.demo.tpk.app:tpk:1:0\nappcmd_exitcode:0\n',
    );
    expect(events).toEqual([
        `install:${home}/tmp/app.tpk`,
        'launch:org.demo.tpk.app',
        'terminate:org.demo.tpk.app',
        'uninstall:org.demo.tpk',
        `install:${home}/tmp/app.tpk`,
    ]);
});
