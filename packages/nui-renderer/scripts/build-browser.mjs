import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist/public', { recursive: true });
await copyFile('src/public/index.html', 'dist/public/index.html');

await build({
    entryPoints: ['src/browser/install.ts'],
    bundle: true,
    format: 'iife',
    target: 'chrome69',
    outfile: 'dist/public/nui-renderer.js',
    logLevel: 'info',
});
