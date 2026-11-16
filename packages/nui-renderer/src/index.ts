import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function nuiRendererAssetsDir(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    if (path.basename(currentDir) === 'src') {
        return path.resolve(currentDir, '..', 'dist', 'public');
    }
    return path.resolve(currentDir, 'public');
}
