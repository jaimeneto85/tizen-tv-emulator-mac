import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import {
    BRIDGE_RECEIVE_FUNCTION,
    BRIDGE_SEND_BINDING,
    type BridgeEvent,
    type BridgeRequest,
    type BridgeResponse,
    type Engine,
    type EngineStartOptions,
    type KeyAction,
} from '@tvemu/protocol';
import {
    CdpClient,
    type DevToolsEndpoint,
    fetchPageTargetWsUrl,
    parseDevToolsAnnouncement,
    waitForDevToolsActivePort,
} from './cdp.js';
import { buildChromiumLaunchArgs, cleanStaleUserDataLocks } from './launch-args.js';
import { readExecutableVersion } from './plist.js';

export interface ChromiumEngineOptions {
    executablePath: string;
    allowCrossOrigin?: boolean;
    log?: (line: string) => void;
}

function formatRemoteObject(arg: Record<string, unknown>): string {
    if (typeof arg.value === 'string') {
        return arg.value;
    }
    if (arg.value !== undefined) {
        try {
            return JSON.stringify(arg.value);
        } catch {
            return String(arg.value);
        }
    }
    if (typeof arg.description === 'string') {
        return arg.description;
    }
    if (typeof arg.unserializableValue === 'string') {
        return arg.unserializableValue;
    }
    return String(arg.type ?? 'unknown');
}

function buildSyntheticKeyDispatchExpression(type: 'keydown' | 'keyup', code: number, keyName: string): string {
    return `(function () {
        var target = document.activeElement || document.body || document.documentElement || window;
        var event = new KeyboardEvent(${JSON.stringify(type)}, {
            key: ${JSON.stringify(keyName)},
            code: ${JSON.stringify(keyName)},
            bubbles: true,
            cancelable: true
        });
        Object.defineProperty(event, 'keyCode', { get: function () { return ${code}; } });
        Object.defineProperty(event, 'which', { get: function () { return ${code}; } });
        target.dispatchEvent(event);
    })();`;
}

