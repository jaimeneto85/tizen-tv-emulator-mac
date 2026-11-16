import { build } from 'esbuild';

await build({
    entryPoints: ['src/browser/install.ts'],
    bundle: true,
    format: 'iife',
    target: 'chrome69',
    outfile: 'dist/tizen-api.js',
    logLevel: 'info'
});
