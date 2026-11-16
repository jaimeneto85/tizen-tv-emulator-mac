import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { SDB_DEFAULT_PORT, type HostApi } from '@tvemu/protocol';
import { DeviceFiles } from './device-files.js';
import { DeviceShell } from './shell.js';
import { capability, systemInfo, platformEnvironment } from './device-identity.js';
import { appCommand } from './app-command.js';
import { encodePacket, MAX_PAYLOAD, PacketDecoder, VERSION, type Packet } from './packet.js';
import { SyncSession } from './sync.js';
export interface SdbBridge { start(): Promise<{ port: number }>; stop(): Promise<void> }
export interface SdbBridgeOptions { host: HostApi; port?: number; home: string; serialName?: string; log?: (line: string) => void }
interface Stream {
    local: number;
    remote: number;
    acknowledge?: () => void;
    reject?: (error: Error) => void;
    sync?: SyncSession;
    interactive: boolean;
    input: string;
    chain: Promise<void>;
    closed: boolean;
}
export function createSdbBridge(options: SdbBridgeOptions): SdbBridge {
    const files = new DeviceFiles(options.home);
    const shell = new DeviceShell(options.host, files);
    const sockets = new Set<Socket>();
    const tasks = new Set<Promise<void>>();
    let server: Server | undefined;
    let starting: Promise<{ port: number }> | undefined;
    function connection(socket: Socket): void {
        sockets.add(socket);
        const decoder = new PacketDecoder();
        const streams = new Map<number, Stream>();
        let nextId = 1;
        let connected = false;
        let maxPayload = MAX_PAYLOAD;
        const packet = (command: string, local: number, remote: number, data?: Buffer): void => {
            if (!socket.destroyed) socket.write(encodePacket(command, local, remote, data));
        };
        const dispose = (stream: Stream): void => {
            stream.closed = true;
            stream.reject?.(new Error('Stream closed'));
            streams.delete(stream.local);
            const cleanup = stream.chain.then(() => stream.sync?.close()).catch(() => undefined);
            tasks.add(cleanup);
            void cleanup.finally(() => tasks.delete(cleanup));
        };
        const close = (stream: Stream): void => { packet('CLSE', stream.local, stream.remote); dispose(stream); };
        const send = async (stream: Stream, data: Buffer): Promise<void> => {
            for (let offset = 0; offset < data.length; offset += maxPayload) {
                if (stream.closed) throw new Error('Stream closed');
                await new Promise<void>((resolve, reject) => {
                    stream.acknowledge = resolve;
                    stream.reject = reject;
                    packet('WRTE', stream.local, stream.remote, data.subarray(offset, offset + maxPayload));
                });
                stream.acknowledge = undefined;
                stream.reject = undefined;
            }
        };
        const run = (stream: Stream, work: () => Promise<void>): void => {
            stream.chain = stream.chain.then(() => { if (!stream.closed) return work(); }).catch((error: unknown) => {
                options.log?.(String(error));
                close(stream);
            });
            const task = stream.chain;
            tasks.add(task);
            void task.finally(() => tasks.delete(task));
        };
        const handle = (incoming: Packet): void => {
            const { command, arg0, arg1, data } = incoming;
            options.log?.(`PACKET ${command} ${arg0} ${arg1} ${data.length}`);
            if (command === 'CNXN') {
                if (connected || !arg1) throw new Error('Invalid handshake');
                connected = true;
                maxPayload = Math.min(MAX_PAYLOAD, arg1);
                packet('CNXN', Math.min(VERSION, arg0), maxPayload, Buffer.from(`device::${options.serialName ?? 'tvemu'}::0\0`));
                return;
            }
            if (!connected || data.length > maxPayload) throw new Error('Invalid transport state');
            if (command === 'OPEN') {
                if (!arg0 || arg1 || [...streams.values()].some((stream) => stream.remote === arg0)) throw new Error('Invalid OPEN');
                const service = data.toString().replace(/\0$/, '');
                options.log?.(`OPEN ${service}`);
                const accepted = /^(shell:|sync:|capability:$|sysinfo:$|boot:$|root:|appcmd:|tzplatformenv:)/.test(service);
                if (!accepted) { packet('CLSE', 0, arg0); return; }
                const stream: Stream = { local: nextId++, remote: arg0, interactive: service === 'shell:', input: '',
                    chain: Promise.resolve(), closed: false };
                streams.set(stream.local, stream);
                packet('OKAY', stream.local, stream.remote);
                if (service.startsWith('sync:')) stream.sync = new SyncSession(files, (buffer) => send(stream, buffer));
                else if (!stream.interactive) run(stream, async () => {
                    let result: Buffer;
                    if (service.startsWith('shell:')) result = Buffer.from((await shell.execute(service.slice(6))).output);
                    else if (service === 'capability:') result = capability(options.host);
                    else if (service === 'sysinfo:') result = systemInfo(options.host);
                    else if (service.startsWith('appcmd:')) result = Buffer.from(await appCommand(service.slice(7), options.host, files));
                    else {
                        const text = service === 'boot:' ? '1' : service === 'root:on' ? 'Permission denied\n'
                            : service === 'root:off' ? '' : service.startsWith('root:')
                                ? `Unknown command option : ${service.slice(5)}\n` : platformEnvironment(service.slice(14));
                        result = Buffer.from(text);
                    }
                    await send(stream, result);
                    close(stream);
                });
                return;
            }
            const stream = streams.get(arg1);
            if (!stream) { if (command !== 'CLSE') packet('CLSE', arg1, arg0); return; }
            if (stream.remote !== arg0 && !(command === 'CLSE' && arg0 === 0)) throw new Error('Invalid stream ID');
            if (command === 'OKAY') stream.acknowledge?.();
            else if (command === 'CLSE') close(stream);
            else if (command === 'WRTE') {
                packet('OKAY', stream.local, stream.remote);
                run(stream, async () => {
                    if (stream.sync) { if (await stream.sync.receive(data)) close(stream); }
                    else if (stream.interactive) {
                        stream.input += data.toString();
                        if (stream.input.length > MAX_PAYLOAD) throw new Error('Shell input too long');
                        let end: number;
                        while ((end = stream.input.search(/[\r\n]/)) >= 0) {
                            const line = stream.input.slice(0, end);
                            stream.input = stream.input.slice(end + 1);
                            if (line.trim() === 'exit') { close(stream); break; }
                            await send(stream, Buffer.from((await shell.execute(line)).output));
                        }
                    }
                });
            } else throw new Error('Unsupported packet');
        };
        socket.on('data', (chunk) => {
            try { for (const incoming of decoder.push(chunk)) handle(incoming); }
            catch (error) { options.log?.(String(error)); socket.destroy(); }
        });
        socket.on('error', (error) => options.log?.(error.message));
        socket.on('close', () => { sockets.delete(socket); for (const stream of streams.values()) dispose(stream); });
    }
    return {
        start() {
            if (starting) return starting;
            starting = (async () => {
                await files.initialize();
                server = createServer(connection);
                await new Promise<void>((resolve, reject) => {
                    server!.once('error', reject);
                    server!.listen(options.port ?? SDB_DEFAULT_PORT, '127.0.0.1', () => {
                        server!.removeListener('error', reject); resolve();
                    });
                });
                const address = server.address();
                if (!address || typeof address === 'string') throw new Error('Missing TCP address');
                const announcement = createConnection({ host: '127.0.0.1', port: Number(process.env.SDB_SERVER_PORT ?? 26099) });
                sockets.add(announcement);
                announcement.setTimeout(1000, () => announcement.destroy());
                announcement.on('error', () => announcement.destroy());
                announcement.on('data', () => announcement.destroy());
                announcement.on('close', () => sockets.delete(announcement));
                announcement.on('connect', () => {
                    const request = `host:emulator:${address.port}:${options.serialName ?? 'tvemu'}`;
                    announcement.write(Buffer.byteLength(request).toString(16).padStart(4, '0') + request);
                });
                return { port: address.port };
            })().catch((error: unknown) => { starting = undefined; throw error; });
            return starting;
        },
        async stop() {
            await starting?.catch(() => undefined);
            for (const socket of sockets) socket.destroy();
            if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
            await Promise.allSettled(tasks);
            server = undefined;
            starting = undefined;
        },
    };
}
