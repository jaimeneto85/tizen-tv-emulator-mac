import { describe, expect, it, vi } from 'vitest';
import { loadApp, SAMPLE_MANIFEST } from './testing/harness.js';

describe('privilege warnings', () => {
    it('warns once per API when the manifest lacks the privilege', () => {
        const { window } = loadApp({ manifest: SAMPLE_MANIFEST });
        const warn = vi.fn();
        Object.defineProperty(window.console, 'warn', { configurable: true, value: warn });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        tizen.tvinputdevice.getSupportedKeys();
        tizen.tvinputdevice.getSupportedKeys();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('[tvemu] tizen.tvinputdevice needs privilege http://tizen.org/privilege/tv.inputdevice in config.xml');
    });

    it('does not warn when the privilege is declared', () => {
        const manifest = {
            ...SAMPLE_MANIFEST,
            privileges: [{ name: 'http://tizen.org/privilege/tv.inputdevice' }]
        };
        const { window } = loadApp({ manifest });
        const warn = vi.fn();
        Object.defineProperty(window.console, 'warn', { configurable: true, value: warn });
        const tizen = (window as Record<string, unknown>).tizen as Record<string, any>;
        tizen.tvinputdevice.getSupportedKeys();
        expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn when no manifest is injected', () => {
        const { window } = loadApp();
        const warn = vi.fn();
        Object.defineProperty(window.console, 'warn', { configurable: true, value: warn });
        const webapis = (window as Record<string, unknown>).webapis as Record<string, any>;
        webapis.avplay.getVersion();
        expect(warn).not.toHaveBeenCalled();
    });
});
