import type {
    KeyAction,
    RemoteKeyName,
    RemoteUiClientMessage,
    RemoteUiServerMessage,
} from '@tvemu/protocol';

export const DEFAULT_DELIVERED_KEYS: ReadonlySet<string> = new Set([
    'ArrowLeft',
    'ArrowUp',
    'ArrowRight',
    'ArrowDown',
    'Enter',
    'Back',
]);

export function encodeClientMessage(message: RemoteUiClientMessage): string {
    return JSON.stringify(message);
}

export function decodeServerMessage(raw: string): RemoteUiServerMessage | null {
    try {
        const parsed = JSON.parse(raw) as RemoteUiServerMessage;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
            return null;
        }
        if (parsed.type === 'state' || parsed.type === 'log') {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

export function isKeyDimmed(key: RemoteKeyName, registeredKeys: readonly string[]): boolean {
    if (DEFAULT_DELIVERED_KEYS.has(key)) {
        return false;
    }
    return !registeredKeys.includes(key);
}

export interface KeyboardInputLike {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
}

export function mapKeyboardEvent(event: KeyboardInputLike): RemoteKeyName | null {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return null;
    }
    switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'ArrowRight':
        case 'ArrowDown':
        case 'Enter':
            return event.key;
        case 'Backspace':
        case 'Escape':
            return 'Back';
        case ' ':
        case 'Spacebar':
            return 'MediaPlayPause';
        case '+':
        case '=':
            return 'VolumeUp';
        case '-':
        case '_':
            return 'VolumeDown';
        case 'r':
        case 'R':
            return 'ColorF0Red';
        case 'g':
        case 'G':
            return 'ColorF1Green';
        case 'y':
        case 'Y':
            return 'ColorF2Yellow';
        case 'b':
        case 'B':
            return 'ColorF3Blue';
        default:
            if (/^[0-9]$/.test(event.key)) {
                return event.key;
            }
            if (event.code === 'Space') {
                return 'MediaPlayPause';
            }
            return null;
    }
}

export interface RemoteUiController {
    applyServerMessage(message: RemoteUiServerMessage): void;
    setConnected(connected: boolean): void;
    destroy(): void;
}

