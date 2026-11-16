import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
    DEFAULT_PROFILES,
    findDeviceProfile,
    resolveEngine,
    type ResolveEngineOptions,
    type ResolvedEngine,
} from '@tvemu/engine';
import type { DeviceProfile } from '@tvemu/protocol';

export interface ProfileSelection {
    profile: DeviceProfile;
    reason: string;
    resolved: ResolvedEngine | null;
}

export interface SelectDeviceProfileOptions extends Omit<ResolveEngineOptions, 'home'> {
    overrides?: Record<string, unknown>;
    strictEngine?: boolean;
}

const STRING_PROFILE_FIELDS = new Set<keyof DeviceProfile>([
    'name',
    'label',
    'tizenVersion',
    'userAgent',
    'model',
    'modelCode',
    'firmware',
    'duid',
    'locale',
    'country',
]);

const NUMBER_PROFILE_FIELDS = new Set<keyof DeviceProfile>([
    'modelYear',
    'chromiumMilestone',
    'width',
    'height',
    'cpuThrottle',
]);

function assignProfileField(
    target: Record<string, unknown>,
    key: string,
    value: unknown,
    sourceLabel: string,
): void {
    const field = key as keyof DeviceProfile;
    if (STRING_PROFILE_FIELDS.has(field)) {
        if (typeof value !== 'string') {
            throw new Error(`DeviceProfile field "${key}" in ${sourceLabel} must be a string`);
        }
        target[key] = value;
        return;
    }
    if (NUMBER_PROFILE_FIELDS.has(field)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            throw new Error(`DeviceProfile field "${key}" in ${sourceLabel} must be a positive number`);
        }
        target[key] = value;
        return;
    }
    throw new Error(`Unknown DeviceProfile field "${key}" in ${sourceLabel}`);
}

export function applyProfileOverrides(
    base: DeviceProfile,
    overrides: Record<string, unknown>,
    sourceLabel: string,
): DeviceProfile {
    const next: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        assignProfileField(next, key, value, sourceLabel);
    }
    return next as unknown as DeviceProfile;
}

export function parseProfileSetArgs(rawEntries: readonly string[]): Record<string, unknown> {
    const overrides: Record<string, unknown> = {};
    for (const entry of rawEntries) {
        const eqIndex = entry.indexOf('=');
        if (eqIndex <= 0) {
            throw new Error(`Invalid --set value "${entry}": expected key=value`);
        }
        const key = entry.slice(0, eqIndex).trim();
        const rawValue = entry.slice(eqIndex + 1);
        const field = key as keyof DeviceProfile;
        if (STRING_PROFILE_FIELDS.has(field)) {
            overrides[key] = rawValue;
        } else if (NUMBER_PROFILE_FIELDS.has(field)) {
            const parsed = Number(rawValue);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new Error(`DeviceProfile field "${key}" in --set must be a positive number`);
            }
            overrides[key] = parsed;
        } else {
            throw new Error(`Unknown DeviceProfile field "${key}" in --set`);
        }
    }
    return overrides;
}

