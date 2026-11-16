import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { AppManifest } from '@tvemu/protocol';
import { WgtError } from './wgt-error.js';

const WIDGET_NAMESPACE = 'http://www.w3.org/ns/widgets';
const TIZEN_NAMESPACE = 'http://tizen.org/ns/widgets';

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
        if (prefix && !namespaces[prefix]) throw new WgtError('INVALID_CONFIG', `Unbound XML prefix: ${prefix}`);
        const children = record[name] as XmlRecord[];
        const nested = elements(children, namespaces);
        const text = children.map((child) => String(child['#text'] ?? '')).join('');
        return [{ name: parts.at(-1)!, namespace: namespaces[prefix] ?? '', attributes, children: nested, text }];
    });
}

export function parseConfigXml(xml: string): AppManifest {
    try {
        if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) {
            throw new WgtError('INVALID_CONFIG', 'Malformed or unsupported config.xml');
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
        if (roots.length !== 1 || root?.name !== 'widget' || root.namespace !== WIDGET_NAMESPACE) {
            throw new WgtError('INVALID_CONFIG', 'Expected a W3C widget root');
        }
        const matches = (name: string, namespace = WIDGET_NAMESPACE) =>
            root.children.filter((child) => child.name === name && child.namespace === namespace);
        const first = (name: string, namespace = WIDGET_NAMESPACE) => matches(name, namespace)[0];
        const application = first('application', TIZEN_NAMESPACE);
        const appId = application?.attributes.id;
        const packageId = application?.attributes.package;
        if (!appId?.trim() || !packageId?.trim()) {
            throw new WgtError('INVALID_CONFIG', 'Missing Tizen application id or package');
        }
        return {
            widgetId: root.attributes.id ?? '',
            version: root.attributes.version ?? '',
            appId,
            packageId,
            requiredVersion: application?.attributes.required_version ?? '',
            name: first('name')?.text.trim() || appId,
            contentSrc: first('content')?.attributes.src ?? 'index.html',
            icon: first('icon')?.attributes.src ?? null,
            privileges: matches('privilege', TIZEN_NAMESPACE)
                .flatMap((entry) => entry.attributes.name === undefined ? [] : [{ name: entry.attributes.name }]),
            features: matches('feature').flatMap((entry) => entry.attributes.name === undefined ? [] : [entry.attributes.name]),
            contentSecurityPolicy: first('content-security-policy', TIZEN_NAMESPACE)?.text.trim() ?? null,
            accessOrigins: matches('access').flatMap((entry) => entry.attributes.origin === undefined ? [] : [entry.attributes.origin]),
            settings: first('setting', TIZEN_NAMESPACE)?.attributes ?? {},
            profile: first('profile', TIZEN_NAMESPACE)?.attributes.name ?? null,
        };
    } catch (error) {
        if (error instanceof WgtError) throw error;
        throw new WgtError('INVALID_CONFIG', 'Unable to parse config.xml', { cause: error });
    }
}

export function validateManifest(manifest: AppManifest): { warnings: string[] } {
    const warnings: string[] = [];
    if (!/^[A-Za-z0-9]+$/.test(manifest.packageId)) warnings.push('Package id should contain only alphanumeric characters');
    if (!manifest.appId.startsWith(`${manifest.packageId}.`) || manifest.appId.length <= manifest.packageId.length + 1) {
        warnings.push('Application id should be <packageId>.<name>');
    }
    return { warnings };
}
