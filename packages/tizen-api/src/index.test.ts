import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TIZEN_API_VERSION, tizenApiBundlePath } from './index.js';

describe('node entry', () => {
    it('exports TIZEN_API_VERSION and the absolute bundle path', () => {
        expect(TIZEN_API_VERSION).toBe('1.0.0');
        const bundlePath = tizenApiBundlePath();
        expect(bundlePath.endsWith('tizen-api.js')).toBe(true);
        expect(path.isAbsolute(bundlePath)).toBe(true);
        const here = path.dirname(fileURLToPath(import.meta.url));
        expect(existsSync(path.resolve(here, '../dist/tizen-api.js'))).toBe(true);
    });
});
