export const MAX_PAYLOAD = 0x40000;
export const VERSION = 0x00100000;
export interface Packet { command: string; arg0: number; arg1: number; data: Buffer }
export function checksum(data: Buffer): number {
    return data.reduce((sum, byte) => (sum + byte) >>> 0, 0);
}
export function encodePacket(command: string, arg0: number, arg1: number, data: Buffer = Buffer.alloc(0)): Buffer {
    if (command.length !== 4 || data.length > MAX_PAYLOAD) throw new Error('Invalid packet');
    const header = Buffer.alloc(24);
    header.write(command, 0, 4, 'ascii');
    header.writeUInt32LE(arg0, 4);
    header.writeUInt32LE(arg1, 8);
    header.writeUInt32LE(data.length, 12);
    header.writeUInt32LE(checksum(data), 16);
    header.writeUInt32LE((header.readUInt32LE(0) ^ 0xffffffff) >>> 0, 20);
    return Buffer.concat([header, data]);
}
export class PacketDecoder {
    private pending: Buffer = Buffer.alloc(0);
    push(chunk: Buffer): Packet[] {
        this.pending = Buffer.concat([this.pending, chunk]);
        const packets: Packet[] = [];
        while (this.pending.length >= 24) {
            const header = this.pending;
            const size = header.readUInt32LE(12);
            if (size > MAX_PAYLOAD || header.readUInt32LE(20) !== ((header.readUInt32LE(0) ^ 0xffffffff) >>> 0)) {
                throw new Error('Invalid packet header');
            }
            if (header.length < 24 + size) break;
            const data = header.subarray(24, 24 + size);
            if (checksum(data) !== header.readUInt32LE(16)) throw new Error('Invalid packet checksum');
            packets.push({ command: header.toString('ascii', 0, 4), arg0: header.readUInt32LE(4), arg1: header.readUInt32LE(8), data });
            this.pending = header.subarray(24 + size);
        }
        return packets;
    }
}
