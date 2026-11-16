import type { AppManifest } from '@tvemu/protocol';
import {
    IO_ERR,
    INVALID_VALUES_ERR,
    NOT_FOUND_ERR,
    SECURITY_ERR,
    WebAPIException,
    expectFunction,
    expectString,
    webAPIErrorFor
} from './errors.js';
import { defineFrozen, nextTick } from './env.js';
import type { PrivilegeChecker } from './privileges.js';

interface FSNode {
    name: string;
    created: number;
    modified: number;
    content: string | null;
    children: Record<string, FSNode> | null;
}

const READ_ONLY_ROOTS = new Set(['wgt-package']);
const VALID_MODES = new Set(['r', 'w', 'a']);
const VALID_ENCODINGS = new Set(['UTF-8', 'ISO-8859-1']);

function makeNode(name: string, isDirectory: boolean, now: number): FSNode {
    return {
        name,
        created: now,
        modified: now,
        content: isDirectory ? null : '',
        children: isDirectory ? {} : null
    };
}

function isValidName(name: string): boolean {
    return name.length > 0 && name.length <= 256 && name !== '.' && name !== '..';
}

function toBase64(text: string): string {
    let result = '';
    for (let i = 0; i < text.length; i += 1) {
        result += String.fromCharCode(text.charCodeAt(i) & 0xff);
    }
    return btoa(result);
}

function fromBase64(encoded: string): string {
    const decoded = atob(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i += 1) {
        result += String.fromCharCode(decoded.charCodeAt(i));
    }
    return result;
}

function deliverFailure(errorCallback: unknown, error: unknown): void {
    if (typeof errorCallback === 'function') {
        const apiError = error instanceof WebAPIException ? webAPIErrorFor(error) : error;
        nextTick(() => (errorCallback as (error: unknown) => void)(apiError));
        return;
    }
    if (error instanceof WebAPIException) {
        throw error;
    }
    throw new WebAPIException(undefined, error instanceof Error ? error.message : String(error));
}

function deliverSuccess(callback: unknown, ...args: unknown[]): void {
    nextTick(() => {
        if (typeof callback === 'function') {
            (callback as (...values: unknown[]) => void)(...args);
        }
    });
}

export class VirtualFileSystem {
    private readonly roots = new Map<string, FSNode>();
    private readonly storageKey: string;
    private loaded = false;

    constructor(private readonly manifestProvider: () => AppManifest | null) {
        const manifest = manifestProvider();
        const appId = manifest ? manifest.appId : 'unknown';
        this.storageKey = `tvemu.fs.v1:${appId}`;
    }

    private load(): void {
        if (this.loaded) {
            return;
        }
        this.loaded = true;
        const seedNames = ['documents', 'downloads', 'wgt-private', 'wgt-private-tmp', 'wgt-package', 'images', 'music', 'videos'];
        try {
            const raw = window.localStorage.getItem(this.storageKey);
            if (raw) {
                const parsed = JSON.parse(raw) as Record<string, FSNode>;
                for (const name of Object.keys(parsed)) {
                    const node = parsed[name];
                    if (node) {
                        this.roots.set(name, this.revive(node));
                    }
                }
            }
        } catch {
            this.roots.clear();
        }
        const now = Date.now();
        for (const name of seedNames) {
            if (!this.roots.has(name)) {
                this.roots.set(name, makeNode(name, true, now));
            }
        }
    }

    private revive(raw: FSNode): FSNode {
        const node: FSNode = {
            name: raw.name,
            created: raw.created,
            modified: raw.modified,
            content: raw.content,
            children: null
        };
        if (raw.children) {
            node.children = {};
            for (const name of Object.keys(raw.children)) {
                const child = raw.children[name];
                if (child) {
                    node.children[name] = this.revive(child);
                }
            }
        }
        return node;
    }

    private persist(): void {
        const plain: Record<string, FSNode> = {};
        for (const [name, node] of this.roots) {
            plain[name] = node;
        }
        try {
            window.localStorage.setItem(this.storageKey, JSON.stringify(plain));
        } catch {
            throw new WebAPIException(IO_ERR, 'failed to persist filesystem');
        }
    }