export function createRemoteUiController(
    root: ParentNode,
    sendMessage: (message: RemoteUiClientMessage) => void,
): RemoteUiController {
    const maybeDoc = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    if (!maybeDoc) {
        throw new Error('Remote UI root must belong to a Document');
    }
    const doc: Document = maybeDoc;

    const profileLabelEl = root.querySelector<HTMLElement>('[data-role="profile-label"]');
    const profileMetaEl = root.querySelector<HTMLElement>('[data-role="profile-meta"]');
    const runningAppEl = root.querySelector<HTMLElement>('[data-role="running-app"]');
    const appListEl = root.querySelector<HTMLElement>('[data-role="app-list"]');
    const logListEl = root.querySelector<HTMLElement>('[data-role="log-list"]');
    const terminateBtn = root.querySelector<HTMLButtonElement>('[data-action="terminate"]');
    const statusPill = root.querySelector<HTMLElement>('[data-role="connection-status"]');
    const keyButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-key]'));

    let pressedKeyButton: { key: RemoteKeyName; button: HTMLButtonElement } | null = null;
    const pressedPhysicalKeys = new Map<string, RemoteKeyName>();

    function sendKey(key: RemoteKeyName, action: KeyAction): void {
        sendMessage({ type: 'key', key, action });
    }

    function releasePressedButton(): void {
        if (!pressedKeyButton) {
            return;
        }
        const { key, button } = pressedKeyButton;
        pressedKeyButton = null;
        button.classList.remove('is-pressed');
        sendKey(key, 'up');
    }

    const buttonCleanups: Array<() => void> = [];
    for (const button of keyButtons) {
        const key = button.dataset.key;
        if (!key) {
            continue;
        }
        const onMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            releasePressedButton();
            pressedKeyButton = { key, button };
            button.classList.add('is-pressed');
            sendKey(key, 'down');
        };
        const onMouseUp = () => {
            if (pressedKeyButton?.button === button) {
                releasePressedButton();
            }
        };
        const onMouseLeave = () => {
            if (pressedKeyButton?.button === button) {
                releasePressedButton();
            }
        };
        const onTouchStart = (event: TouchEvent) => {
            event.preventDefault();
            releasePressedButton();
            pressedKeyButton = { key, button };
            button.classList.add('is-pressed');
            sendKey(key, 'down');
        };
        const onTouchEnd = (event: TouchEvent) => {
            event.preventDefault();
            if (pressedKeyButton?.button === button) {
                releasePressedButton();
            }
        };

        button.addEventListener('mousedown', onMouseDown);
        button.addEventListener('mouseup', onMouseUp);
        button.addEventListener('mouseleave', onMouseLeave);
        button.addEventListener('touchstart', onTouchStart);
        button.addEventListener('touchend', onTouchEnd);
        button.addEventListener('touchcancel', onTouchEnd);

        buttonCleanups.push(() => {
            button.removeEventListener('mousedown', onMouseDown);
            button.removeEventListener('mouseup', onMouseUp);
            button.removeEventListener('mouseleave', onMouseLeave);
            button.removeEventListener('touchstart', onTouchStart);
            button.removeEventListener('touchend', onTouchEnd);
            button.removeEventListener('touchcancel', onTouchEnd);
        });
    }

    const onWindowMouseUp = () => {
        releasePressedButton();
    };

    const onTerminateClick = () => {
        sendMessage({ type: 'terminate' });
    };
    terminateBtn?.addEventListener('click', onTerminateClick);

    const onKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
            return;
        }
        const mapped = mapKeyboardEvent(event);
        if (!mapped) {
            return;
        }
        event.preventDefault();
        if (event.repeat || pressedPhysicalKeys.has(event.key)) {
            return;
        }
        pressedPhysicalKeys.set(event.key, mapped);
        sendKey(mapped, 'down');
    };

    const onKeyUp = (event: KeyboardEvent) => {
        const mapped = pressedPhysicalKeys.get(event.key);
        if (!mapped) {
            return;
        }
        event.preventDefault();
        pressedPhysicalKeys.delete(event.key);
        sendKey(mapped, 'up');
    };

    const onWindowBlur = () => {
        releasePressedButton();
        for (const mapped of pressedPhysicalKeys.values()) {
            sendKey(mapped, 'up');
        }
        pressedPhysicalKeys.clear();
    };

    const win = doc.defaultView;
    win?.addEventListener('mouseup', onWindowMouseUp);
    win?.addEventListener('keydown', onKeyDown);
    win?.addEventListener('keyup', onKeyUp);
    win?.addEventListener('blur', onWindowBlur);

    function renderState(message: Extract<RemoteUiServerMessage, { type: 'state' }>): void {
        if (profileLabelEl) {
            profileLabelEl.textContent = message.profile.label;
        }
        if (profileMetaEl) {
            profileMetaEl.textContent =
                `Tizen ${message.profile.tizenVersion} · Chromium M${message.profile.chromiumMilestone} · ` +
                `${message.profile.width}x${message.profile.height}`;
        }
        if (runningAppEl) {
            const runningEntry = message.apps.find((app) => app.manifest.appId === message.running);
            runningAppEl.textContent = runningEntry
                ? `${runningEntry.manifest.name} (${runningEntry.manifest.appId})`
                : message.running ?? 'None';
        }
        if (terminateBtn) {
            terminateBtn.disabled = message.running === null;
        }
        for (const button of keyButtons) {
            const key = button.dataset.key;
            if (!key) {
                continue;
            }
            button.classList.toggle('is-dimmed', isKeyDimmed(key, message.registeredKeys));
        }
        if (appListEl) {
            appListEl.innerHTML = '';
            if (message.apps.length === 0) {
                const empty = doc.createElement('li');
                empty.className = 'app-id';
                empty.textContent = 'No installed apps';
                appListEl.appendChild(empty);
            } else {
                for (const app of message.apps) {
                    const item = doc.createElement('li');
                    item.className = 'app-item';

                    const info = doc.createElement('div');
                    info.className = 'app-info';

                    const nameEl = doc.createElement('span');
                    nameEl.className = 'app-name';
                    nameEl.textContent = app.manifest.name;

                    const idEl = doc.createElement('span');
                    idEl.className = 'app-id';
                    idEl.textContent = app.manifest.appId;

                    info.append(nameEl, idEl);

                    const launchBtn = doc.createElement('button');
                    launchBtn.type = 'button';
                    launchBtn.className = 'action-button';
                    launchBtn.textContent = 'Launch';
                    launchBtn.setAttribute('aria-label', `Launch ${app.manifest.name}`);
                    launchBtn.dataset.launchApp = app.manifest.appId;
                    launchBtn.addEventListener('click', () => {
                        sendMessage({ type: 'launch', appId: app.manifest.appId });
                    });

                    item.append(info, launchBtn);
                    appListEl.appendChild(item);
                }
            }
        }
    }

    function appendLog(message: Extract<RemoteUiServerMessage, { type: 'log' }>): void {
        if (!logListEl) {
            return;
        }
        const entry = doc.createElement('div');
        entry.className = `log-entry log-${message.level}`;
        entry.textContent = message.text;
        logListEl.appendChild(entry);
        while (logListEl.childElementCount > 500) {
            logListEl.firstElementChild?.remove();
        }
        logListEl.scrollTop = logListEl.scrollHeight;
    }

    return {
        applyServerMessage(message: RemoteUiServerMessage): void {
            if (message.type === 'state') {
                renderState(message);
            } else if (message.type === 'log') {
                appendLog(message);
            }
        },

        setConnected(connected: boolean): void {
            if (!statusPill) {
                return;
            }
            statusPill.textContent = connected ? 'Connected' : 'Disconnected';
            statusPill.classList.toggle('is-connected', connected);
        },

        destroy(): void {
            for (const cleanup of buttonCleanups) {
                cleanup();
            }
            terminateBtn?.removeEventListener('click', onTerminateClick);
            win?.removeEventListener('mouseup', onWindowMouseUp);
            win?.removeEventListener('keydown', onKeyDown);
            win?.removeEventListener('keyup', onKeyUp);
            win?.removeEventListener('blur', onWindowBlur);
        },
    };
}

