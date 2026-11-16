import { lstat, mkdir, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
export class DeviceFiles {
    readonly root: string;
    constructor(private readonly home: string) { this.root = resolve(home, 'tmp'); }
    async initialize(): Promise<void> {
        await mkdir(this.home, { recursive: true });
        if ((await lstat(this.home)).isSymbolicLink()) throw new Error('Symlink home is forbidden');
        await this.path('/');
        await mkdir(this.root, { recursive: true });
    }
    async path(remote: string): Promise<string> {
        if (remote.includes('\0') || remote.includes('\\') || remote.split('/').includes('..')) throw new Error('Invalid device path');
        const mapped = remote.replace(/^\/home\/owner\/share(?:\/tmp)?(?:\/|$)/, '')
            .replace(/^\/opt\/usr\/apps\/tmp(?:\/|$)/, '').replace(/^\/?tmp(?:\/|$)/, '').replace(/^\/+/, '');
        const parts = mapped.split('/').filter((part) => part && part !== '.');
        const canonicalHome = await realpath(this.home);
        let current = this.root;
        for (const part of ['', ...parts]) {
            current = part ? join(current, part) : current;
            try {
                const stat = await lstat(current);
                if (stat.isSymbolicLink()) throw new Error('Symlinks are forbidden');
                const canonical = await realpath(current);
                if (!canonical.startsWith(canonicalHome + '/')) throw new Error('Path escapes home');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
        }
        return current;
    }
}