export function createChromiumEngine(options: ChromiumEngineOptions): Engine {
    let child: ChildProcess | null = null;
    let cdp: CdpClient | null = null;
    let exitReason: string | null = null;
    let stopping = false;
    let exitNotified = false;
    let milestone: number | null = null;
    let forceSyntheticKeys = false;

    const bindingListeners = new Set<(message: BridgeRequest) => void>();
    const exitListeners = new Set<(reason: string) => void>();

    function notifyExit(reason: string): void {
        if (exitNotified) {
            return;
        }
        exitNotified = true;
        exitReason = reason;
        for (const listener of exitListeners) {
            listener(reason);
        }
    }

    function logLine(line: string): void {
        options.log?.(line);
    }

    async function sendKeyStep(code: number, keyName: string, action: 'down' | 'up'): Promise<void> {
        if (!cdp) {
            throw new Error('Engine is not started');
        }
        const cdpType = action === 'down' ? 'rawKeyDown' : 'keyUp';
        const domType = action === 'down' ? 'keydown' : 'keyup';

        if (!forceSyntheticKeys) {
            try {
                await cdp.send('Input.dispatchKeyEvent', {
                    type: cdpType,
                    windowsVirtualKeyCode: code,
                    nativeVirtualKeyCode: code,
                    key: keyName,
                });
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logLine(`[engine] Input.dispatchKeyEvent fallback (${message})`);
            }
        }

        await evaluateExpression<void>(buildSyntheticKeyDispatchExpression(domType, code, keyName));
    }

    async function evaluateExpression<T>(expression: string): Promise<T> {
        if (!cdp) {
            throw new Error('Engine is not started');
        }
        const result = await cdp.send<{
            result?: { value?: T };
            exceptionDetails?: { text?: string; exception?: { description?: string } };
        }>('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (result.exceptionDetails) {
            const detail =
                result.exceptionDetails.exception?.description ??
                result.exceptionDetails.text ??
                'Evaluation failed';
            throw new Error(detail);
        }
        return result.result?.value as T;
    }

    async function probeKeyCodeDelivery(): Promise<boolean> {
        const probeCode = 10009;
        await evaluateExpression<void>(
            `window.__tvemuKeyProbe = null;
            window.__tvemuKeyProbeHandler = function (e) { window.__tvemuKeyProbe = e.keyCode; };
            window.addEventListener('keydown', window.__tvemuKeyProbeHandler, true);`,
        );
        try {
            if (!cdp) {
                return false;
            }
            await cdp.send('Input.dispatchKeyEvent', {
                type: 'rawKeyDown',
                windowsVirtualKeyCode: probeCode,
                nativeVirtualKeyCode: probeCode,
                key: 'Back',
            });
            await cdp.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                windowsVirtualKeyCode: probeCode,
                nativeVirtualKeyCode: probeCode,
                key: 'Back',
            });
            const observed = await evaluateExpression<number | null>('window.__tvemuKeyProbe');
            return observed === probeCode;
        } catch {
            return false;
        } finally {
            await evaluateExpression<void>(
                `if (window.__tvemuKeyProbeHandler) {
                    window.removeEventListener('keydown', window.__tvemuKeyProbeHandler, true);
                }
                delete window.__tvemuKeyProbe;
                delete window.__tvemuKeyProbeHandler;`,
            ).catch(() => {});
        }
    }

    return {
        async start(startOptions: EngineStartOptions): Promise<void> {
            if (child || cdp) {
                throw new Error('Engine is already started');
            }
            stopping = false;
            exitNotified = false;
            exitReason = null;
            forceSyntheticKeys = false;

            const versionInfo = await readExecutableVersion(options.executablePath);
            milestone = versionInfo?.majorMilestone ?? startOptions.profile.chromiumMilestone;

            await mkdir(startOptions.userDataDir, { recursive: true });
            await cleanStaleUserDataLocks(startOptions.userDataDir);

            const args = buildChromiumLaunchArgs({
                profile: startOptions.profile,
                userDataDir: startOptions.userDataDir,
                headless: startOptions.headless,
                scale: startOptions.scale,
                allowCrossOrigin: options.allowCrossOrigin,
                milestone,
            });

            let announcedEndpoint: DevToolsEndpoint | null = null;
            const spawned = spawn(options.executablePath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child = spawned;

            spawned.stdout?.on('data', (chunk: Buffer) => {
                for (const line of chunk.toString().split(/\r?\n/)) {
                    if (line.trim()) {
                        logLine(`[chromium:stdout] ${line}`);
                    }
                }
            });
            spawned.stderr?.on('data', (chunk: Buffer) => {
                for (const line of chunk.toString().split(/\r?\n/)) {
                    if (line.trim()) {
                        announcedEndpoint = announcedEndpoint ?? parseDevToolsAnnouncement(line);
                        logLine(`[chromium:stderr] ${line}`);
                    }
                }
            });

            spawned.on('error', (error) => {
                notifyExit(`Chromium process error: ${error.message}`);
            });
            spawned.on('exit', (code, signal) => {
                if (stopping) {
                    notifyExit('Stopped');
                    return;
                }
                const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
                notifyExit(`Chromium exited with ${detail}`);
            });

            const endpoint = await waitForDevToolsActivePort(
                startOptions.userDataDir,
                () => exitReason,
                15000,
                () => announcedEndpoint,
            ).catch((error: unknown) => {
                spawned.kill('SIGKILL');
                throw error;
            });
            const pageWsUrl = await fetchPageTargetWsUrl(endpoint.port);
            const client = await CdpClient.connect(pageWsUrl);
            cdp = client;

            client.onClose((reason) => {
                if (!stopping) {
                    notifyExit(reason);
                }
            });

            await client.send('Page.enable');
            await client.send('Runtime.enable');
            await client.send('Network.enable');

            await client.send('Network.setUserAgentOverride', {
                userAgent: startOptions.profile.userAgent,
            });

            const scale = startOptions.scale ?? 1;
            const metricsParams: Record<string, unknown> = {
                width: startOptions.profile.width,
                height: startOptions.profile.height,
                deviceScaleFactor: 1,
                mobile: false,
                scale,
            };
            try {
                await client.send('Emulation.setDeviceMetricsOverride', metricsParams);
            } catch {
                delete metricsParams.scale;
                await client.send('Emulation.setDeviceMetricsOverride', metricsParams);
            }

            await client.send('Emulation.setCPUThrottlingRate', {
                rate: startOptions.profile.cpuThrottle,
            });

            if (startOptions.windowTitle) {
                await evaluateExpression<void>(
                    `document.title = ${JSON.stringify(startOptions.windowTitle)};`,
                ).catch(() => {});
            }

            client.on('Runtime.bindingCalled', (params) => {
                if (params.name !== BRIDGE_SEND_BINDING || typeof params.payload !== 'string') {
                    return;
                }
                let parsed: BridgeRequest;
                try {
                    parsed = JSON.parse(params.payload) as BridgeRequest;
                } catch {
                    logLine(`[engine] invalid bridge payload: ${params.payload}`);
                    return;
                }
                for (const listener of bindingListeners) {
                    listener(parsed);
                }
            });

            client.on('Runtime.consoleAPICalled', (params) => {
                const level = typeof params.type === 'string' ? params.type : 'log';
                const args = Array.isArray(params.args)
                    ? (params.args as Record<string, unknown>[]).map(formatRemoteObject).join(' ')
                    : '';
                logLine(`[page:${level}] ${args}`);
            });

            client.on('Runtime.exceptionThrown', (params) => {
                const details = params.exceptionDetails as
                    | { text?: string; exception?: { description?: string } }
                    | undefined;
                const text = details?.exception?.description ?? details?.text ?? 'Uncaught exception';
                logLine(`[page:exception] ${text}`);
            });

            await client.send('Runtime.addBinding', { name: BRIDGE_SEND_BINDING });

            for (const source of startOptions.injectedScripts) {
                await client.send('Page.addScriptToEvaluateOnNewDocument', { source });
            }

            const nativeKeyCodeWorks = await probeKeyCodeDelivery();
            if (!nativeKeyCodeWorks) {
                forceSyntheticKeys = true;
                logLine('[engine] Input.dispatchKeyEvent did not preserve keyCode 10009; using synthetic KeyboardEvent fallback');
            }
        },

        async navigate(url: string): Promise<void> {
            if (!cdp) {
                throw new Error('Engine is not started');
            }
            const client = cdp;
            let unsubscribe = () => {};
            const loadPromise = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    unsubscribe();
                    reject(new Error(`Timed out waiting for page load: ${url}`));
                }, 30000);
                unsubscribe = client.on('Page.loadEventFired', () => {
                    clearTimeout(timer);
                    unsubscribe();
                    resolve();
                });
            });

            const navResult = await client.send<{ errorText?: string }>('Page.navigate', { url });
            if (navResult.errorText) {
                unsubscribe();
                throw new Error(`Navigation failed (${url}): ${navResult.errorText}`);
            }
            await loadPromise;
        },

        async dispatchKey(code: number, keyName: string, action: KeyAction): Promise<void> {
            if (action === 'press') {
                await sendKeyStep(code, keyName, 'down');
                await sendKeyStep(code, keyName, 'up');
                return;
            }
            await sendKeyStep(code, keyName, action);
        },

        evaluate<T>(expression: string): Promise<T> {
            return evaluateExpression<T>(expression);
        },

        onBindingCall(listener: (message: BridgeRequest) => void): void {
            bindingListeners.add(listener);
        },

        async resolveBinding(response: BridgeResponse): Promise<void> {
            const encoded = JSON.stringify(JSON.stringify(response));
            await evaluateExpression<void>(
                `if (typeof window[${JSON.stringify(BRIDGE_RECEIVE_FUNCTION)}] === 'function') {
                    window[${JSON.stringify(BRIDGE_RECEIVE_FUNCTION)}](${encoded});
                }`,
            );
        },

        async emitEvent(event: BridgeEvent): Promise<void> {
            const encoded = JSON.stringify(JSON.stringify(event));
            await evaluateExpression<void>(
                `if (typeof window[${JSON.stringify(BRIDGE_RECEIVE_FUNCTION)}] === 'function') {
                    window[${JSON.stringify(BRIDGE_RECEIVE_FUNCTION)}](${encoded});
                }`,
            );
        },

        async screenshot(): Promise<Buffer> {
            if (!cdp) {
                throw new Error('Engine is not started');
            }
            const result = await cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
            return Buffer.from(result.data, 'base64');
        },

        onExit(listener: (reason: string) => void): void {
            exitListeners.add(listener);
        },

        async stop(): Promise<void> {
            stopping = true;
            const activeClient = cdp;
            const activeChild = child;
            cdp = null;
            child = null;

            if (activeClient) {
                await activeClient.close().catch(() => {});
            }

            if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
                await new Promise<void>((resolve) => {
                    const killTimer = setTimeout(() => {
                        if (activeChild.exitCode === null && activeChild.signalCode === null) {
                            activeChild.kill('SIGKILL');
                        }
                    }, 2000);
                    activeChild.once('exit', () => {
                        clearTimeout(killTimer);
                        resolve();
                    });
                    activeChild.kill('SIGTERM');
                });
            }

            notifyExit('Stopped');
        },
    };
}
