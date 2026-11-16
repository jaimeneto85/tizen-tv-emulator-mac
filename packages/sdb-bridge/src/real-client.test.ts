import { expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createSdbBridge } from './index.js';
import { app, fakeHost } from './test-host.js';
const execute = promisify(execFile);
const sdb = join(homedir(), 'tizen-studio/tools/sdb');
const tizen = join(homedir(), 'tizen-studio/tools/ide/bin/tizen');
async function available(port: number): Promise<boolean> {
    return await new Promise((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.setTimeout(500);
        socket.once('connect', () => { socket.destroy(); resolve(false); });
        socket.once('error', () => { socket.destroy(); resolve(true); });
        socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
}

it('installs, launches and uninstalls with real Samsung sdb and Tizen CLI', async (context) => {
    if (!await access(sdb).then(() => true, () => false)) { context.skip(); return; }
    if (!await available(26099)) { console.log('SKIP: existing sdb server on 26099; not owned'); context.skip(); return; }
    const home = await mkdtemp(join(tmpdir(), 'sdb-real-'));
    const events: string[] = [];
    const logs: string[] = [];
    const outputs: string[] = [];
    let port = 26101;
    while (!await available(port) && port <= 26241) port += 10;
    if (port > 26241) throw new Error('No free scan port');
    const host = fakeHost(events);
    let installed = false;
    let uploaded: Buffer | undefined;
    host.listApps = async () => installed ? [app] : [];
    host.installWgt = async (path) => {
        uploaded = await readFile(path);
        events.push(`install:${path}`);
        installed = true;
        return app;
    };
    host.launch = async (id) => {
        if (!installed || id !== app.manifest.appId) throw new Error('Application is not installed');
        events.push(`launch:${id}`);
    };
    host.uninstall = async (id) => {
        if (!installed || id !== app.manifest.packageId) throw new Error('Package is not installed');
        events.push(`uninstall:${id}`);
        installed = false;
    };
    const bridge = createSdbBridge({ host, home, port, log: (line) => logs.push(line) });
    let owned = false;
    let daemon: ReturnType<typeof spawn> | undefined;
    async function run(binary: string, args: string[]) {
        try {
            const result = await execute(binary, args, { timeout: 45000, maxBuffer: 4 * 1024 * 1024,
                env: { ...process.env, SDB_SERVER_PORT: '26099', JAVA_TOOL_OPTIONS:
                    ['java.lang', 'java.util', 'java.io', 'java.lang.reflect']
                        .map((name) => `--add-opens=java.base/${name}=ALL-UNNAMED`).join(' ') } });
            outputs.push(`$ ${binary} ${args.join(' ')}\nexit: 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
            return result.stdout;
        } catch (error) {
            const failure = error as Error & { stdout?: string; stderr?: string; code?: number };
            outputs.push(`$ ${binary} ${args.join(' ')}\nexit: ${failure.code}\nstdout:\n${failure.stdout}\nstderr:\n${failure.stderr}`);
            throw error;
        }
    }
    try {
        await bridge.start();
        daemon = spawn(sdb, ['fork-server', 'server'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let daemonError: Error | undefined;
        daemon.on('error', (error) => { daemonError = error; });
        daemon.stdout?.on('data', (data) => outputs.push(`server stdout: ${String(data)}`));
        daemon.stderr?.on('data', (data) => outputs.push(`server stderr: ${String(data)}`));
        for (let count = 0; count < 50 && await available(26099); count++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (daemonError || daemon.exitCode !== null || daemon.signalCode !== null || await available(26099)) {
            throw daemonError ?? new Error(`Owned server unavailable: exit=${daemon.exitCode}, signal=${daemon.signalCode}`);
        }
        owned = true;
        const serial = `emulator-${port}`;
        let devices = '';
        for (let count = 0; count < 20; count++) {
            devices = await run(sdb, ['devices']);
            if (devices.includes(serial) && /\bdevice\s+tvemu/.test(devices)) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(devices).toContain(serial);
        expect(await run(sdb, ['-s', serial, 'shell', 'echo', 'hi'])).toContain('hi');
        const local = join(home, 'payload.txt'); await writeFile(local, 'real Samsung push\n');
        await run(sdb, ['-s', serial, 'push', local, '/tmp/payload.txt']);
        expect(await readFile(join(home, 'tmp/payload.txt'), 'utf8')).toBe('real Samsung push\n');
        expect(await run(sdb, ['-s', serial, 'capability'])).toContain('vendor_name:Samsung');
        const config = [
            '<?xml version="1.0"?><widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"',
            ' id="http://example.org/test" version="1.0.0">',
            '<tizen:application id="TestPkg123.Test" package="TestPkg123" required_version="2.3"/>',
            '<content src="index.html"/><name>Test</name><tizen:profile name="tv"/></widget>',
        ].join('');
        await writeFile(join(home, 'config.xml'), config);
        await writeFile(join(home, 'index.html'), '<html>fixture</html>');
        await execute('/usr/bin/zip', ['fixture.wgt', 'config.xml', 'index.html'], { cwd: home });
        const expectedArchive = await readFile(join(home, 'fixture.wgt'));
        expect(await host.listApps()).toEqual([]);
        expect(await run(tizen, ['install', '-n', join(home, 'fixture.wgt'), '-s', serial]))
            .toContain('Tizen application is successfully installed.');
        expect(uploaded).toEqual(expectedArchive);
        expect(await host.listApps()).toEqual([app]);
        expect(await run(tizen, ['run', '-p', 'TestPkg123.Test', '-s', serial]))
            .toContain('Tizen application is successfully launched.');
        expect(events.at(-1)).toBe('launch:TestPkg123.Test');
        const uninstalled = await run(tizen, ['uninstall', '-p', 'TestPkg123', '-s', serial]);
        expect(uninstalled).toContain('pkgid[TestPkg123] key[end] val[ok]');
        expect(uninstalled).toMatch(/Total time: \d{2}:\d{2}:\d{2}\.\d+/);
        expect(await host.listApps()).toEqual([]);
        expect(events).toEqual([expect.stringContaining('install:'), 'launch:TestPkg123.Test', 'uninstall:TestPkg123']);
        outputs.push(`HostApi events:\n${events.join('\n')}`);
    } finally {
        try {
            if (owned && daemon?.exitCode === null && daemon.signalCode === null) await run(sdb, ['kill-server']);
        } finally {
            daemon?.kill();
            await bridge.stop();
        }
        outputs.push(`Device service trace:\n${logs.join('\n')}`);
        console.log(outputs.join('\n\n'));
        await writeFile(join(home, 'real-output.txt'), outputs.join('\n\n'));
        console.log(`Real output saved: ${home}/real-output.txt`);
    }
}, 180000);
