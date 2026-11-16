export interface UiRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface UiText {
    text: string;
    rect: UiRect;
    focused: boolean;
}

export interface UiField {
    label: string;
    value: string;
    type: string;
    rect: UiRect;
    focused: boolean;
    editing: boolean;
}

export interface UiImage {
    src: string;
    rect: UiRect;
    loaded: boolean;
}

export interface UiVideo {
    src: string;
    rect: UiRect;
    paused: boolean;
    ended: boolean;
    positionMs: number;
    durationMs: number;
    readyState: number;
    error: string | null;
}

export interface UiSnapshot {
    url: string;
    title: string;
    screen: { w: number; h: number };
    focus: { kind: string; text: string; rect: UiRect } | null;
    editing: boolean;
    texts: UiText[];
    fields: UiField[];
    images: UiImage[];
    videos: UiVideo[];
}

export const UI_SNAPSHOT_EXPRESSION = `(function () {
    var W = window.innerWidth, H = window.innerHeight;
    function rectOf(r) { return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }
    function onScreen(r) { return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H; }
    function shown(el) {
        var node = el;
        while (node && node.nodeType === 1) {
            var style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) { return false; }
            node = node.parentElement;
        }
        return true;
    }
    var nui = window.__tvemuNui;
    var active = document.activeElement;
    var editing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    var focusEl = null;
    if (nui && typeof nui.debug === 'function') {
        var focusedId = nui.debug().focusedId;
        if (focusedId) { focusEl = document.querySelector('[data-nui-id="' + focusedId + '"]'); }
    } else if (active && active !== document.body && active !== document.documentElement) {
        focusEl = active;
    }
    function inFocus(el) { return !!focusEl && (focusEl === el || focusEl.contains(el)); }
    if (editing && nui && typeof nui.debug === 'function') { editing = inFocus(active); }
    var texts = [];
    var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null, false);
    var current;
    while ((current = walker.nextNode()) && texts.length < 400) {
        var value = (current.nodeValue || '').replace(/\\s+/g, ' ').trim();
        var parent = current.parentElement;
        if (!value || !parent) { continue; }
        var tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA') { continue; }
        var range = document.createRange();
        range.selectNodeContents(current);
        var box = range.getBoundingClientRect();
        if (!onScreen(box) || !shown(parent)) { continue; }
        texts.push({ text: value, rect: rectOf(box), focused: inFocus(parent) });
    }
    var fields = [];
    Array.prototype.forEach.call(document.querySelectorAll('input, textarea, select'), function (el) {
        if (el.type === 'hidden') { return; }
        var box = el.getBoundingClientRect();
        if (!onScreen(box) || !shown(el)) { return; }
        var raw = el.value || '';
        fields.push({
            label: el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name') || '',
            value: el.type === 'password' ? new Array(raw.length + 1).join('\\u2022') : raw,
            type: el.type || el.tagName.toLowerCase(),
            rect: rectOf(box),
            focused: inFocus(el),
            editing: active === el
        });
    });
    var images = [];
    Array.prototype.forEach.call(document.querySelectorAll('img'), function (el) {
        if (el.hasAttribute('data-nui-plane')) { return; }
        var box = el.getBoundingClientRect();
        if (!onScreen(box) || !shown(el)) { return; }
        var src = el.currentSrc || el.src || '';
        images.push({ src: src.indexOf('data:') === 0 ? src.slice(0, 32) + '...' : src, rect: rectOf(box), loaded: el.complete && el.naturalWidth > 0 });
    });
    var videos = [];
    Array.prototype.forEach.call(document.querySelectorAll('video'), function (el) {
        var box = el.getBoundingClientRect();
        videos.push({
            src: el.currentSrc || el.src || '',
            rect: rectOf(box),
            paused: el.paused,
            ended: el.ended,
            positionMs: isFinite(el.currentTime) ? Math.round(el.currentTime * 1000) : 0,
            durationMs: isFinite(el.duration) ? Math.round(el.duration * 1000) : 0,
            readyState: el.readyState,
            error: el.error ? (el.error.message || 'code ' + el.error.code) : null
        });
    });
    var focus = null;
    if (focusEl) {
        var focusBox = focusEl.getBoundingClientRect();
        var parts = [];
        texts.forEach(function (entry) { if (entry.focused) { parts.push(entry.text); } });
        fields.forEach(function (entry) { if (entry.focused) { parts.push(entry.value || entry.label); } });
        focus = {
            kind: focusEl.getAttribute('data-nui-kind') || focusEl.tagName.toLowerCase(),
            text: parts.join(' ') || focusEl.getAttribute('aria-label') || '',
            rect: rectOf(focusBox)
        };
    }
    return JSON.stringify({
        url: location.href, title: document.title, screen: { w: W, h: H },
        focus: focus, editing: editing, texts: texts, fields: fields, images: images, videos: videos
    });
})()`;

