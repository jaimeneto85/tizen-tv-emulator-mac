import type { DeviceProfile } from '@tvemu/protocol';

export interface EngineRegistryEntry {
    milestone: number;
    tizenVersion: string;
    modelYear: number;
    platform: 'mac-x64' | 'mac-arm64';
    url: string;
    sha256: string | null;
    revision: number;
    verified: boolean;
}

export const ENGINE_REGISTRY: readonly EngineRegistryEntry[] = [
    {
        milestone: 69,
        tizenVersion: '5.5',
        modelYear: 2020,
        platform: 'mac-x64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac/576753/chrome-mac.zip',
        sha256: '19fe5c201dfbee45168bfdfe9829c82000728c38e0eda128c232b1973cbfc2a9',
        revision: 576753,
        verified: true,
    },
    {
        milestone: 76,
        tizenVersion: '6.0',
        modelYear: 2021,
        platform: 'mac-x64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac/665002/chrome-mac.zip',
        sha256: null,
        revision: 665002,
        verified: false,
    },
    {
        milestone: 85,
        tizenVersion: '6.5',
        modelYear: 2022,
        platform: 'mac-x64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac/782801/chrome-mac.zip',
        sha256: null,
        revision: 782801,
        verified: false,
    },
    {
        milestone: 94,
        tizenVersion: '7.0',
        modelYear: 2023,
        platform: 'mac-arm64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac_Arm/911516/chrome-mac.zip',
        sha256: null,
        revision: 911516,
        verified: false,
    },
    {
        milestone: 108,
        tizenVersion: '8.0',
        modelYear: 2024,
        platform: 'mac-arm64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac_Arm/1058960/chrome-mac.zip',
        sha256: null,
        revision: 1058960,
        verified: false,
    },
    {
        milestone: 120,
        tizenVersion: '9.0',
        modelYear: 2025,
        platform: 'mac-arm64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac_Arm/1217378/chrome-mac.zip',
        sha256: null,
        revision: 1217378,
        verified: false,
    },
    {
        milestone: 130,
        tizenVersion: '10.0',
        modelYear: 2026,
        platform: 'mac-arm64',
        url: 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac_Arm/1356025/chrome-mac.zip',
        sha256: null,
        revision: 1356025,
        verified: false,
    },
];

function buildSmartTvUserAgent(chromiumVersion: string, tizenVersion: string): string {
    return (
        `Mozilla/5.0 (SMART-TV; LINUX; Tizen ${tizenVersion}) AppleWebKit/537.36 ` +
        `(KHTML, like Gecko) ${chromiumVersion}/${tizenVersion} TV Safari/537.36`
    );
}

export const DEFAULT_PROFILES: DeviceProfile[] = [
    {
        name: 'tizen-5.5',
        label: '2020 Smart TV (Tizen 5.5 / M69)',
        tizenVersion: '5.5',
        modelYear: 2020,
        chromiumMilestone: 69,
        userAgent: buildSmartTvUserAgent('69.0.3497.106', '5.5'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2020',
        firmware: 'E-EMUL20WWC-0000.00',
        duid: 'TVEMULTZENAA',
        locale: 'en_US',
        country: 'US',
    },
    {
        name: 'tizen-6.0',
        label: '2021 Smart TV (Tizen 6.0 / M76)',
        tizenVersion: '6.0',
        modelYear: 2021,
        chromiumMilestone: 76,
        userAgent: buildSmartTvUserAgent('76.0.3809.126', '6.0'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2021',
        firmware: 'E-EMUL21WWC-0000.00',
        duid: 'TVEMULTZENAB',
        locale: 'en_US',
        country: 'US',
    },
    {
        name: 'tizen-6.5',
        label: '2022 Smart TV (Tizen 6.5 / M85)',
        tizenVersion: '6.5',
        modelYear: 2022,
        chromiumMilestone: 85,
        userAgent: buildSmartTvUserAgent('85.0.4183.121', '6.5'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2022',
        firmware: 'E-EMUL22WWC-0000.00',
        duid: 'TVEMULTZENAC',
        locale: 'en_US',
        country: 'US',
    },
    {
        name: 'tizen-7.0',
        label: '2023 Smart TV (Tizen 7.0 / M94)',
        tizenVersion: '7.0',
        modelYear: 2023,
        chromiumMilestone: 94,
        userAgent: buildSmartTvUserAgent('94.0.4606.81', '7.0'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2023',
        firmware: 'E-EMUL23WWC-0000.00',
        duid: 'TVEMULTZENAD',
        locale: 'en_US',
        country: 'US',
    },
    {
        name: 'tizen-8.0',
        label: '2024 Smart TV (Tizen 8.0 / M108)',
        tizenVersion: '8.0',
        modelYear: 2024,
        chromiumMilestone: 108,
        userAgent: buildSmartTvUserAgent('108.0.5359.124', '8.0'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2024',
        firmware: 'E-EMUL24WWC-0000.00',
        duid: 'TVEMULTZENAE',
        locale: 'en_US',
        country: 'US',
    },
    {
        name: 'tizen-9.0',
        label: '2025 Smart TV (Tizen 9.0 / M120)',
        tizenVersion: '9.0',
        modelYear: 2025,
        chromiumMilestone: 120,
        userAgent: buildSmartTvUserAgent('120.0.6099.109', '9.0'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2025',
        firmware: 'E-EMUL25WWC-0000.00',
        duid: 'TVEMULTZENAF',
        locale: 'en_US',
        country: 'US',
    },
    {
        name: 'tizen-10.0',
        label: '2026 Smart TV (Tizen 10.0 / M130)',
        tizenVersion: '10.0',
        modelYear: 2026,
        chromiumMilestone: 130,
        userAgent: buildSmartTvUserAgent('130.0.6723.116', '10.0'),
        width: 1920,
        height: 1080,
        cpuThrottle: 1,
        model: 'Emulator',
        modelCode: 'E-EMUL2026',
        firmware: 'E-EMUL26WWC-0000.00',
        duid: 'TVEMULTZENAG',
        locale: 'en_US',
        country: 'US',
    },
];

export function findRegistryEntry(
    milestone: number,
    registry: readonly EngineRegistryEntry[] = ENGINE_REGISTRY,
): EngineRegistryEntry | undefined {
    return registry.find((entry) => entry.milestone === milestone);
}

export function findDeviceProfile(nameOrVersion: string): DeviceProfile | undefined {
    const query = nameOrVersion.toLowerCase();
    return DEFAULT_PROFILES.find(
        (profile) =>
            profile.name.toLowerCase() === query ||
            profile.tizenVersion.toLowerCase() === query ||
            String(profile.modelYear) === query,
    );
}
