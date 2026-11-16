import {
    BRIDGE_SEND_BINDING,
    findRemoteKeyByCode,
    type NuiColor,
    type NuiHostMessage,
    type NuiImageFitting,
    type NuiImeOptions,
    type NuiImePanel,
    type NuiNodeKind,
    type NuiOp,
    type NuiPlayerMessage,
    type NuiProps,
    type NuiWindowProps,
} from '@tvemu/protocol';

export interface NuiDebugNode {
    id: number;
    kind: NuiNodeKind;
    parentId: number | null;
    name?: string;
    rect: { x: number; y: number; w: number | null; h: number | null };
    visible: boolean;
    text?: string;
    url?: string;
}

import { createVirtualKeyboard, type VirtualKeyboardState } from './virtual-keyboard.js';

export interface NuiDebugSnapshot {
    nodeCount: number;
    focusedId: number;
    imeId: number;
    keyboard: VirtualKeyboardState;
    nodes: NuiDebugNode[];
}

export interface NuiRendererApi {
    apply: (json: string) => void;
    debug: () => NuiDebugSnapshot;
    hideKeyboard: () => void;
    destroy: () => void;
    planeFrame: (id: number, jpegBase64: string) => void;
}

interface SceneNode {
    id: number;
    kind: NuiNodeKind;
    el: HTMLElement;
    textSpan: HTMLSpanElement | null;
    imgEl: HTMLImageElement | null;
    inputEl: HTMLInputElement | null;
    parentId: number | null;
    childIds: number[];
    props: NuiProps;
    panel: NuiImePanel;
    hiddenInput: boolean;
    imageGen: number;
    dirtyMeasure: boolean;
    lastMeasuredW: number | null;
    lastMeasuredH: number | null;
}

interface HlsInstance {
    loadSource: (url: string) => void;
    attachMedia: (media: HTMLMediaElement) => void;
    destroy: () => void;
    on?: (event: string, listener: (event: string, data: { fatal?: boolean; details?: string }) => void) => void;
}

interface HlsConstructor {
    new (): HlsInstance;
    isSupported?: () => boolean;
    Events?: { ERROR?: string };
}

interface PlayerEntry {
    id: number;
    video: HTMLVideoElement;
    url: string;
    displayMode: 'window' | 'none';
    hls: HlsInstance | null;
    timeTimer: ReturnType<typeof setInterval> | null;
    preparedSent: boolean;
    suppressPause: boolean;
}

function clampByte(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function clampAlpha(value: number): number {
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.max(0, Math.min(1, value));
}

function formatColor(color: NuiColor): string {
    const r = clampByte(color[0]);
    const g = clampByte(color[1]);
    const b = clampByte(color[2]);
    const a = clampAlpha(color[3]);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function isHlsUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return /\.m3u8(\?|#|$)/.test(lower) || lower.indexOf('.m3u8') !== -1;
}

function nativeHlsSupported(video: HTMLVideoElement): boolean {
    try {
        if (typeof video.canPlayType !== 'function') {
            return false;
        }
        return Boolean(
            video.canPlayType('application/vnd.apple.mpegurl') ||
                video.canPlayType('application/x-mpegURL') ||
                video.canPlayType('application/mpegurl'),
        );
    } catch {
        return false;
    }
}

function mapHAlignToFlex(align: NuiProps['hAlign']): string {
    if (align === 'center') {
        return 'center';
    }
    if (align === 'end') {
        return 'flex-end';
    }
    return 'flex-start';
}

function mapHAlignToText(align: NuiProps['hAlign']): string {
    if (align === 'center') {
        return 'center';
    }
    if (align === 'end') {
        return 'right';
    }
    return 'left';
}

function mapVAlignToFlex(align: NuiProps['vAlign']): string {
    if (align === 'center') {
        return 'center';
    }
    if (align === 'bottom') {
        return 'flex-end';
    }
    return 'flex-start';
}

function mapFittingToObjectFit(fitting: NuiImageFitting | undefined): string {
    if (fitting === 'contain') {
        return 'contain';
    }
    if (fitting === 'cover') {
        return 'cover';
    }
    if (fitting === 'center') {
        return 'none';
    }
    return 'fill';
}

function resolvedInputType(node: SceneNode): string {
    if (node.hiddenInput || node.panel === 'password') {
        return 'password';
    }
    if (node.panel === 'email') {
        return 'email';
    }
    if (node.panel === 'url') {
        return 'url';
    }
    return 'text';
}

function isPrintableKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return false;
    }
    return typeof event.key === 'string' && event.key.length === 1;
}