    private splitPath(location: string): string[] {
        return location.split('/').filter((part) => part.length > 0);
    }

    private nodeFor(fullPath: string): FSNode | null {
        this.load();
        const parts = this.splitPath(fullPath);
        const rootName = parts[0];
        if (rootName === undefined) {
            return null;
        }
        const root = this.roots.get(rootName);
        if (!root) {
            return null;
        }
        let node = root;
        for (let i = 1; i < parts.length; i += 1) {
            if (!node.children) {
                return null;
            }
            const segment = parts[i];
            if (segment === undefined) {
                return null;
            }
            const child = node.children[segment];
            if (!child) {
                return null;
            }
            node = child;
        }
        return node;
    }

    private assertWritable(fullPath: string): void {
        const root = this.splitPath(fullPath)[0];
        if (root !== undefined && READ_ONLY_ROOTS.has(root)) {
            throw new WebAPIException(SECURITY_ERR, `${root} is read-only`);
        }
    }

    private static checkSegments(parts: string[]): void {
        for (const part of parts) {
            if (!isValidName(part)) {
                throw new WebAPIException(INVALID_VALUES_ERR, `invalid path segment: ${part}`);
            }
        }
    }

    private matchFilter(node: FSNode, filter: unknown): boolean {
        if (filter === undefined || filter === null) {
            return true;
        }
        const criteria = filter as Record<string, unknown>;
        if (typeof criteria.name === 'string' && criteria.name.length > 0) {
            const escaped = criteria.name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
            if (!new RegExp('^' + escaped + '$', 'i').test(node.name)) {
                return false;
            }
        }
        if (typeof criteria.startModified === 'number' && node.modified < criteria.startModified) {
            return false;
        }
        if (typeof criteria.endModified === 'number' && node.modified > criteria.endModified) {
            return false;
        }
        if (typeof criteria.startCreated === 'number' && node.created < criteria.startCreated) {
            return false;
        }
        if (typeof criteria.endCreated === 'number' && node.created > criteria.endCreated) {
            return false;
        }
        return true;
    }

