import type { NuiImePanel } from '@tvemu/protocol';

export interface VirtualKeyboardState {
    open: boolean;
    key: string | null;
    page: 'letters' | 'symbols';
    shift: boolean;
}

export interface VirtualKeyboard {
    show: (input: HTMLInputElement, panel: NuiImePanel) => void;
    hide: () => void;
    isOpen: () => boolean;
    handleKey: (code: number) => boolean;
    state: () => VirtualKeyboardState;
    destroy: () => void;
}

type KeyAction = 'char' | 'shift' | 'page' | 'space' | 'backspace' | 'clear' | 'done';

interface KeySpec {
    action: KeyAction;
    label: string;
    value: string;
    span: number;
}

const COLUMNS = 10;
const KEY_SIZE = 96;
const KEY_GAP = 10;
const PANEL_PADDING = 24;

const LETTER_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl@', 'zxcvbnm._-'];
const SYMBOL_ROWS = ['!@#$%^&*()', '~`+={}[]|\\', ':;"\'<>,.?/', '_-€£¥°§¿¡•'];

function charKey(value: string): KeySpec {
    return { action: 'char', label: value, value, span: 1 };
}

function shortcutFor(panel: NuiImePanel): KeySpec {
    if (panel === 'email') {
        return { action: 'char', label: '.com', value: '.com', span: 1 };
    }
    if (panel === 'url') {
        return { action: 'char', label: '/', value: '/', span: 1 };
    }
    return { action: 'clear', label: 'Clear', value: '', span: 1 };
}

function buildRows(page: 'letters' | 'symbols', panel: NuiImePanel): KeySpec[][] {
    const source = page === 'letters' ? LETTER_ROWS : SYMBOL_ROWS;
    const rows = source.map((row) => Array.from(row).map(charKey));
    rows.push([
        { action: 'shift', label: 'Shift', value: '', span: 2 },
        { action: 'page', label: page === 'letters' ? '#+=' : 'abc', value: '', span: 1 },
        { action: 'space', label: 'Space', value: ' ', span: 3 },
        shortcutFor(panel),
        { action: 'backspace', label: 'Delete', value: '', span: 1 },
        { action: 'done', label: 'Done', value: '', span: 2 },
    ]);
    return rows;
}

function keyIndexAtColumn(row: KeySpec[], column: number): number {
    let start = 0;
    for (let index = 0; index < row.length; index += 1) {
        const key = row[index];
        if (!key) {
            continue;
        }
        if (column < start + key.span) {
            return index;
        }
        start += key.span;
    }
    return row.length - 1;
}

function columnOfKey(row: KeySpec[], index: number): number {
    let start = 0;
    for (let cursor = 0; cursor < index; cursor += 1) {
        const key = row[cursor];
        start += key ? key.span : 0;
    }
    return start;
}

