import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { REMOTE_KEYS, type DeviceProfile, type InstalledApp, type RemoteUiClientMessage } from '@tvemu/protocol';
import { describe, expect, it } from 'vitest';
import { remoteUiAssetsDir } from './index.js';
import {
    buildWebSocketUrl,
    createRemoteUiController,
    decodeServerMessage,
    encodeClientMessage,
    isKeyDimmed,
    mapKeyboardEvent,
} from './public/app.js';

const SAMPLE_PROFILE: DeviceProfile = {
    name: 'tizen-5.5',
    label: '2020 Smart TV (Tizen 5.5 / M69)',
    tizenVersion: '5.5',
    modelYear: 2020,
    chromiumMilestone: 69,
    userAgent: 'Mozilla/5.0',
    width: 1920,
    height: 1080,
    cpuThrottle: 1,
    model: 'TVEMU_2020',
    modelCode: 'TVEMU-2020-FHD',
    firmware: 'TVEMU-5.5.0',
    duid: 'TVEMU000000002020',
    locale: 'en_US',
    country: 'US',
};

const SAMPLE_APP: InstalledApp = {
    installDir: '/tmp/apps/demo',
    installedAt: '2026-01-01T00:00:00Z',
    manifest: {
        widgetId: 'http://example.com/demo',
        appId: 'demoPkg.DemoApp',
        packageId: 'demoPkg',
        name: 'Demo App',
        version: '1.0.0',
        requiredVersion: '5.5',
        contentSrc: 'index.html',
        icon: null,
        privileges: [],
        features: [],
        contentSecurityPolicy: null,
        accessOrigins: [],
        settings: {},
        profile: 'tv-samsung',
    },
};

async function loadRemoteDom(): Promise<JSDOM> {
    const htmlPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'public', 'index.html');
    const html = await readFile(htmlPath, 'utf8');
    return new JSDOM(html, { url: 'http://127.0.0.1:8080/remote/' });
}

