import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { InstalledApp } from '@tvemu/protocol';
import { formatUiSnapshot, type UiSnapshot } from './agent.js';
import { callControl, requireRunning, startDetached } from './control-client.js';
import { readRunState } from './run-file.js';

interface ToolContent {
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
}

interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    run(args: Record<string, unknown>): Promise<ToolContent[]>;
}

const text = (value: string): ToolContent[] => [{ type: 'text', text: value }];

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
    const value = args[name];
    return typeof value === 'string' && value !== '' ? value : undefined;
}

function describeApp(app: InstalledApp): string {
    return `${app.manifest.kind ?? 'wgt'} ${app.manifest.appId} "${app.manifest.name}" v${app.manifest.version}`;
}

export function createMcpTools(home: string, env: NodeJS.ProcessEnv): ToolDefinition[] {
    const settledScreen = async (): Promise<string> => {
        const state = await requireRunning(home);
        try {
            const result = await callControl<{ snapshot: UiSnapshot }>(state, 'wait', { timeoutMs: 3000 });
            return formatUiSnapshot(result.snapshot);
        } catch (error) {
            const status = await callControl<{ running: InstalledApp | null }>(state, 'status');
            if (!status.running) {
                return 'No app is running (the app exited).';
            }
            return error instanceof Error ? error.message : String(error);
        }
    };

    return [
        {
            name: 'tv_start',
            description:
                'Start the TV emulator in the background. With "target" (a .wgt or .tpk file, or an installed app id) the app is installed and launched. Returns the first screen as text.',
            inputSchema: {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'Path to a .wgt/.tpk package, or an installed app or package id.' },
                    profile: { type: 'string', description: 'Device profile, e.g. tizen-5.5 or tizen-10.0. Default: best available.' },
                    visible: { type: 'boolean', description: 'Open a visible window and the remote control instead of running headless.' },
                    mapOrigin: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'For .NET apps: serve an HTTP origin from a local server, e.g. https://api.example.com=http://127.0.0.1:4000.',
                    },
                },
            },
            async run(args) {
                const cli: string[] = [];
                const target = stringArg(args, 'target');
                if (target) cli.push(target);
                const profile = stringArg(args, 'profile');
                if (profile) cli.push('--profile', profile);
                if (args.visible !== true) cli.push('--headless', '--no-remote');
                if (Array.isArray(args.mapOrigin)) {
                    for (const entry of args.mapOrigin) {
                        if (typeof entry === 'string') cli.push('--map-origin', entry);
                    }
                }
                const started = await startDetached(home, target ? 'run' : 'start', cli, env);
                const head = `Emulator started (pid ${started.pid}). Log: ${started.logPath}`;
                return text(started.running ? `${head}\nRunning ${describeApp(started.running)}\n\n${await settledScreen()}` : head);
            },
        },
        {
            name: 'tv_stop',
            description: 'Stop the TV emulator and the running app.',
            inputSchema: { type: 'object', properties: {} },
            async run() {
                const state = await readRunState(home);
                if (!state) return text('The emulator was not running.');
                await callControl(state, 'stop');
                return text('Emulator stopped.');
            },
        },
        {
            name: 'tv_status',
            description: 'Report whether the emulator is running, the device profile, the running app and the installed apps.',
            inputSchema: { type: 'object', properties: {} },
            async run() {
                const state = await readRunState(home);
                if (!state) return text('The emulator is not running. Use tv_start.');
                const status = await callControl<{ running: InstalledApp | null; apps: InstalledApp[]; profile: { name: string; label?: string } }>(state, 'status');
                return text(
                    [
                        `Emulator running (pid ${state.pid}), profile ${status.profile.name}.`,
                        status.running ? `Running app: ${describeApp(status.running)}` : 'No app is running.',
                        `Installed apps:\n${status.apps.map((app) => `  ${describeApp(app)}`).join('\n') || '  none'}`,
                    ].join('\n'),
                );
            },
        },
        {
            name: 'tv_launch',
            description: 'Install (when given a .wgt/.tpk path) and launch an app on the running emulator. Returns the first screen as text.',
            inputSchema: {
                type: 'object',
                properties: { target: { type: 'string', description: 'Package path, app id or package id.' } },
                required: ['target'],
            },
            async run(args) {
                const target = stringArg(args, 'target');
                if (!target) throw new Error('target is required');
                const state = await requireRunning(home);
                let appId = target;
                if (/\.(wgt|tpk)$/i.test(target)) {
                    const installed = await callControl<{ app: InstalledApp }>(state, 'install', { wgtPath: path.resolve(target) });
                    appId = installed.app.manifest.appId;
                }
                await callControl(state, 'launch', { appId });
                return text(`Launched ${appId}\n\n${await settledScreen()}`);
            },
        },
        {
            name: 'tv_key',
            description:
                'Press remote control keys in order (ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter, Back, MediaPlayPause, MediaPlay, MediaPause, MediaStop, MediaRewind, MediaFastForward, 0-9, ColorF0Red...). Returns the resulting screen as text.',
            inputSchema: {
                type: 'object',
                properties: {
                    keys: { type: 'array', items: { type: 'string' }, description: 'Key names, pressed one after another.' },
                    delayMs: { type: 'number', description: 'Pause between keys. Default 150.' },
                },
                required: ['keys'],
            },
            async run(args) {
                const keys = Array.isArray(args.keys) ? args.keys.filter((key): key is string => typeof key === 'string') : [];
                if (keys.length === 0) throw new Error('keys must list at least one key name');
                const delayMs = typeof args.delayMs === 'number' ? args.delayMs : 150;
                const state = await requireRunning(home);
                for (const key of keys) {
                    await callControl(state, 'key', { key, action: 'press' });
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
                return text(await settledScreen());
            },
        },
        {
            name: 'tv_focus',
            description:
                'Move the focus to the element showing the given text using only arrow keys, as a person with the remote would. Set press to also press Enter on it. Returns the resulting screen as text.',
            inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' }, press: { type: 'boolean', description: 'Press Enter once focused.' } },
                required: ['text'],
            },
            async run(args) {
                if (typeof args.text !== 'string') throw new Error('text is required');
                const state = await requireRunning(home);
                await callControl(state, 'focus', { text: args.text });
                if (args.press === true) {
                    await callControl(state, 'key', { key: 'Enter', action: 'press' });
                }
                return text(await settledScreen());
            },
        },
        {
            name: 'tv_type',
            description:
                'Type text into the focused text field, as the TV on-screen keyboard would. If the field is focused but not open, Enter is pressed first. Returns the resulting screen as text.',
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string' },
                    append: { type: 'boolean', description: 'Append instead of replacing the current value.' },
                },
                required: ['text'],
            },
            async run(args) {
                if (typeof args.text !== 'string') throw new Error('text is required');
                const state = await requireRunning(home);
                await callControl(state, 'type', { text: args.text, mode: args.append === true ? 'append' : 'replace' });
                return text(await settledScreen());
            },
        },
        {
            name: 'tv_screen',
            description:
                'Read the current screen as text: focused element, visible texts with positions, text fields, images (and whether they loaded) and video playback state. Lines starting with ">" are inside the focused element.',
            inputSchema: { type: 'object', properties: { json: { type: 'boolean', description: 'Return the raw JSON snapshot.' } } },
            async run(args) {
                const state = await requireRunning(home);
                const result = await callControl<{ snapshot: UiSnapshot }>(state, 'ui');
                return text(args.json === true ? JSON.stringify(result.snapshot) : formatUiSnapshot(result.snapshot));
            },
        },
        {
            name: 'tv_wait',
            description:
                'Wait until a text appears, a text disappears, the focus is on an element containing a text, or the app exits. With no condition, waits for the screen to stop changing. Returns the screen, or an error with the last screen on timeout.',
            inputSchema: {
                type: 'object',
                properties: {
                    text: { type: 'string' },
                    gone: { type: 'string' },
                    focus: { type: 'string' },
                    exited: { type: 'boolean' },
                    timeoutMs: { type: 'number', description: 'Default 10000.' },
                },
            },
            async run(args) {
                const state = await requireRunning(home);
                const result = await callControl<{ snapshot: UiSnapshot; running: InstalledApp | null }>(state, 'wait', {
                    text: stringArg(args, 'text'),
                    gone: stringArg(args, 'gone'),
                    focus: stringArg(args, 'focus'),
                    exited: args.exited === true,
                    timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
                });
                return text(result.running ? formatUiSnapshot(result.snapshot) : 'No app is running (the app exited).');
            },
        },
        {
            name: 'tv_screenshot',
            description: 'Capture the TV screen as a PNG image. With "path" the image is also saved to that file.',
            inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
            async run(args) {
                const state = await requireRunning(home);
                const result = await callControl<{ pngBase64: string }>(state, 'screenshot');
                const content: ToolContent[] = [{ type: 'image', data: result.pngBase64, mimeType: 'image/png' }];
                const target = stringArg(args, 'path');
                if (target) {
                    const resolved = path.resolve(target);
                    await writeFile(resolved, Buffer.from(result.pngBase64, 'base64'));
                    content.push({ type: 'text', text: `Saved to ${resolved}` });
                }
                return content;
            },
        },
        {
            name: 'tv_logs',
            description: 'Read emulator and app log lines (console output, runtime errors, missing APIs). Pass the last "seq" seen as "since" to get only newer lines.',
            inputSchema: { type: 'object', properties: { since: { type: 'number' }, includeEngine: { type: 'boolean' } } },
            async run(args) {
                const state = await requireRunning(home);
                const result = await callControl<{ logs: { seq: number; line: string }[] }>(state, 'logs', {
                    since: typeof args.since === 'number' ? args.since : 0,
                });
                const lines = result.logs.filter((entry) => args.includeEngine === true || !entry.line.includes('[chromium:stderr]'));
                return text(lines.map((entry) => `${entry.seq}\t${entry.line}`).join('\n') || 'No log lines.');
            },
        },
    ];
}

