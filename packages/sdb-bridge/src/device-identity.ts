import type { HostApi } from '@tvemu/protocol';
export const SDK_TOOLS = '/home/owner/share/tmp/sdk_tools';
export const APP_ROOT = '/home/owner/apps_rw';
export function capability(host: HostApi): Buffer {
    const profile = host.deviceInfo();
    const text = Object.entries({
        secure_protocol: 'enabled', intershell_support: 'disabled', filesync_support: 'pushpull',
        usbproto_support: 'disabled', sockproto_support: 'enabled', syncwinsz_support: 'disabled',
        sdbd_rootperm: 'disabled', rootonoff_support: 'disabled', encryption_support: 'disabled', zone_support: 'disabled',
        multiuser_support: 'enabled', cpu_arch: 'x86_64', core_abi: 'x86_64', sdk_toolpath: SDK_TOOLS,
        profile_name: 'tv', vendor_name: 'Samsung', can_launch: 'tv-samsung', device_name: profile.model,
        platform_version: profile.tizenVersion, product_version: '4.0', sdbd_version: '2.2.31',
        sdbd_plugin_version: '3.8.12_TV_EM_REL', sdbd_cap_version: '1.0', log_enable: 'disabled', log_path: '/tmp',
        appcmd_support: 'disabled', appid2pid_support: 'disabled', pkgcmd_debugmode: 'enabled',
        netcoredbg_support: 'disabled', architecture: '64', platform_build_version: profile.tizenVersion,
    }).map(([key, value]) => `${key}:${value}\n`).join('');
    const contents = Buffer.from(text + '\0');
    const length = Buffer.alloc(2);
    length.writeUInt16LE(contents.length);
    return Buffer.concat([length, contents]);
}
export function systemInfo(host: HostApi): Buffer {
    const profile = host.deviceInfo();
    const record = Buffer.alloc(320);
    ['2.2.0', profile.model, 'Tizen', profile.tizenVersion, 'tv'].forEach((value, index) => {
        record.write(value, index * 64, 63, 'utf8');
    });
    return record;
}
export function platformEnvironment(name: string): string {
    const values: Record<string, string> = {
        TZ_SDK_TOOLS: SDK_TOOLS, TZ_SDK_USER_NAME: 'owner', TZ_SDK_HOME: '/home/owner',
        TZ_SYS_RW_APP: '/opt/usr/apps', TZ_SYS_RO_APP: '/usr/apps', TZ_USER_APP: APP_ROOT,
        TZ_SYS_RW_PACKAGES: '/opt/share/packages', TZ_SYS_RO_PACKAGES: '/usr/share/packages', TZ_SYS_DEBUG_PORT: '9222',
    };
    return Object.hasOwn(values, name) ? `0${values[name]}` : '2';
}