describe('remote-ui message encoding and helpers', () => {
    it('encodes client messages and decodes valid server messages', () => {
        const encoded = encodeClientMessage({ type: 'key', key: 'Enter', action: 'down' });
        expect(JSON.parse(encoded)).toEqual({ type: 'key', key: 'Enter', action: 'down' });

        expect(decodeServerMessage(JSON.stringify({ type: 'log', level: 'warn', text: 'hello' }))).toEqual({
            type: 'log',
            level: 'warn',
            text: 'hello',
        });
        expect(decodeServerMessage('not-json')).toBeNull();
        expect(decodeServerMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
    });

    it('builds ws or wss URLs from location', () => {
        expect(buildWebSocketUrl({ protocol: 'http:', host: '127.0.0.1:9000' })).toBe('ws://127.0.0.1:9000/remote/ws');
        expect(buildWebSocketUrl({ protocol: 'https:', host: 'tv.local' })).toBe('wss://tv.local/remote/ws');
    });

    it('computes dimmed state using defaultDelivered keys and registeredKeys', () => {
        for (const key of REMOTE_KEYS) {
            if (key.defaultDelivered) {
                expect(isKeyDimmed(key.name, [])).toBe(false);
            } else {
                expect(isKeyDimmed(key.name, [])).toBe(true);
                expect(isKeyDimmed(key.name, [key.name])).toBe(false);
            }
        }
    });

    it('returns the built public assets directory from remoteUiAssetsDir()', () => {
        expect(remoteUiAssetsDir().endsWith(path.join('packages', 'remote-ui', 'dist', 'public'))).toBe(true);
    });
});

describe('keyboard mapping', () => {
    it('maps physical keys to Tizen remote key names', () => {
        expect(mapKeyboardEvent({ key: 'ArrowUp' })).toBe('ArrowUp');
        expect(mapKeyboardEvent({ key: 'ArrowDown' })).toBe('ArrowDown');
        expect(mapKeyboardEvent({ key: 'ArrowLeft' })).toBe('ArrowLeft');
        expect(mapKeyboardEvent({ key: 'ArrowRight' })).toBe('ArrowRight');
        expect(mapKeyboardEvent({ key: 'Enter' })).toBe('Enter');
        expect(mapKeyboardEvent({ key: 'Backspace' })).toBe('Back');
        expect(mapKeyboardEvent({ key: 'Escape' })).toBe('Back');
        expect(mapKeyboardEvent({ key: '0' })).toBe('0');
        expect(mapKeyboardEvent({ key: '9' })).toBe('9');
        expect(mapKeyboardEvent({ key: ' ', code: 'Space' })).toBe('MediaPlayPause');
        expect(mapKeyboardEvent({ key: 'r' })).toBe('ColorF0Red');
        expect(mapKeyboardEvent({ key: 'G' })).toBe('ColorF1Green');
        expect(mapKeyboardEvent({ key: 'y' })).toBe('ColorF2Yellow');
        expect(mapKeyboardEvent({ key: 'B' })).toBe('ColorF3Blue');
        expect(mapKeyboardEvent({ key: '+' })).toBe('VolumeUp');
        expect(mapKeyboardEvent({ key: '=' })).toBe('VolumeUp');
        expect(mapKeyboardEvent({ key: '-' })).toBe('VolumeDown');
        expect(mapKeyboardEvent({ key: 'ArrowUp', metaKey: true })).toBeNull();
        expect(mapKeyboardEvent({ key: 'q' })).toBeNull();
    });
});

describe('remote-ui DOM controller', () => {
    it('renders accessible buttons for all remote keys matching REMOTE_KEYS', async () => {
        const dom = await loadRemoteDom();
        const buttons = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('[data-key]'));
        expect(buttons.length).toBeGreaterThanOrEqual(35);

        const validNames = new Set(REMOTE_KEYS.map((entry) => entry.name));
        for (const button of buttons) {
            expect(button.tagName).toBe('BUTTON');
            expect(button.getAttribute('aria-label')?.trim().length).toBeGreaterThan(0);
            expect(validNames.has(button.dataset.key ?? '')).toBe(true);
        }
    });

    it('sends down/up on mouse and keyboard events, dims unregistered keys, and manages app controls', async () => {
        const dom = await loadRemoteDom();
        const sent: RemoteUiClientMessage[] = [];
        const controller = createRemoteUiController(dom.window.document, (msg) => sent.push(msg));

        controller.applyServerMessage({
            type: 'state',
            profile: SAMPLE_PROFILE,
            apps: [SAMPLE_APP],
            running: 'demoPkg.DemoApp',
            registeredKeys: ['ColorF0Red'],
        });

        const doc = dom.window.document;
        expect(doc.querySelector('[data-role="profile-label"]')?.textContent).toBe(SAMPLE_PROFILE.label);
        expect(doc.querySelector('[data-role="running-app"]')?.textContent).toContain('Demo App');

        const enterBtn = doc.querySelector<HTMLButtonElement>('[data-key="Enter"]')!;
        const redBtn = doc.querySelector<HTMLButtonElement>('[data-key="ColorF0Red"]')!;
        const blueBtn = doc.querySelector<HTMLButtonElement>('[data-key="ColorF3Blue"]')!;
        expect(enterBtn.classList.contains('is-dimmed')).toBe(false);
        expect(redBtn.classList.contains('is-dimmed')).toBe(false);
        expect(blueBtn.classList.contains('is-dimmed')).toBe(true);
        expect(blueBtn.disabled).toBe(false);

        blueBtn.dispatchEvent(new dom.window.MouseEvent('mousedown', { button: 0, bubbles: true }));
        blueBtn.dispatchEvent(new dom.window.MouseEvent('mouseup', { button: 0, bubbles: true }));

        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true }));
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));

        const launchBtn = doc.querySelector<HTMLButtonElement>('[data-launch-app="demoPkg.DemoApp"]')!;
        launchBtn.click();

        const terminateBtn = doc.querySelector<HTMLButtonElement>('[data-action="terminate"]')!;
        expect(terminateBtn.disabled).toBe(false);
        terminateBtn.click();

        controller.applyServerMessage({ type: 'log', level: 'error', text: 'boom' });
        const logs = doc.querySelectorAll('.log-entry');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.classList.contains('log-error')).toBe(true);
        expect(logs[0]?.textContent).toBe('boom');

        expect(sent).toEqual([
            { type: 'key', key: 'ColorF3Blue', action: 'down' },
            { type: 'key', key: 'ColorF3Blue', action: 'up' },
            { type: 'key', key: 'Back', action: 'down' },
            { type: 'key', key: 'Back', action: 'up' },
            { type: 'launch', appId: 'demoPkg.DemoApp' },
            { type: 'terminate' },
        ]);

        controller.destroy();
    });
});
