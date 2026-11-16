import type { Bridge } from './bridge.js';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export class Logger {
    constructor(private readonly bridge: Bridge) {}

    log(level: LogLevel, text: string): void {
        try {
            if (this.bridge.available) {
                this.bridge.notify('console', 'log', [level, text]);
                return;
            }
        } catch {
            this.writeToPageConsole(level, text);
            return;
        }
        this.writeToPageConsole(level, text);
    }

    private writeToPageConsole(level: LogLevel, text: string): void {
        const consoleObject = window.console;
        if (!consoleObject) {
            return;
        }
        const method = consoleObject[level] || consoleObject.log;
        if (typeof method === 'function') {
            try {
                method.call(consoleObject, text);
            } catch {
                void 0;
            }
        }
    }
}
