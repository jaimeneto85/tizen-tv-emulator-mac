import { expect, it } from 'vitest';
import { createConnection } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSdbBridge } from './index.js';
import { fakeHost } from './test-host.js';
import { encodePacket, PacketDecoder, VERSION, type Packet } from './packet.js';
it('negotiates fragmentation, gates output on ACK, and restarts after teardown', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sdb-transport-'));
    const bridge = createSdbBridge({ host: fakeHost(), home, port: 0 });
    const address = await bridge.start();
    expect(await bridge.start()).toEqual(address);
    const socket = createConnection(address.port, '127.0.0.1');
    const decoder = new PacketDecoder();
    const packets: Packet[] = [];
    socket.on('data', (chunk) => packets.push(...decoder.push(chunk)));
    async function next(command: string): Promise<Packet> {
        for (let count = 0; count < 100; count++) {
            const packet = packets.shift();
            if (packet) { expect(packet.command).toBe(command); return packet; }
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error(`Missing ${command}`);
    }
    try {
        socket.write(encodePacket('CNXN', VERSION, 16, Buffer.from('host::\0')));
        expect((await next('CNXN')).arg1).toBe(16);
        socket.write(encodePacket('OPEN', 7, 0, Buffer.from('capability:\0')));
        const ready = await next('OKAY');
        let output = Buffer.alloc(0);
        let part = await next('WRTE');
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(packets).toEqual([]);
        while (true) {
            expect(part.data.length).toBeLessThanOrEqual(16);
            output = Buffer.concat([output, part.data]);
            socket.write(encodePacket('OKAY', 7, ready.arg0));
            for (let count = 0; count < 100 && packets.length === 0; count++) {
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            const following = packets.shift();
            expect(following).toBeDefined();
            if (following!.command === 'CLSE') break;
            expect(following!.command).toBe('WRTE');
            part = following!;
        }
        expect(output.subarray(2).toString()).toContain('vendor_name:Samsung');
    } finally {
        socket.destroy();
        await Promise.all([bridge.stop(), bridge.stop()]);
        await bridge.start();
        await bridge.stop();
        await rm(home, { recursive: true, force: true });
    }
});
it('returns exact binary sysinfo and unframed platform, root and boot service replies', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sdb-services-'));
    const bridge = createSdbBridge({ host: fakeHost(), home, port: 0 });
    const address = await bridge.start();
    async function request(service: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const socket = createConnection(address.port, '127.0.0.1');
            const decoder = new PacketDecoder();
            const chunks: Buffer[] = [];
            socket.setTimeout(3000, () => { socket.destroy(); reject(new Error(`Timeout: ${service}`)); });
            socket.on('error', reject);
            socket.on('connect', () => socket.write(encodePacket('CNXN', VERSION, 4096, Buffer.from('host::\0'))));
            socket.on('data', (data) => {
                for (const packet of decoder.push(data)) {
                    if (packet.command === 'CNXN') socket.write(encodePacket('OPEN', 1, 0, Buffer.from(`${service}\0`)));
                    if (packet.command === 'WRTE') {
                        chunks.push(packet.data);
                        socket.write(encodePacket('OKAY', 1, packet.arg0));
                    }
                    if (packet.command === 'CLSE') { socket.destroy(); resolve(Buffer.concat(chunks)); }
                }
            });
        });
    }
    try {
        const info = await request('sysinfo:');
        expect(info).toHaveLength(320);
        ['2.2.0', 'tvemu', 'Tizen', '10.0', 'tv'].forEach((value, index) => {
            const field = info.subarray(index * 64, (index + 1) * 64);
            expect(field.subarray(0, value.length).toString()).toBe(value);
            expect([...field.subarray(value.length)]).toEqual(Array(64 - value.length).fill(0));
        });
        for (const [service, expected] of [
            ['tzplatformenv:TZ_SDK_TOOLS', '0/home/owner/share/tmp/sdk_tools'],
            ['tzplatformenv:TZ_SYS_RW_APP', '0/opt/usr/apps'],
            ['tzplatformenv:TZ_SYS_DEBUG_PORT', '09222'],
            ['tzplatformenv:missing', '2'], ['tzplatformenv:constructor', '2'],
            ['root:on', 'Permission denied\n'], ['root:off', ''],
            ['root:invalid', 'Unknown command option : invalid\n'], ['boot:', '1'],
        ]) expect((await request(service!)).toString()).toBe(expected);
    } finally {
        await bridge.stop();
        await rm(home, { recursive: true, force: true });
    }
});
