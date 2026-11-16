import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nuiRendererAssetsDir } from './index.js';

function bundleSource(): string {
    return readFileSync(path.join(nuiRendererAssetsDir(), 'nui-renderer.js'), 'utf8');
}

describe('built nui-renderer bundle', () => {
    it('is a single IIFE with no runtime imports', () => {
        const source = bundleSource();
        expect(source.trimStart().startsWith('"use strict";')).toBe(true);
        expect(source.indexOf('(() => {')).not.toBe(-1);
        expect(source.trimEnd().endsWith('})();')).toBe(true);
        expect(source.indexOf('require(')).toBe(-1);
        expect(source.indexOf('import ')).toBe(-1);
        expect(source.indexOf('export ')).toBe(-1);
    });

    it('contains none of the Chromium 69 forbidden constructs', () => {
        const source = bundleSource();
        const forbidden: Array<[string, RegExp]> = [
            ['optional chaining', /\?\.[a-zA-Z_(]/],
            ['nullish coalescing', /\?\?/],
            ['Object.fromEntries', /Object\.fromEntries/],
            ['Array.prototype.flat', /\.flat\(/],
            ['globalThis', /globalThis/],
            ['Promise.allSettled', /Promise\.allSettled/],
            ['String.prototype.matchAll', /\.matchAll\(/],
            ['BigInt', /\bBigInt\b/],
        ];
        const found = forbidden.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
        expect(found).toEqual([]);
    });
});