export function installNuiRenderer(win: Window, doc: Document): NuiRendererApi {
    const stageEl = doc.getElementById('tvemu-nui-stage') || doc.body;
    const underlayEl = doc.getElementById('tvemu-nui-underlay') || stageEl;
    const keyboard = createVirtualKeyboard(doc, stageEl);

    const nodes = new Map<number, SceneNode>();
    const rootChildIds: number[] = [];
    const players = new Map<number, PlayerEntry>();
    const planes = new Map<number, HTMLImageElement>();
    const fieldInputs = new Set<HTMLInputElement>();
    const suppressedKeyCodes = new Set<number>();
    const forwardedKeyCodes = new Set<number>();

    let focusedId = 0;
    let imeId = 0;
    let nextBridgeId = 1;

    function sendEvent(message: NuiHostMessage): void {
        const sender = (win as unknown as Record<string, unknown>)[BRIDGE_SEND_BINDING];
        if (typeof sender !== 'function') {
            return;
        }
        const payload = JSON.stringify({
            id: nextBridgeId++,
            api: 'nui',
            method: 'event',
            args: [message],
        });
        (sender as (json: string) => void)(payload);
    }

    function isNodeInStage(node: SceneNode): boolean {
        let current: SceneNode | undefined = node;
        let guard = 0;
        while (current && guard < 1000) {
            if (current.parentId === 0) {
                return true;
            }
            if (current.parentId === null) {
                return false;
            }
            current = nodes.get(current.parentId);
            guard++;
        }
        return false;
    }

    function measureAndReport(node: SceneNode): void {
        if (!node.dirtyMeasure) {
            return;
        }
        if (node.props.w !== null && node.props.h !== null) {
            node.dirtyMeasure = false;
            return;
        }
        if (!isNodeInStage(node)) {
            return;
        }
        node.dirtyMeasure = false;
        const rect = typeof node.el.getBoundingClientRect === 'function'
            ? node.el.getBoundingClientRect()
            : { width: 0, height: 0 };
        let measuredW = Math.ceil(node.el.offsetWidth || rect.width || 0);
        let measuredH = Math.ceil(node.el.offsetHeight || rect.height || 0);
        if (node.kind === 'image' && node.imgEl) {
            if (node.props.w === null && measuredW === 0 && node.imgEl.naturalWidth > 0) {
                measuredW = node.imgEl.naturalWidth;
            }
            if (node.props.h === null && measuredH === 0 && node.imgEl.naturalHeight > 0) {
                measuredH = node.imgEl.naturalHeight;
            }
        }
        if (typeof node.props.w === 'number' && measuredW === 0) {
            measuredW = node.props.w;
        }
        if (typeof node.props.h === 'number' && measuredH === 0) {
            measuredH = node.props.h;
        }
        if (node.lastMeasuredW !== measuredW || node.lastMeasuredH !== measuredH) {
            node.lastMeasuredW = measuredW;
            node.lastMeasuredH = measuredH;
            sendEvent({
                t: 'measure',
                id: node.id,
                w: measuredW,
                h: measuredH,
            });
        }
    }

    function flushMeasures(): void {
        nodes.forEach((node) => {
            measureAndReport(node);
        });
    }

    function detachNode(id: number): void {
        const node = nodes.get(id);
        if (!node) {
            return;
        }
        if (node.parentId === 0) {
            const idx = rootChildIds.indexOf(id);
            if (idx !== -1) {
                rootChildIds.splice(idx, 1);
            }
        } else if (node.parentId !== null) {
            const parent = nodes.get(node.parentId);
            if (parent) {
                const idx = parent.childIds.indexOf(id);
                if (idx !== -1) {
                    parent.childIds.splice(idx, 1);
                }
            }
        }
        node.parentId = null;
        if (node.el.parentNode) {
            node.el.parentNode.removeChild(node.el);
        }
    }

    function destroyNode(id: number): void {
        const node = nodes.get(id);
        if (!node) {
            return;
        }
        if (node.inputEl) {
            if (doc.activeElement === node.inputEl) {
                node.inputEl.blur();
            }
            fieldInputs.delete(node.inputEl);
        }
        detachNode(id);
        const childCopy = node.childIds.slice();
        for (let i = 0; i < childCopy.length; i++) {
            const childId = childCopy[i];
            if (childId !== undefined) {
                const child = nodes.get(childId);
                if (child) {
                    child.parentId = null;
                }
            }
        }
        node.childIds.length = 0;
        nodes.delete(id);
        if (focusedId === id) {
            focusedId = 0;
        }
        if (imeId === id) {
            imeId = 0;
            keyboard.hide();
        }
    }

    function createNode(id: number, kind: NuiNodeKind): void {
        if (nodes.has(id)) {
            destroyNode(id);
        }
        const el = doc.createElement('div');
        el.className = `nui-node nui-${kind}`;
        el.setAttribute('data-nui-id', String(id));
        el.setAttribute('data-nui-kind', kind);
        el.style.position = 'absolute';
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.boxSizing = 'border-box';
        el.style.margin = '0';
        el.style.padding = '0';

        let textSpan: HTMLSpanElement | null = null;
        let imgEl: HTMLImageElement | null = null;
        let inputEl: HTMLInputElement | null = null;

        if (kind === 'text') {
            el.style.display = 'flex';
            el.style.alignItems = 'flex-start';
            el.style.justifyContent = 'flex-start';
            textSpan = doc.createElement('span');
            textSpan.className = 'nui-text-span';
            textSpan.style.display = 'block';
            textSpan.style.maxWidth = '100%';
            textSpan.style.whiteSpace = 'nowrap';
            textSpan.style.textAlign = 'left';
            el.appendChild(textSpan);
        } else if (kind === 'image') {
            imgEl = doc.createElement('img');
            imgEl.className = 'nui-image-img';
            imgEl.style.display = 'block';
            imgEl.style.width = '100%';
            imgEl.style.height = '100%';
            imgEl.style.objectFit = 'fill';
            imgEl.style.objectPosition = 'center';
            el.appendChild(imgEl);
        } else if (kind === 'field') {
            inputEl = doc.createElement('input');
            inputEl.type = 'text';
            inputEl.className = 'nui-field-input';
            inputEl.style.display = 'block';
            inputEl.style.width = '100%';
            inputEl.style.height = '100%';
            inputEl.style.boxSizing = 'border-box';
            inputEl.style.border = 'none';
            inputEl.style.outline = 'none';
            inputEl.style.background = 'transparent';
            inputEl.style.margin = '0';
            inputEl.style.padding = '0';
            fieldInputs.add(inputEl);
            el.appendChild(inputEl);
        }

        const node: SceneNode = {
            id,
            kind,
            el,
            textSpan,
            imgEl,
            inputEl,
            parentId: null,
            childIds: [],
            props: {},
            panel: 'normal',
            hiddenInput: false,
            imageGen: 0,
            dirtyMeasure: false,
            lastMeasuredW: null,
            lastMeasuredH: null,
        };

        if (imgEl) {
            imgEl.addEventListener('load', () => {
                if (!nodes.has(id)) {
                    return;
                }
                const naturalW = imgEl ? (imgEl.naturalWidth || 0) : 0;
                const naturalH = imgEl ? (imgEl.naturalHeight || 0) : 0;
                sendEvent({
                    t: 'image',
                    id,
                    status: 'ready',
                    w: naturalW,
                    h: naturalH,
                });
                if (node.props.w === null || node.props.h === null) {
                    node.dirtyMeasure = true;
                    measureAndReport(node);
                }
            });
            imgEl.addEventListener('error', () => {
                if (!nodes.has(id)) {
                    return;
                }
                sendEvent({
                    t: 'image',
                    id,
                    status: 'failed',
                    w: 0,
                    h: 0,
                });
            });
        }

        if (inputEl) {
            inputEl.addEventListener('input', () => {
                if (!nodes.has(id) || !inputEl) {
                    return;
                }
                node.props.text = inputEl.value;
                sendEvent({
                    t: 'text',
                    id,
                    value: inputEl.value,
                });
            });
        }

        nodes.set(id, node);
    }

    function insertNode(parentId: number, id: number, index: number): void {
        const node = nodes.get(id);
        if (!node) {
            return;
        }
        if (parentId === id) {
            return;
        }
        detachNode(id);

        let container: HTMLElement;
        let siblingList: number[];
        if (parentId === 0) {
            container = stageEl;
            siblingList = rootChildIds;
        } else {
            const parent = nodes.get(parentId);
            if (!parent) {
                return;
            }
            container = parent.el;
            siblingList = parent.childIds;
        }

        const clampedIndex = Math.max(0, Math.min(siblingList.length, index));
        const refId = siblingList[clampedIndex];
        const refNode = refId !== undefined ? nodes.get(refId) : undefined;
        siblingList.splice(clampedIndex, 0, id);
        node.parentId = parentId;

        if (refNode && refNode.el.parentNode === container) {
            container.insertBefore(node.el, refNode.el);
        } else {
            container.appendChild(node.el);
        }

        if (node.props.w === null || node.props.h === null) {
            node.dirtyMeasure = true;
        }
    }

    function updateTransform(node: SceneNode): void {
        const pivot = node.props.pivot || [0.5, 0.5];
        node.el.style.transformOrigin = `${pivot[0] * 100}% ${pivot[1] * 100}%`;
        if (node.props.scale) {
            node.el.style.transform = `scale(${node.props.scale[0]}, ${node.props.scale[1]})`;
        } else {
            node.el.style.transform = '';
        }
    }

    function updateBorder(node: SceneNode): void {
        const width = node.props.borderWidth;
        const color = node.props.borderColor;
        if (typeof width === 'number' && width > 0) {
            const colorCss = color ? formatColor(color) : 'rgba(255, 255, 255, 1)';
            node.el.style.boxShadow = `inset 0 0 0 ${width}px ${colorCss}`;
        } else {
            node.el.style.boxShadow = 'none';
        }
    }

    function updateTextLayout(node: SceneNode): void {
        if (!node.textSpan) {
            return;
        }
        const span = node.textSpan;
        const multiline = node.props.multiline === true;
        const ellipsis = node.props.ellipsis === true;
        span.style.whiteSpace = multiline ? 'pre-wrap' : 'nowrap';
        span.style.wordBreak = multiline ? 'break-word' : 'normal';
        if (ellipsis) {
            span.style.overflow = 'hidden';
            span.style.textOverflow = 'ellipsis';
        } else {
            span.style.overflow = 'visible';
            span.style.textOverflow = 'clip';
        }
        span.style.width = typeof node.props.w === 'number' ? '100%' : 'auto';
        span.style.textAlign = mapHAlignToText(node.props.hAlign);
        node.el.style.justifyContent = mapHAlignToFlex(node.props.hAlign);
        node.el.style.alignItems = mapVAlignToFlex(node.props.vAlign);
    }

    function setProps(id: number, props: NuiProps): void {
        const node = nodes.get(id);
        if (!node) {
            return;
        }
        const prev = node.props;
        const keys = Object.keys(props) as Array<keyof NuiProps>;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key !== undefined) {
                (prev as Record<string, unknown>)[key] = props[key];
            }
        }

        if (props.x !== undefined) {
            node.el.style.left = `${props.x}px`;
        }
        if (props.y !== undefined) {
            node.el.style.top = `${props.y}px`;
        }
        if (props.w !== undefined) {
            node.el.style.width = props.w === null ? 'auto' : `${props.w}px`;
            if (node.kind === 'text') {
                updateTextLayout(node);
            }
            if (props.w === null || node.props.h === null) {
                node.dirtyMeasure = true;
            }
        }
        if (props.h !== undefined) {
            node.el.style.height = props.h === null ? 'auto' : `${props.h}px`;
            if (props.h === null || node.props.w === null) {
                node.dirtyMeasure = true;
            }
        }
        if (props.visible !== undefined) {
            node.el.style.display = props.visible ? (node.kind === 'text' ? 'flex' : 'block') : 'none';
            if (props.visible && (node.props.w === null || node.props.h === null)) {
                node.dirtyMeasure = true;
            }
        }
        if (props.opacity !== undefined) {
            node.el.style.opacity = String(clampAlpha(props.opacity));
        }
        if (props.scale !== undefined || props.pivot !== undefined) {
            updateTransform(node);
        }
        if (props.bg !== undefined) {
            node.el.style.backgroundColor = formatColor(props.bg);
        }
        if (props.radius !== undefined) {
            const r = props.radius;
            node.el.style.borderRadius = `${r[0]}px ${r[1]}px ${r[2]}px ${r[3]}px`;
        }
        if (props.borderWidth !== undefined || props.borderColor !== undefined) {
            updateBorder(node);
        }
        if (props.clip !== undefined) {
            node.el.style.overflow = props.clip ? 'hidden' : 'visible';
        }
        if (props.name !== undefined) {
            node.el.setAttribute('data-name', props.name);
        }
        if (props.fontFamily !== undefined) {
            node.el.style.fontFamily = props.fontFamily;
            node.dirtyMeasure = true;
        }
        if (props.fontWeight !== undefined) {
            node.el.style.fontWeight = props.fontWeight;
            node.dirtyMeasure = true;
        }
        if (props.fontStyle !== undefined) {
            node.el.style.fontStyle = props.fontStyle;
            node.dirtyMeasure = true;
        }
        if (props.pixelSize !== undefined) {
            node.el.style.fontSize = `${props.pixelSize}px`;
            if (node.inputEl) {
                node.inputEl.style.fontSize = `${props.pixelSize}px`;
            }
            node.dirtyMeasure = true;
        }
        if (props.lineSpacing !== undefined) {
            const basePx = typeof node.props.pixelSize === 'number' ? node.props.pixelSize : 16;
            node.el.style.lineHeight = `${Math.max(1, basePx + props.lineSpacing)}px`;
            node.dirtyMeasure = true;
        }
        if (props.textColor !== undefined) {
            const colorCss = formatColor(props.textColor);
            node.el.style.color = colorCss;
            if (node.inputEl) {
                node.inputEl.style.color = colorCss;
            }
        }

        if (node.kind === 'text' && node.textSpan) {
            if (props.text !== undefined) {
                node.textSpan.textContent = props.text;
                node.dirtyMeasure = true;
            }
            if (
                props.multiline !== undefined ||
                props.hAlign !== undefined ||
                props.vAlign !== undefined ||
                props.ellipsis !== undefined
            ) {
                updateTextLayout(node);
                node.dirtyMeasure = true;
            }
        }

        if (node.kind === 'field' && node.inputEl) {
            if (props.text !== undefined && node.inputEl.value !== props.text) {
                node.inputEl.value = props.text;
            }
            if (props.placeholder !== undefined) {
                node.inputEl.placeholder = props.placeholder;
            }
            if (props.placeholderColor !== undefined) {
                node.inputEl.style.setProperty('--nui-placeholder-color', formatColor(props.placeholderColor));
            }
            if (props.hidden !== undefined) {
                node.hiddenInput = props.hidden;
                node.inputEl.type = resolvedInputType(node);
            }
            if (props.maxLength !== undefined) {
                if (typeof props.maxLength === 'number' && props.maxLength > 0) {
                    node.inputEl.maxLength = props.maxLength;
                } else {
                    node.inputEl.removeAttribute('maxlength');
                }
            }
            if (props.hAlign !== undefined) {
                node.inputEl.style.textAlign = mapHAlignToText(props.hAlign);
            }
        }

        if (node.kind === 'image' && node.imgEl) {
            if (props.fitting !== undefined) {
                node.imgEl.style.objectFit = mapFittingToObjectFit(props.fitting);
                node.imgEl.style.objectPosition = 'center';
            }
            if (props.url !== undefined) {
                node.imageGen += 1;
                if (props.url) {
                    node.imgEl.src = props.url;
                } else {
                    node.imgEl.removeAttribute('src');
                }
                node.dirtyMeasure = true;
            }
        }

        if (node.props.w !== null && node.props.h !== null) {
            node.dirtyMeasure = false;
        }
    }

    function applyWindowProps(props: NuiWindowProps): void {
        if (props.bg !== undefined) {
            stageEl.style.backgroundColor = formatColor(props.bg);
        }
    }

    function blurFocusedField(): void {
        const active = doc.activeElement;
        if (active && active.tagName === 'INPUT' && fieldInputs.has(active as HTMLInputElement)) {
            (active as HTMLInputElement).blur();
        }
    }

    function applyIme(id: number, opts?: NuiImeOptions): void {
        imeId = id;
        if (id === 0) {
            keyboard.hide();
            blurFocusedField();
            return;
        }
        const node = nodes.get(id);
        if (!node || !node.inputEl) {
            return;
        }
        if (opts && opts.panel !== undefined) {
            node.panel = opts.panel;
        }
        if (opts && typeof opts.hidden === 'boolean') {
            node.hiddenInput = opts.hidden;
        }
        node.inputEl.type = resolvedInputType(node);
        if (node.panel === 'number') {
            node.inputEl.inputMode = 'numeric';
        } else {
            node.inputEl.removeAttribute('inputmode');
        }
        node.inputEl.focus();
        keyboard.show(node.inputEl, node.panel);
    }

    function applyOp(op: NuiOp): void {
        const kind = op[0];
        if (kind === 'create') {
            createNode(op[1], op[2]);
            return;
        }
        if (kind === 'set') {
            setProps(op[1], op[2]);
            return;
        }
        if (kind === 'insert') {
            insertNode(op[1], op[2], op[3]);
            return;
        }
        if (kind === 'detach') {
            detachNode(op[1]);
            return;
        }
        if (kind === 'destroy') {
            destroyNode(op[1]);
            return;
        }
        if (kind === 'window') {
            applyWindowProps(op[1]);
            return;
        }
        if (kind === 'focus') {
            focusedId = op[1];
            return;
        }
        if (kind === 'ime') {
            applyIme(op[1], op[2]);
        }
    }

    function playerTiming(video: HTMLVideoElement): { positionMs: number; durationMs: number } {
        const positionMs = Number.isFinite(video.currentTime) ? Math.max(0, Math.round(video.currentTime * 1000)) : 0;
        const durationMs = Number.isFinite(video.duration) ? Math.max(0, Math.round(video.duration * 1000)) : 0;
        return { positionMs, durationMs };
    }

    function stopPlayerTimer(entry: PlayerEntry): void {
        if (entry.timeTimer !== null) {
            clearInterval(entry.timeTimer);
            entry.timeTimer = null;
        }
    }

    function destroyPlayerHls(entry: PlayerEntry): void {
        if (entry.hls) {
            try {
                entry.hls.destroy();
            } catch {
                void 0;
            }
            entry.hls = null;
        }
    }

    function getOrCreatePlayer(id: number): PlayerEntry {
        const existing = players.get(id);
        if (existing) {
            return existing;
        }
        const video = doc.createElement('video');
        video.setAttribute('data-nui-player-id', String(id));
        video.style.position = 'absolute';
        video.style.left = '0px';
        video.style.top = '0px';
        video.style.width = '1920px';
        video.style.height = '1080px';
        video.style.objectFit = 'contain';
        video.style.display = 'none';
        video.style.backgroundColor = '#000000';
        underlayEl.appendChild(video);

        const entry: PlayerEntry = {
            id,
            video,
            url: '',
            displayMode: 'none',
            hls: null,
            timeTimer: null,
            preparedSent: false,
            suppressPause: false,
        };

        video.addEventListener('loadedmetadata', () => {
            if (!players.has(id) || entry.preparedSent) {
                return;
            }
            entry.preparedSent = true;
            const timing = playerTiming(video);
            sendEvent({
                t: 'player',
                id,
                event: 'prepared',
                positionMs: timing.positionMs,
                durationMs: timing.durationMs,
            });
        });

        video.addEventListener('playing', () => {
            if (!players.has(id)) {
                return;
            }
            stopPlayerTimer(entry);
            entry.timeTimer = setInterval(() => {
                if (!players.has(id)) {
                    stopPlayerTimer(entry);
                    return;
                }
                const t = playerTiming(video);
                sendEvent({
                    t: 'player',
                    id,
                    event: 'time',
                    positionMs: t.positionMs,
                    durationMs: t.durationMs,
                });
            }, 250);
            const timing = playerTiming(video);
            sendEvent({
                t: 'player',
                id,
                event: 'playing',
                positionMs: timing.positionMs,
                durationMs: timing.durationMs,
            });
        });

        video.addEventListener('pause', () => {
            if (!players.has(id)) {
                return;
            }
            stopPlayerTimer(entry);
            if (entry.suppressPause) {
                return;
            }
            const timing = playerTiming(video);
            sendEvent({
                t: 'player',
                id,
                event: 'paused',
                positionMs: timing.positionMs,
                durationMs: timing.durationMs,
            });
        });

        video.addEventListener('ended', () => {
            if (!players.has(id)) {
                return;
            }
            stopPlayerTimer(entry);
            const timing = playerTiming(video);
            sendEvent({
                t: 'player',
                id,
                event: 'ended',
                positionMs: timing.positionMs,
                durationMs: timing.durationMs,
            });
        });

        video.addEventListener('seeked', () => {
            if (!players.has(id)) {
                return;
            }
            const timing = playerTiming(video);
            sendEvent({
                t: 'player',
                id,
                event: 'seeked',
                positionMs: timing.positionMs,
                durationMs: timing.durationMs,
            });
        });

        video.addEventListener('error', () => {
            if (!players.has(id)) {
                return;
            }
            stopPlayerTimer(entry);
            const msg = video.error && video.error.message ? video.error.message : 'Media playback error';
            sendEvent({
                t: 'player',
                id,
                event: 'error',
                message: msg,
            });
        });

        players.set(id, entry);
        return entry;
    }

    function openPlayerSource(entry: PlayerEntry, url: string): void {
        destroyPlayerHls(entry);
        stopPlayerTimer(entry);
        entry.url = url;
        entry.preparedSent = false;

        if (isHlsUrl(url) && !nativeHlsSupported(entry.video)) {
            const HlsClass = (win as unknown as { Hls?: HlsConstructor }).Hls;
            if (typeof HlsClass === 'function' && (!HlsClass.isSupported || HlsClass.isSupported())) {
                const instance = new HlsClass();
                entry.hls = instance;
                if (typeof instance.on === 'function' && HlsClass.Events && HlsClass.Events.ERROR) {
                    instance.on(HlsClass.Events.ERROR, (_ev, data) => {
                        if (data && data.fatal) {
                            sendEvent({
                                t: 'player',
                                id: entry.id,
                                event: 'error',
                                message: data.details || 'HLS playback error',
                            });
                        }
                    });
                }
                instance.loadSource(url);
                instance.attachMedia(entry.video);
                return;
            }
            sendEvent({
                t: 'player',
                id: entry.id,
                event: 'error',
                message: 'HLS playback is not supported',
            });
            return;
        }

        entry.video.src = url;
    }

    function removeBrowserPlayer(id: number): 'window' | 'none' {
        const existing = players.get(id);
        if (!existing) {
            return 'none';
        }
        stopPlayerTimer(existing);
        destroyPlayerHls(existing);
        players.delete(id);
        if (existing.video.parentNode) {
            existing.video.parentNode.removeChild(existing.video);
        }
        return existing.displayMode;
    }

    function removePlane(id: number): void {
        const plane = planes.get(id);
        if (plane && plane.parentNode) {
            plane.parentNode.removeChild(plane);
        }
        planes.delete(id);
    }

    function openPlane(id: number): void {
        const displayMode = removeBrowserPlayer(id);
        removePlane(id);
        const image = doc.createElement('img');
        image.setAttribute('data-nui-plane', String(id));
        image.style.position = 'absolute';
        image.style.left = '0px';
        image.style.top = '0px';
        image.style.width = '1920px';
        image.style.height = '1080px';
        image.style.objectFit = 'contain';
        image.style.backgroundColor = '#000000';
        image.style.display = displayMode === 'window' ? 'block' : 'none';
        underlayEl.appendChild(image);
        planes.set(id, image);
    }

    function planeFrame(id: number, jpegBase64: string): void {
        const plane = planes.get(id);
        if (plane) {
            plane.src = 'data:image/jpeg;base64,' + jpegBase64;
        }
    }

    function applyPlayerMessage(msg: NuiPlayerMessage): void {
        if (msg.op === 'open' && msg.plane) {
            openPlane(msg.id);
            return;
        }
        const plane = planes.get(msg.id);
        if (plane) {
            if (msg.op === 'display') {
                plane.style.display = msg.mode === 'window' ? 'block' : 'none';
            } else if (msg.op === 'close' || msg.op === 'open') {
                removePlane(msg.id);
            }
            if (msg.op !== 'open') {
                return;
            }
        }
        const entry = getOrCreatePlayer(msg.id);
        if (msg.op === 'open') {
            openPlayerSource(entry, msg.url);
            return;
        }
        if (msg.op === 'display') {
            entry.displayMode = msg.mode;
            entry.video.style.display = msg.mode === 'window' ? 'block' : 'none';
            return;
        }
        if (msg.op === 'prepare') {
            if (!entry.preparedSent && entry.video.readyState >= 1) {
                entry.preparedSent = true;
                const timing = playerTiming(entry.video);
                sendEvent({
                    t: 'player',
                    id: entry.id,
                    event: 'prepared',
                    positionMs: timing.positionMs,
                    durationMs: timing.durationMs,
                });
                return;
            }
            if (!entry.hls && typeof entry.video.load === 'function') {
                entry.video.load();
            }
            return;
        }
        if (msg.op === 'start') {
            try {
                const playResult = entry.video.play();
                if (playResult && typeof playResult.catch === 'function') {
                    playResult.catch((error: unknown) => {
                        sendEvent({
                            t: 'player',
                            id: entry.id,
                            event: 'error',
                            message: error instanceof Error ? error.message : String(error),
                        });
                    });
                }
            } catch (error) {
                sendEvent({
                    t: 'player',
                    id: entry.id,
                    event: 'error',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        }
        if (msg.op === 'pause') {
            entry.video.pause();
            return;
        }
        if (msg.op === 'stop') {
            stopPlayerTimer(entry);
            entry.suppressPause = true;
            try {
                entry.video.pause();
                entry.video.currentTime = 0;
            } finally {
                entry.suppressPause = false;
            }
            return;
        }
        if (msg.op === 'seek') {
            entry.video.currentTime = Math.max(0, msg.ms / 1000);
            return;
        }
        if (msg.op === 'volume') {
            entry.video.volume = Math.max(0, Math.min(1, msg.value));
            return;
        }
        if (msg.op === 'mute') {
            entry.video.muted = Boolean(msg.value);
            return;
        }
        if (msg.op === 'rate') {
            entry.video.playbackRate = msg.value;
            return;
        }
        if (msg.op === 'close') {
            stopPlayerTimer(entry);
            destroyPlayerHls(entry);
            entry.suppressPause = true;
            try {
                entry.video.pause();
                entry.video.removeAttribute('src');
                if (typeof entry.video.load === 'function') {
                    entry.video.load();
                }
            } finally {
                entry.suppressPause = false;
            }
            if (entry.video.parentNode) {
                entry.video.parentNode.removeChild(entry.video);
            }
            players.delete(msg.id);
        }
    }

    function activeFieldInput(): HTMLInputElement | null {
        const active = doc.activeElement;
        if (active && active.tagName === 'INPUT' && fieldInputs.has(active as HTMLInputElement)) {
            return active as HTMLInputElement;
        }
        return null;
    }

    function resolveRemoteKey(code: number): { name: string; code: number } | null {
        const direct = findRemoteKeyByCode(code);
        if (direct) {
            return { name: direct.name, code: direct.code };
        }
        if (code === 8 || code === 27) {
            return { name: 'Back', code: 10009 };
        }
        return null;
    }

    function shouldEditFocusedInput(event: KeyboardEvent, input: HTMLInputElement): boolean {
        const code = event.keyCode;
        if (code === 38 || code === 40 || code === 13 || code === 10009 || code === 27) {
            return false;
        }
        if (code === 37 || code === 39) {
            return input.value.length > 0;
        }
        if (code === 8 || code === 46 || code === 36 || code === 35) {
            return true;
        }
        if (isPrintableKey(event)) {
            return true;
        }
        return false;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
        const code = event.keyCode;
        if (keyboard.handleKey(code)) {
            event.preventDefault();
            suppressedKeyCodes.add(code);
            return;
        }
        const focusedInput = activeFieldInput();
        if (focusedInput && shouldEditFocusedInput(event, focusedInput)) {
            suppressedKeyCodes.add(code);
            return;
        }
        suppressedKeyCodes.delete(code);
        const mapped = resolveRemoteKey(code);
        if (!mapped) {
            return;
        }
        forwardedKeyCodes.add(code);
        event.preventDefault();
        sendEvent({
            t: 'key',
            state: 'down',
            key: mapped.name,
            code: mapped.code,
        });
    };

    const onKeyUp = (event: KeyboardEvent): void => {
        const code = event.keyCode;
        if (suppressedKeyCodes.has(code)) {
            suppressedKeyCodes.delete(code);
            return;
        }
        const downWasForwarded = forwardedKeyCodes.delete(code);
        const focusedInput = activeFieldInput();
        if (!downWasForwarded && focusedInput && shouldEditFocusedInput(event, focusedInput)) {
            return;
        }
        const mapped = resolveRemoteKey(code);
        if (!mapped) {
            return;
        }
        event.preventDefault();
        sendEvent({
            t: 'key',
            state: 'up',
            key: mapped.name,
            code: mapped.code,
        });
    };

    win.addEventListener('keydown', onKeyDown, true);
    win.addEventListener('keyup', onKeyUp, true);

    function apply(json: string): void {
        const parsed = JSON.parse(json) as { t?: string; ops?: NuiOp[] } | NuiPlayerMessage;
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        if (parsed.t === 'frame' && Array.isArray((parsed as { ops?: NuiOp[] }).ops)) {
            const ops = (parsed as { ops: NuiOp[] }).ops;
            for (let i = 0; i < ops.length; i++) {
                const op = ops[i];
                if (op) {
                    applyOp(op);
                }
            }
            flushMeasures();
            return;
        }
        if (parsed.t === 'player') {
            applyPlayerMessage(parsed as NuiPlayerMessage);
        }
    }

    function debug(): NuiDebugSnapshot {
        const list: NuiDebugNode[] = [];
        nodes.forEach((node) => {
            const entry: NuiDebugNode = {
                id: node.id,
                kind: node.kind,
                parentId: node.parentId,
                rect: {
                    x: typeof node.props.x === 'number' ? node.props.x : 0,
                    y: typeof node.props.y === 'number' ? node.props.y : 0,
                    w: node.props.w !== undefined ? node.props.w : 0,
                    h: node.props.h !== undefined ? node.props.h : 0,
                },
                visible: node.props.visible !== false,
            };
            if (node.props.name !== undefined) {
                entry.name = node.props.name;
            }
            if (node.kind === 'text' && node.textSpan) {
                entry.text = node.textSpan.textContent || '';
            } else if (node.kind === 'field' && node.inputEl) {
                entry.text = node.inputEl.value;
            }
            if (node.kind === 'image' && node.props.url !== undefined) {
                entry.url = node.props.url;
            }
            list.push(entry);
        });
        return {
            nodeCount: nodes.size,
            focusedId,
            imeId,
            keyboard: keyboard.state(),
            nodes: list,
        };
    }

    function destroy(): void {
        win.removeEventListener('keydown', onKeyDown, true);
        win.removeEventListener('keyup', onKeyUp, true);
        keyboard.destroy();
        players.forEach((entry) => {
            stopPlayerTimer(entry);
            destroyPlayerHls(entry);
            if (entry.video.parentNode) {
                entry.video.parentNode.removeChild(entry.video);
            }
        });
        players.clear();
        planes.forEach((_plane, id) => removePlane(id));
        nodes.forEach((node) => {
            if (node.el.parentNode) {
                node.el.parentNode.removeChild(node.el);
            }
        });
        nodes.clear();
        rootChildIds.length = 0;
        fieldInputs.clear();
        suppressedKeyCodes.clear();
    }

    return { apply, debug, destroy, planeFrame, hideKeyboard: keyboard.hide };
}