export async function runMcpServer(home: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
    const tools = createMcpTools(home, env);
    const send = (message: Record<string, unknown>): void => {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
    };
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
        if (!line.trim()) continue;
        let request: { id?: unknown; method?: string; params?: Record<string, unknown> };
        try {
            request = JSON.parse(line);
        } catch {
            send({ id: null, error: { code: -32700, message: 'Parse error' } });
            continue;
        }
        const { id, method, params } = request;
        if (id === undefined || id === null) continue;
        if (method === 'initialize') {
            send({
                id,
                result: {
                    protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'tvemu', version: '0.1.0' },
                    instructions:
                        'Drive a Samsung Smart TV emulator. Start with tv_start, navigate with tv_key (the result is the new screen), read with tv_screen, and prefer tv_wait over sleeping.',
                },
            });
        } else if (method === 'ping') {
            send({ id, result: {} });
        } else if (method === 'tools/list') {
            send({ id, result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
        } else if (method === 'tools/call') {
            const tool = tools.find((candidate) => candidate.name === params?.name);
            if (!tool) {
                send({ id, error: { code: -32602, message: `Unknown tool: ${String(params?.name)}` } });
                continue;
            }
            try {
                const args = params?.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
                send({ id, result: { content: await tool.run(args) } });
            } catch (error) {
                send({ id, result: { content: text(error instanceof Error ? error.message : String(error)), isError: true } });
            }
        } else {
            send({ id, error: { code: -32601, message: `Method not found: ${String(method)}` } });
        }
    }
}