export function buildTypeExpression(text: string, mode: 'replace' | 'append'): string {
    return `(function (text, append) {
    var el = document.activeElement;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) { return false; }
    var nui = window.__tvemuNui;
    if (nui && typeof nui.debug === 'function') {
        var focusedId = nui.debug().focusedId;
        var owner = focusedId ? document.querySelector('[data-nui-id="' + focusedId + '"]') : null;
        if (!owner || !(owner === el || owner.contains(el))) { return false; }
    }
    var proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, append ? el.value + text : text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
})(${JSON.stringify(text)}, ${mode === 'append' ? 'true' : 'false'})`;
}

function describeRect(rect: UiRect): string {
    return `${rect.x},${rect.y} ${rect.w}x${rect.h}`;
}

export function formatUiSnapshot(snapshot: UiSnapshot): string {
    const lines: string[] = [];
    lines.push(`screen ${snapshot.screen.w}x${snapshot.screen.h}  ${snapshot.url}`);
    lines.push(
        snapshot.focus
            ? `focus: ${snapshot.focus.kind} "${snapshot.focus.text}" at ${describeRect(snapshot.focus.rect)}${snapshot.editing ? ' (editing)' : ''}`
            : 'focus: none',
    );
    for (const field of snapshot.fields) {
        lines.push(`${field.focused ? '>' : ' '} field[${field.type}] ${field.label}: "${field.value}"  (${describeRect(field.rect)})`);
    }
    for (const text of snapshot.texts) {
        lines.push(`${text.focused ? '>' : ' '} ${text.text}  (${describeRect(text.rect)})`);
    }
    for (const image of snapshot.images) {
        lines.push(`  image ${image.loaded ? 'loaded' : 'NOT LOADED'} ${image.src}  (${describeRect(image.rect)})`);
    }
    for (const video of snapshot.videos) {
        const state = video.error ? `error ${video.error}` : video.ended ? 'ended' : video.paused ? 'paused' : 'playing';
        lines.push(`  video ${state} ${video.positionMs}/${video.durationMs} ms ${video.src}`);
    }
    return lines.join('\n');
}

export function snapshotContainsText(snapshot: UiSnapshot, needle: string): boolean {
    const wanted = needle.toLowerCase();
    return (
        snapshot.texts.some((entry) => entry.text.toLowerCase().includes(wanted)) ||
        snapshot.fields.some((entry) => entry.value.toLowerCase().includes(wanted) || entry.label.toLowerCase().includes(wanted))
    );
}

export function snapshotFocusContains(snapshot: UiSnapshot, needle: string): boolean {
    return !!snapshot.focus && snapshot.focus.text.toLowerCase().includes(needle.toLowerCase());
}

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

function centerOf(rect: UiRect): { x: number; y: number } {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function contains(outer: UiRect, point: { x: number; y: number }): boolean {
    return point.x >= outer.x && point.x <= outer.x + outer.w && point.y >= outer.y && point.y <= outer.y + outer.h;
}

export function findFocusTargets(snapshot: UiSnapshot, needle: string): UiRect[] {
    const wanted = needle.toLowerCase();
    const candidates = [
        ...snapshot.fields.map((entry) => ({ label: entry.label, rect: entry.rect })),
        ...snapshot.texts.map((entry) => ({ label: entry.text, rect: entry.rect })),
    ].filter((entry) => entry.label.toLowerCase().includes(wanted));
    const exact = candidates.filter((entry) => entry.label.toLowerCase() === wanted);
    const pool = exact.length > 0 ? exact : candidates;
    const focus = snapshot.focus;
    const inside = focus ? pool.filter((entry) => contains(focus.rect, centerOf(entry.rect))) : [];
    const outside = pool.filter((entry) => !inside.includes(entry)).reverse();
    return [...inside, ...outside].map((entry) => entry.rect);
}

export function isFocusOn(snapshot: UiSnapshot, target: UiRect): boolean {
    return !!snapshot.focus && contains(snapshot.focus.rect, centerOf(target));
}

export function arrowKeysToward(snapshot: UiSnapshot, target: UiRect): ArrowKey[] {
    const from = snapshot.focus ? centerOf(snapshot.focus.rect) : { x: 0, y: 0 };
    const to = centerOf(target);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const horizontal: ArrowKey = dx >= 0 ? 'ArrowRight' : 'ArrowLeft';
    const vertical: ArrowKey = dy >= 0 ? 'ArrowDown' : 'ArrowUp';
    const oppositeHorizontal: ArrowKey = dx >= 0 ? 'ArrowLeft' : 'ArrowRight';
    const oppositeVertical: ArrowKey = dy >= 0 ? 'ArrowUp' : 'ArrowDown';
    return Math.abs(dy) >= Math.abs(dx)
        ? [vertical, horizontal, oppositeHorizontal, oppositeVertical]
        : [horizontal, vertical, oppositeVertical, oppositeHorizontal];
}
