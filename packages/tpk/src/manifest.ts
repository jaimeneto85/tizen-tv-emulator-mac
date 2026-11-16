import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { TpkError } from './tpk-error.js';

const PACKAGES_NAMESPACE = 'http://tizen.org/ns/packages';

const APP_ELEMENTS: Record<string, TpkAppKind> = {
    'ui-application': 'ui',
    'service-application': 'service',
    'widget-application': 'widget',
    'watch-application': 'watch',
    'component-based-application': 'component',
};

const DOTNET_TYPES = new Set(['dotnet', 'dotnet-nui', 'dotnet-inhouse']);

export type TpkAppKind = 'ui' | 'service' | 'widget' | 'watch' | 'component';

export interface TpkApp {
    appId: string;
    exec: string;
    type: string;
    kind: TpkAppKind;
    label: string;
    labels: Record<string, string>;
    icon: string | null;
    metadata: Record<string, string>;
    nodisplay: boolean;
    launchMode: string | null;
}

export interface TpkManifest {
    packageId: string;
    version: string;
    apiVersion: string;
    profiles: string[];
    label: string;
    privileges: string[];
    apps: TpkApp[];
    signed: { author: boolean; distributor: boolean };
}

type XmlRecord = Record<string, unknown>;

interface XmlElement {
    name: string;
    namespace: string;
    attributes: Record<string, string>;
    children: XmlElement[];
    text: string;
}

function elements(records: XmlRecord[], inherited: Record<string, string> = {}): XmlElement[] {
    return records.flatMap((record): XmlElement[] => {
        const name = Object.keys(record).find((key) => key !== ':@');
        if (!name || name.startsWith('#') || name.startsWith('?')) return [];
        const rawAttributes = (record[':@'] ?? {}) as Record<string, string>;
        const namespaces = { ...inherited };
        const attributes: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawAttributes)) {
            if (key === 'xmlns') namespaces[''] = value;
            else if (key.startsWith('xmlns:')) namespaces[key.slice(6)] = value;
            else attributes[key] = value;
        }
        const parts = name.split(':');
        const prefix = parts.length > 1 ? parts[0]! : '';
        if (prefix && !namespaces[prefix]) throw new TpkError('INVALID_MANIFEST', `Unbound XML prefix: ${prefix}`);
        const children = record[name] as XmlRecord[];
        const nested = elements(children, namespaces);
        const text = children.map((child) => String(child['#text'] ?? '')).join('');
        return [{ name: parts.at(-1)!, namespace: namespaces[prefix] ?? '', attributes, children: nested, text }];
    });
}

function parseApp(element: XmlElement): TpkApp[] {
    if (element.namespace !== PACKAGES_NAMESPACE) return [];
    const kind = APP_ELEMENTS[element.name];
    if (!kind) return [];
    const labels: Record<string, string> = {};
    for (const label of element.children.filter((child) => child.name === 'label' && child.namespace === PACKAGES_NAMESPACE)) {
        const lang = label.attributes['xml:lang'] ?? '';
        if (!(lang in labels)) labels[lang] = label.text.trim();
    }
    const metadata: Record<string, string> = {};
    for (const entry of element.children.filter((child) => child.name === 'metadata' && child.namespace === PACKAGES_NAMESPACE)) {
        const key = entry.attributes.key;
        if (key !== undefined && !(key in metadata)) metadata[key] = entry.attributes.value ?? '';
    }
    const labelList = Object.values(labels);
    return [{
        appId: element.attributes.appid ?? '',
        exec: element.attributes.exec ?? '',
        type: element.attributes.type ?? '',
        kind,
        label: labels[''] ?? labelList[0] ?? '',
        labels,
        icon: element.children.find((child) => child.name === 'icon' && child.namespace === PACKAGES_NAMESPACE)?.text.trim() || null,
        metadata,
        nodisplay: element.attributes.nodisplay === 'true',
        launchMode: element.attributes.launch_mode ?? null,
    }];
}

export function parseTizenManifest(xml: string): Omit<TpkManifest, 'signed'> {
    try {
        if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) {
            throw new TpkError('INVALID_MANIFEST', 'Malformed or unsupported tizen-manifest.xml');
        }
        const parser = new XMLParser({
            preserveOrder: true,
            ignoreAttributes: false,
            attributeNamePrefix: '',
            parseTagValue: false,
            parseAttributeValue: false,
            trimValues: false,
        });
        const roots = elements(parser.parse(xml) as XmlRecord[]);
        const root = roots[0];
        if (roots.length !== 1 || root?.name !== 'manifest' || root.namespace !== PACKAGES_NAMESPACE) {
            throw new TpkError('INVALID_MANIFEST', 'Expected a Tizen packages manifest root');
        }
        const packageId = root.attributes.package;
        if (!packageId?.trim()) throw new TpkError('INVALID_MANIFEST', 'Missing manifest package attribute');
        const matches = (name: string) => root.children.filter((child) => child.name === name && child.namespace === PACKAGES_NAMESPACE);
        const apps = root.children.flatMap((child) => parseApp(child));
        if (apps.length === 0) throw new TpkError('INVALID_MANIFEST', 'Manifest declares no application');
        return {
            packageId,
            version: root.attributes.version ?? '',
            apiVersion: root.attributes['api-version'] ?? '',
            profiles: matches('profile').flatMap((entry) => entry.attributes.name === undefined ? [] : [entry.attributes.name]),
            label: matches('label')[0]?.text.trim() ?? '',
            privileges: matches('privileges').flatMap((group) => group.children
                .filter((child) => child.name === 'privilege' && child.namespace === PACKAGES_NAMESPACE)
                .flatMap((child) => child.text.trim() === '' ? [] : [child.text.trim()])),
            apps,
        };
    } catch (error) {
        if (error instanceof TpkError) throw error;
        throw new TpkError('INVALID_MANIFEST', 'Unable to parse tizen-manifest.xml', { cause: error });
    }
}

export function isDotnetApp(app: TpkApp): boolean {
    return DOTNET_TYPES.has(app.type.trim().toLowerCase());
}

export function mainUiApp(manifest: TpkManifest): TpkApp {
    const app = manifest.apps.find((candidate) => candidate.kind === 'ui');
    if (!app) throw new TpkError('NO_UI_APP', 'Package declares no ui-application');
    if (!isDotnetApp(app)) {
        const nativeType = app.type || 'capp';
        throw new TpkError(
            'NOT_DOTNET',
            `Application "${app.appId}" is a native (${nativeType}, capp/c++app) package; native apps need the Tizen OS and are not supported`,
        );
    }
    return app;
}
