import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TIZEN_API_VERSION = '1.0.0';

export function tizenApiBundlePath(): string {
    return path.join(path.dirname(fileURLToPath(import.meta.url)), 'tizen-api.js');
}