    private makeFile(fullPath: string, resolvedMode: string, privileges: PrivilegeChecker): Record<string, unknown> {
        const fs = this;
        const node = (): FSNode => {
            const found = fs.nodeFor(fullPath);
            if (!found) {
                throw new WebAPIException(NOT_FOUND_ERR, `path not found: ${fullPath}`);
            }
            return found;
        };
        const requireWritable = (): void => {
            if (resolvedMode === 'r') {
                throw new WebAPIException(SECURITY_ERR, 'file was resolved read-only');
            }
            fs.assertWritable(fullPath);
        };
        const childPath = (name: string): string => `${fullPath}/${name}`;
        const makeStream = (target: FSNode, mode: string, encoding: string): Record<string, unknown> => {
            let closed = false;
            let buffer = mode === 'r' ? target.content || '' : '';
            let position = mode === 'a' ? buffer.length : 0;
            const live = (): void => {
                if (closed) {
                    throw new WebAPIException(INVALID_VALUES_ERR, 'stream is closed');
                }
            };
            const writable = (): void => {
                live();
                if (mode === 'r') {
                    throw new WebAPIException(SECURITY_ERR, 'stream is read-only');
                }
            };
            const readText = (count: unknown): string => {
                live();
                const amount = Number(count);
                const end = Number.isNaN(amount) ? position : Math.min(buffer.length, position + Math.max(0, amount));
                const slice = buffer.slice(position, end);
                position = end;
                return slice;
            };
            const writeText = (text: unknown): void => {
                writable();
                const value = expectString(text);
                buffer = buffer.slice(0, position) + value + buffer.slice(position + value.length);
                position += value.length;
            };
            const stream: Record<string, unknown> = {
                get eof() {
                    live();
                    return position >= buffer.length;
                },
                get position() {
                    live();
                    return position;
                },
                set position(value: unknown) {
                    live();
                    const next = typeof value === 'number' ? value : Number(value);
                    if (Number.isNaN(next) || next < 0 || next > buffer.length) {
                        throw new WebAPIException(INVALID_VALUES_ERR, 'position out of range');
                    }
                    position = next;
                },
                get bytesAvailable() {
                    live();
                    return position >= buffer.length ? -1 : buffer.length - position;
                },
                close() {
                    if (closed) {
                        return;
                    }
                    closed = true;
                    if (mode !== 'r') {
                        fs.assertWritable(fullPath);
                        target.content = buffer;
                        target.modified = Date.now();
                        fs.persist();
                    }
                },
                read: readText,
                readBytes(count: unknown) {
                    const chunk = readText(count);
                    const bytes: number[] = [];
                    for (let i = 0; i < chunk.length; i += 1) {
                        bytes.push(chunk.charCodeAt(i));
                    }
                    return bytes;
                },
                readBase64(count: unknown) {
                    return toBase64(readText(count));
                },
                write: writeText,
                writeBytes(bytes: unknown) {
                    if (!Array.isArray(bytes)) {
                        throw new WebAPIException(INVALID_VALUES_ERR, 'bytes must be an array');
                    }
                    let text = '';
                    for (const byte of bytes) {
                        text += String.fromCharCode(Number(byte) & 0xff);
                    }
                    writeText(text);
                },
                writeBase64(encoded: unknown) {
                    writeText(fromBase64(expectString(encoded)));
                }
            };
            return stream;
        };

        const file: Record<string, unknown> = {
            get parent(): unknown {
                const parts = fs.splitPath(fullPath);
                if (parts.length <= 1) {
                    return null;
                }
                return fs.makeFile('/' + parts.slice(0, -1).join('/'), resolvedMode, privileges);
            },
            get readOnly(): boolean {
                return false;
            },
            get isFile(): boolean {
                return node().children === null;
            },
            get isDirectory(): boolean {
                return node().children !== null;
            },
            get created(): Date {
                return new Date(node().created);
            },
            get modified(): Date {
                return new Date(node().modified);
            },
            get path(): string {
                return '/' + fs.splitPath(fullPath).slice(0, -1).join('/');
            },
            get name(): string {
                const parts = fs.splitPath(fullPath);
                const last = parts.length > 0 ? parts[parts.length - 1] : undefined;
                return last === undefined ? '' : last;
            },
            get fullPath(): string {
                return fullPath;
            },
            get fileSize(): number {
                const target = node();
                return target.content ? target.content.length : 0;
            },
            get length(): number {
                const target = node();
                return target.children ? Object.keys(target.children).length : 0;
            },
            toURI(): string {
                return 'file://' + fullPath;
            },
            listFiles(successCallback: unknown, errorCallback?: unknown, filter?: unknown): void {
                privileges.check('tizen.filesystem.read');
                try {
                    const target = node();
                    if (!target.children) {
                        throw new WebAPIException(IO_ERR, 'not a directory');
                    }
                    expectFunction(successCallback);
                    const children = target.children;
                    const entries = Object.keys(children)
                        .filter((name) => children[name] !== undefined && fs.matchFilter(children[name] as FSNode, filter))
                        .map((name) => fs.makeFile(childPath(name), resolvedMode, privileges));
                    deliverSuccess(successCallback, entries);
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
            },
            openStream(mode: unknown, successCallback: unknown, errorCallback?: unknown, encoding?: unknown): void {
                try {
                    const openMode = expectString(mode);
                    if (!VALID_MODES.has(openMode)) {
                        throw new WebAPIException(INVALID_VALUES_ERR, `invalid mode: ${openMode}`);
                    }
                    const enc = encoding === undefined || encoding === null ? 'UTF-8' : expectString(encoding);
                    if (!VALID_ENCODINGS.has(enc)) {
                        throw new WebAPIException(INVALID_VALUES_ERR, `invalid encoding: ${enc}`);
                    }
                    if (openMode !== 'r' && resolvedMode === 'r') {
                        throw new WebAPIException(SECURITY_ERR, 'file was resolved read-only');
                    }
                    const target = node();
                    expectFunction(successCallback);
                    deliverSuccess(successCallback, makeStream(target, openMode, enc));
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
            },
            readAsText(successCallback: unknown, errorCallback?: unknown, encoding?: unknown): void {
                privileges.check('tizen.filesystem.write');
                try {
                    const enc = encoding === undefined || encoding === null ? 'UTF-8' : expectString(encoding);
                    if (!VALID_ENCODINGS.has(enc)) {
                        throw new WebAPIException(INVALID_VALUES_ERR, `invalid encoding: ${enc}`);
                    }
                    const target = node();
                    if (target.children) {
                        throw new WebAPIException(IO_ERR, 'not a file');
                    }
                    expectFunction(successCallback);
                    deliverSuccess(successCallback, target.content || '');
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
            },
            createDirectory(path: unknown): unknown {
                requireWritable();
                const name = expectString(path);
                VirtualFileSystem.checkSegments([name]);
                const target = node();
                if (!target.children) {
                    throw new WebAPIException(IO_ERR, 'not a directory');
                }
                if (target.children[name]) {
                    throw new WebAPIException(IO_ERR, `already exists: ${name}`);
                }
                target.children[name] = makeNode(name, true, Date.now());
                target.modified = Date.now();
                fs.persist();
                return fs.makeFile(childPath(name), resolvedMode, privileges);
            },
            createFile(path: unknown): unknown {
                requireWritable();
                const name = expectString(path);
                VirtualFileSystem.checkSegments([name]);
                const target = node();
                if (!target.children) {
                    throw new WebAPIException(IO_ERR, 'not a directory');
                }
                if (target.children[name]) {
                    throw new WebAPIException(IO_ERR, `already exists: ${name}`);
                }
                target.children[name] = makeNode(name, false, Date.now());
                target.modified = Date.now();
                fs.persist();
                return fs.makeFile(childPath(name), resolvedMode, privileges);
            },
            resolve(relativePath: unknown): unknown {
                const relative = expectString(relativePath);
                if (relative === '') {
                    return file;
                }
                const parts = relative.split('/').filter((part) => part.length > 0);
                let current = fullPath;
                for (const part of parts) {
                    if (part === '.') {
                        continue;
                    }
                    if (part === '..') {
                        const up = fs.splitPath(current);
                        up.pop();
                        current = '/' + up.join('/');
                        continue;
                    }
                    current = current + '/' + part;
                }
                return fs.nodeFor(current) ? fs.makeFile(current, resolvedMode, privileges) : null;
            },
            copyTo(source: unknown, destination: unknown, overwrite: unknown, successCallback?: unknown, errorCallback?: unknown): void {
                transfer(source, destination, overwrite, false, successCallback, errorCallback);
            },
            moveTo(source: unknown, destination: unknown, overwrite: unknown, successCallback?: unknown, errorCallback?: unknown): void {
                transfer(source, destination, overwrite, true, successCallback, errorCallback);
            },
            deleteDirectory(path: unknown, recursive: unknown, successCallback?: unknown, errorCallback?: unknown): void {
                try {
                    requireWritable();
                    const name = expectString(path);
                    VirtualFileSystem.checkSegments([name]);
                    const target = node();
                    if (!target.children) {
                        throw new WebAPIException(IO_ERR, 'not a directory');
                    }
                    const child = target.children[name];
                    if (!child || child.children === null) {
                        throw new WebAPIException(IO_ERR, `not a direct child directory: ${name}`);
                    }
                    if (Object.keys(child.children).length > 0 && recursive !== true) {
                        throw new WebAPIException(IO_ERR, 'directory is not empty');
                    }
                    delete target.children[name];
                    target.modified = Date.now();
                    fs.persist();
                    deliverSuccess(successCallback);
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
            },
            deleteFile(path: unknown, successCallback?: unknown, errorCallback?: unknown): void {
                try {
                    requireWritable();
                    const name = expectString(path);
                    VirtualFileSystem.checkSegments([name]);
                    const target = node();
                    if (!target.children) {
                        throw new WebAPIException(IO_ERR, 'not a directory');
                    }
                    const child = target.children[name];
                    if (!child || child.children !== null) {
                        throw new WebAPIException(IO_ERR, `not a direct child file: ${name}`);
                    }
                    delete target.children[name];
                    target.modified = Date.now();
                    fs.persist();
                    deliverSuccess(successCallback);
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
            }
        };

        function transfer(source: unknown, destination: unknown, overwrite: unknown, move: boolean, successCallback?: unknown, errorCallback?: unknown): void {
            try {
                requireWritable();
                const sourceName = expectString(source);
                const destName = expectString(destination);
                const allowOverwrite = typeof overwrite === 'boolean' ? overwrite : Boolean(overwrite);
                VirtualFileSystem.checkSegments([sourceName, destName]);
                const target = node();
                if (!target.children) {
                    throw new WebAPIException(IO_ERR, 'not a directory');
                }
                const child = target.children[sourceName];
                if (!child) {
                    throw new WebAPIException(IO_ERR, `not a direct child: ${sourceName}`);
                }
                if (target.children[destName] && !allowOverwrite) {
                    throw new WebAPIException(IO_ERR, `already exists: ${destName}`);
                }
                target.children[destName] = {
                    name: destName,
                    created: Date.now(),
                    modified: Date.now(),
                    content: child.content,
                    children: child.children ? { ...child.children } : null
                };
                if (move) {
                    delete target.children[sourceName];
                }
                target.modified = Date.now();
                fs.persist();
                deliverSuccess(successCallback);
            } catch (error) {
                deliverFailure(errorCallback, error);
            }
        }

        return file;
    }

    buildManager(privileges: PrivilegeChecker): Record<string, unknown> {
        const fs = this;
        return {
            maxPathLength: 256,
            resolve(location: unknown, successCallback: unknown, errorCallback?: unknown, mode?: unknown) {
                try {
                    const target = expectString(location);
                    const openMode = mode === undefined || mode === null ? 'rw' : expectString(mode);
                    if (openMode !== 'r' && openMode !== 'rw') {
                        throw new WebAPIException(INVALID_VALUES_ERR, `invalid mode: ${openMode}`);
                    }
                    const parts = fs.splitPath(target);
                    fs.load();
                    if (parts.length === 0 || parts[0] === undefined || !fs.roots.has(parts[0])) {
                        throw new WebAPIException(NOT_FOUND_ERR, `unknown location: ${target}`);
                    }
                    VirtualFileSystem.checkSegments(parts);
                    if (!fs.nodeFor(parts.join('/'))) {
                        throw new WebAPIException(NOT_FOUND_ERR, `path not found: ${target}`);
                    }
                    expectFunction(successCallback);
                    deliverSuccess(successCallback, fs.makeFile('/' + parts.join('/'), openMode, privileges));
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
                return undefined;
            },
            getStorage(label: unknown, successCallback: unknown, errorCallback?: unknown) {
                try {
                    const name = expectString(label);
                    expectFunction(successCallback);
                    const found = fs.storageList().find((entry) => entry.label === name);
                    if (!found) {
                        throw new WebAPIException(NOT_FOUND_ERR, `unknown storage: ${name}`);
                    }
                    deliverSuccess(successCallback, found);
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
                return undefined;
            },
            listStorages(successCallback: unknown, errorCallback?: unknown) {
                try {
                    expectFunction(successCallback);
                    deliverSuccess(successCallback, fs.storageList());
                } catch (error) {
                    deliverFailure(errorCallback, error);
                }
                return undefined;
            },
            addStorageStateChangeListener(callback: unknown, errorCallback?: unknown) {
                expectFunction(callback);
                return Date.now();
            },
            removeStorageStateChangeListener(id: unknown) {
                if (typeof id !== 'number') {
                    throw new WebAPIException(INVALID_VALUES_ERR, 'listener id must be a number');
                }
                return undefined;
            }
        };
    }

    private storageList(): Array<Record<string, unknown>> {
        this.load();
        return [
            defineFrozen({}, { label: 'InternalFlash', type: 'INTERNAL', state: 'MOUNTED' }),
            defineFrozen({}, { label: 'MMC', type: 'EXTERNAL', state: 'REMOVED' })
        ];
    }
}