export function createVirtualKeyboard(doc: Document, stageEl: HTMLElement): VirtualKeyboard {
    const panelEl = doc.createElement('div');
    panelEl.setAttribute('data-tvemu-keyboard', '');
    panelEl.style.position = 'absolute';
    panelEl.style.left = '50%';
    panelEl.style.boxSizing = 'border-box';
    panelEl.style.padding = `${PANEL_PADDING}px`;
    panelEl.style.background = 'rgba(24, 24, 26, 0.97)';
    panelEl.style.borderRadius = '18px';
    panelEl.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.6)';
    panelEl.style.zIndex = '2147483000';
    panelEl.style.display = 'none';
    panelEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    panelEl.style.userSelect = 'none';
    const width = COLUMNS * KEY_SIZE + (COLUMNS - 1) * KEY_GAP + PANEL_PADDING * 2;
    panelEl.style.width = `${width}px`;
    panelEl.style.marginLeft = `${-width / 2}px`;

    let target: HTMLInputElement | null = null;
    let panel: NuiImePanel = 'normal';
    let page: 'letters' | 'symbols' = 'letters';
    let shift = false;
    let rows: KeySpec[][] = buildRows(page, panel);
    let rowIndex = 1;
    let keyIndex = 0;
    let column = 0;
    let attached = false;

    function currentKey(): KeySpec | null {
        const row = rows[rowIndex];
        return row ? row[keyIndex] || null : null;
    }

    function displayLabel(key: KeySpec): string {
        if (key.action === 'char' && key.value.length === 1 && shift) {
            return key.value.toUpperCase();
        }
        return key.label;
    }

    function render(): void {
        while (panelEl.firstChild) {
            panelEl.removeChild(panelEl.firstChild);
        }
        rows.forEach((row, r) => {
            const rowEl = doc.createElement('div');
            rowEl.style.height = `${KEY_SIZE}px`;
            rowEl.style.marginTop = r === 0 ? '0' : `${KEY_GAP}px`;
            rowEl.style.whiteSpace = 'nowrap';
            row.forEach((key, k) => {
                const selected = r === rowIndex && k === keyIndex;
                const active = key.action === 'shift' && shift;
                const keyEl = doc.createElement('div');
                keyEl.setAttribute('data-tvemu-key', key.action === 'char' ? key.value : key.action);
                if (selected) {
                    keyEl.setAttribute('data-tvemu-key-selected', '');
                }
                keyEl.textContent = displayLabel(key);
                keyEl.style.display = 'inline-block';
                keyEl.style.verticalAlign = 'top';
                keyEl.style.boxSizing = 'border-box';
                keyEl.style.width = `${key.span * KEY_SIZE + (key.span - 1) * KEY_GAP}px`;
                keyEl.style.height = `${KEY_SIZE}px`;
                keyEl.style.lineHeight = `${KEY_SIZE}px`;
                keyEl.style.marginLeft = k === 0 ? '0' : `${KEY_GAP}px`;
                keyEl.style.textAlign = 'center';
                keyEl.style.fontSize = key.action === 'char' && key.value.length === 1 ? '40px' : '28px';
                keyEl.style.borderRadius = '12px';
                keyEl.style.cursor = 'pointer';
                keyEl.style.color = selected ? '#101010' : '#f2f2f2';
                keyEl.style.background = selected ? '#ffffff' : active ? '#5a5a60' : '#2f2f33';
                keyEl.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    rowIndex = r;
                    keyIndex = k;
                    column = columnOfKey(row, k);
                    press();
                });
                rowEl.appendChild(keyEl);
            });
            panelEl.appendChild(rowEl);
        });
    }

    function emitInput(): void {
        if (!target) {
            return;
        }
        const event = doc.createEvent('Event');
        event.initEvent('input', true, false);
        target.dispatchEvent(event);
    }

    function insert(text: string): void {
        if (!target) {
            return;
        }
        const limit = target.maxLength > 0 ? target.maxLength : Number.MAX_SAFE_INTEGER;
        const next = (target.value + text).slice(0, limit);
        if (next === target.value) {
            return;
        }
        target.value = next;
        emitInput();
    }

    function removeLast(): void {
        if (!target || target.value.length === 0) {
            return;
        }
        target.value = target.value.slice(0, -1);
        emitInput();
    }

    function clearAll(): void {
        if (!target || target.value.length === 0) {
            return;
        }
        target.value = '';
        emitInput();
    }

    function rebuild(): void {
        rows = buildRows(page, panel);
        const row = rows[rowIndex];
        keyIndex = row ? keyIndexAtColumn(row, column) : 0;
    }

    function press(): void {
        const key = currentKey();
        if (!key) {
            return;
        }
        if (key.action === 'char') {
            insert(shift && key.value.length === 1 ? key.value.toUpperCase() : key.value);
            shift = false;
        } else if (key.action === 'space') {
            insert(' ');
        } else if (key.action === 'backspace') {
            removeLast();
        } else if (key.action === 'clear') {
            clearAll();
        } else if (key.action === 'shift') {
            shift = !shift;
        } else if (key.action === 'page') {
            page = page === 'letters' ? 'symbols' : 'letters';
            shift = false;
            rebuild();
        } else if (key.action === 'done') {
            hide();
            return;
        }
        render();
    }

    function moveVertical(delta: number): void {
        const next = rowIndex + delta;
        if (next < 0 || next >= rows.length) {
            return;
        }
        rowIndex = next;
        const row = rows[rowIndex];
        keyIndex = row ? keyIndexAtColumn(row, column) : 0;
        render();
    }

    function moveHorizontal(delta: number): void {
        const row = rows[rowIndex];
        if (!row) {
            return;
        }
        keyIndex = (keyIndex + delta + row.length) % row.length;
        column = columnOfKey(row, keyIndex);
        render();
    }

    function place(input: HTMLInputElement): void {
        const stageRect = stageEl.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const center = stageRect.height > 0 ? (inputRect.top + inputRect.height / 2 - stageRect.top) / stageRect.height : 0;
        if (center > 0.5) {
            panelEl.style.top = '32px';
            panelEl.style.bottom = '';
        } else {
            panelEl.style.top = '';
            panelEl.style.bottom = '32px';
        }
    }

    function show(input: HTMLInputElement, nextPanel: NuiImePanel): void {
        const wasOpen = isOpen() && target === input;
        target = input;
        panel = nextPanel;
        if (!wasOpen) {
            page = 'letters';
            shift = false;
            rowIndex = nextPanel === 'number' ? 0 : 1;
            column = 0;
        }
        rebuild();
        if (!attached) {
            stageEl.appendChild(panelEl);
            attached = true;
        }
        place(input);
        panelEl.style.display = 'block';
        render();
    }

    function hide(): void {
        panelEl.style.display = 'none';
    }

    function isOpen(): boolean {
        return attached && panelEl.style.display !== 'none';
    }

    function handleKey(code: number): boolean {
        if (!isOpen()) {
            return false;
        }
        if (code === 37) {
            moveHorizontal(-1);
        } else if (code === 39) {
            moveHorizontal(1);
        } else if (code === 38) {
            moveVertical(-1);
        } else if (code === 40) {
            moveVertical(1);
        } else if (code === 13) {
            press();
        } else if (code === 10009 || code === 27) {
            hide();
        } else {
            return false;
        }
        return true;
    }

    function state(): VirtualKeyboardState {
        const key = currentKey();
        return {
            open: isOpen(),
            key: isOpen() && key ? (key.action === 'char' ? displayLabel(key) : key.label) : null,
            page,
            shift,
        };
    }

    function destroy(): void {
        if (panelEl.parentNode) {
            panelEl.parentNode.removeChild(panelEl);
        }
        attached = false;
        target = null;
    }

    return { show, hide, isOpen, handleKey, state, destroy };
}
