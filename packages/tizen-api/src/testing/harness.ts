import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

export interface LoadOptions {
    profile?: Record<string, unknown>;
    manifest?: Record<string, unknown> | null;
    bridge?: (json: string) => void;
    globals?: Record<string, unknown>;
}

export interface LoadedApp {
    window: JSDOM['window'] & Record<string, unknown>;
    document: Document;
    sent: string[];
    keyDown: (code: number) => Event;
}

export function bundleSource(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const bundlePath = path.resolve(here, '../../dist/tizen-api.js');
    return readFileSync(bundlePath, 'utf8');
}

export function loadApp(options: LoadOptions = {}): LoadedApp {
    const dom = new JSDOM('<!doctype html><html><body><div id="app">content</div></body></html>', {
        url: 'http://localhost/',
        pretendToBeVisual: true,
        runScripts: 'dangerously'
    });
    const window = dom.window as unknown as LoadedApp['window'];
    if (options.profile) {
        (window as Record<string, unknown>).__tvemuProfile = options.profile;
    }
    if (options.manifest !== undefined) {
        (window as Record<string, unknown>).__tvemuManifest = options.manifest;
    }
    const sent: string[] = [];
    if (options.bridge) {
        (window as Record<string, unknown>).__tvemuSend = (json: string) => {
            sent.push(json);
            options.bridge!(json);
        };
    }
    if (options.globals) {
        for (const name of Object.keys(options.globals)) {
            (window as Record<string, unknown>)[name] = options.globals[name];
        }
    }
    window.eval(bundleSource());
    const document = window.document;
    const keyDown = (code: number): Event => {
        const event = new window.Event('keydown', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { value: code });
        window.dispatchEvent(event);
        return event;
    };
    return { window, document, sent, keyDown };
}

export function nextTick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

export function thrownName(fn: () => void): string {
    try {
        fn();
    } catch (error) {
        return (error as { name?: string }).name || String(error);
    }
    return '';
}

export const SAMPLE_MANIFEST = {
    widgetId: 'wid',
    appId: 'ABCDEFGHIJ.myapp',
    packageId: 'ABCDEFGHIJ',
    name: 'My App',
    version: '1.2.3',
    requiredVersion: '2.4',
    contentSrc: 'index.html',
    icon: 'icon.png',
    privileges: [] as Array<{ name: string }>,
    features: [],
    contentSecurityPolicy: null,
    accessOrigins: [],
    settings: {},
    profile: null
};