export async function loadProfileFileOverrides(
    home: string,
    profileName: string,
): Promise<Record<string, unknown> | null> {
    const filePath = path.join(home, 'profiles', `${profileName}.json`);
    let raw: string;
    try {
        raw = await readFile(filePath, 'utf8');
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid profile override JSON in ${filePath}: ${detail}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Profile override file ${filePath} must contain a JSON object`);
    }
    return parsed as Record<string, unknown>;
}

export async function loadDeviceProfile(
    home: string,
    base: DeviceProfile,
    cliOverrides?: Record<string, unknown>,
): Promise<DeviceProfile> {
    let profile = base;
    const fileOverrides = await loadProfileFileOverrides(home, base.name);
    if (fileOverrides) {
        profile = applyProfileOverrides(profile, fileOverrides, `${base.name}.json`);
    }
    if (cliOverrides && Object.keys(cliOverrides).length > 0) {
        profile = applyProfileOverrides(profile, cliOverrides, '--set');
    }
    return profile;
}

async function tryResolveForProfile(
    milestone: number,
    home: string,
    options?: SelectDeviceProfileOptions,
): Promise<ResolvedEngine | null> {
    try {
        return await resolveEngine(milestone, {
            home,
            env: options?.env,
            playwrightCacheDir: options?.playwrightCacheDir,
        });
    } catch {
        return null;
    }
}

export async function selectDeviceProfile(
    home: string,
    explicitName?: string,
    resolveOptions?: SelectDeviceProfileOptions,
): Promise<ProfileSelection> {
    if (explicitName !== undefined) {
        const base = findDeviceProfile(explicitName);
        if (!base) {
            const available = DEFAULT_PROFILES.map((item) => item.name).join(', ');
            throw new Error(`Unknown device profile: ${explicitName}. Available: ${available}`);
        }
        const profile = await loadDeviceProfile(home, base, resolveOptions?.overrides);
        const resolved = await tryResolveForProfile(profile.chromiumMilestone, home, resolveOptions);
        if (resolveOptions?.strictEngine && (!resolved || !resolved.exact)) {
            const foundDetail = resolved
                ? `found Chromium ${resolved.version} via ${resolved.source}`
                : 'no Chromium engine found';
            throw new Error(
                `Exact Chromium M${profile.chromiumMilestone} required for profile ${profile.name} (--strict-engine), ` +
                `but ${foundDetail}. Install it with: tvemu engine install ${profile.chromiumMilestone}`,
            );
        }
        return {
            profile,
            reason: `explicit --profile ${profile.name} (${profile.label})`,
            resolved,
        };
    }

    const candidates: Array<{ profile: DeviceProfile; resolved: ResolvedEngine | null }> = [];
    for (const base of DEFAULT_PROFILES) {
        const profile = await loadDeviceProfile(home, base, resolveOptions?.overrides);
        const resolved = await tryResolveForProfile(profile.chromiumMilestone, home, resolveOptions);
        candidates.push({ profile, resolved });
    }

    const default2020 = candidates[0];
    if (default2020?.resolved?.exact) {
        return {
            profile: default2020.profile,
            reason:
                `default 2020 profile ${default2020.profile.name} ` +
                `(Chromium ${default2020.profile.chromiumMilestone} exact via ${default2020.resolved.source})`,
            resolved: default2020.resolved,
        };
    }

    const newestFirst = [...candidates].reverse();
    for (const candidate of newestFirst) {
        if (candidate.resolved?.exact) {
            return {
                profile: candidate.profile,
                reason:
                    `newest available exact profile ${candidate.profile.name} ` +
                    `(Chromium ${candidate.profile.chromiumMilestone} exact via ${candidate.resolved.source})`,
                resolved: candidate.resolved,
            };
        }
    }

    if (resolveOptions?.strictEngine) {
        throw new Error(
            'No profile has an exact Chromium engine available (--strict-engine). ' +
            'Install one with: tvemu engine install 69',
        );
    }

    for (const candidate of newestFirst) {
        if (candidate.resolved) {
            return {
                profile: candidate.profile,
                reason:
                    `newest available profile ${candidate.profile.name} ` +
                    `(approximate Chromium ${candidate.resolved.version} instead of ` +
                    `M${candidate.profile.chromiumMilestone} via ${candidate.resolved.source})`,
                resolved: candidate.resolved,
            };
        }
    }

    const fallback = candidates[0];
    if (!fallback) {
        throw new Error('No default profiles configured');
    }
    return {
        profile: fallback.profile,
        reason:
            `fallback ${fallback.profile.name} ` +
            `(no Chromium engine currently resolved; run: tvemu engine install ${fallback.profile.chromiumMilestone})`,
        resolved: null,
    };
}