export function buildWebSocketUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
    const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${loc.host}/remote/ws`;
}

export function connectRemoteUi(options?: {
    root?: ParentNode;
    createSocket?: (url: string) => WebSocket;
    url?: string;
}): { controller: RemoteUiController; close: () => void } {
    const root = options?.root ?? document;
    const url = options?.url ?? buildWebSocketUrl(window.location);
    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const controller = createRemoteUiController(root, (message) => {
        if (socket && socket.readyState === 1) {
            socket.send(encodeClientMessage(message));
        }
    });

    function openSocket(): void {
        if (closed) {
            return;
        }
        socket = options?.createSocket ? options.createSocket(url) : new WebSocket(url);
        socket.addEventListener('open', () => {
            controller.setConnected(true);
            socket?.send(encodeClientMessage({ type: 'hello' }));
        });
        socket.addEventListener('message', (event) => {
            if (typeof event.data !== 'string') {
                return;
            }
            const parsed = decodeServerMessage(event.data);
            if (parsed) {
                controller.applyServerMessage(parsed);
            }
        });
        socket.addEventListener('close', () => {
            controller.setConnected(false);
            if (!closed) {
                reconnectTimer = setTimeout(openSocket, 1000);
            }
        });
    }

    openSocket();

    return {
        controller,
        close(): void {
            closed = true;
            if (reconnectTimer !== null) {
                clearTimeout(reconnectTimer);
            }
            controller.destroy();
            socket?.close();
        },
    };
}

if (typeof document !== 'undefined' && document.getElementById('remote-root')) {
    connectRemoteUi();
}
