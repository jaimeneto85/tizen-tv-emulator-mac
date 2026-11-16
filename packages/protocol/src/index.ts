export type KeyAction = 'press' | 'down' | 'up';

export interface RemoteKey {
    name: string;
    code: number;
    defaultDelivered: boolean;
}

export const REMOTE_KEYS: readonly RemoteKey[] = [
    { name: 'ArrowLeft', code: 37, defaultDelivered: true },
    { name: 'ArrowUp', code: 38, defaultDelivered: true },
    { name: 'ArrowRight', code: 39, defaultDelivered: true },
    { name: 'ArrowDown', code: 40, defaultDelivered: true },
    { name: 'Enter', code: 13, defaultDelivered: true },
    { name: 'Back', code: 10009, defaultDelivered: true },
    { name: 'Exit', code: 10182, defaultDelivered: false },
    { name: '0', code: 48, defaultDelivered: false },
    { name: '1', code: 49, defaultDelivered: false },
    { name: '2', code: 50, defaultDelivered: false },
    { name: '3', code: 51, defaultDelivered: false },
    { name: '4', code: 52, defaultDelivered: false },
    { name: '5', code: 53, defaultDelivered: false },
    { name: '6', code: 54, defaultDelivered: false },
    { name: '7', code: 55, defaultDelivered: false },
    { name: '8', code: 56, defaultDelivered: false },
    { name: '9', code: 57, defaultDelivered: false },
    { name: 'Minus', code: 189, defaultDelivered: false },
    { name: 'PreviousChannel', code: 10190, defaultDelivered: false },
    { name: 'VolumeUp', code: 447, defaultDelivered: false },
    { name: 'VolumeDown', code: 448, defaultDelivered: false },
    { name: 'VolumeMute', code: 449, defaultDelivered: false },
    { name: 'ChannelUp', code: 427, defaultDelivered: false },
    { name: 'ChannelDown', code: 428, defaultDelivered: false },
    { name: 'ChannelList', code: 10073, defaultDelivered: false },
    { name: 'ColorF0Red', code: 403, defaultDelivered: false },
    { name: 'ColorF1Green', code: 404, defaultDelivered: false },
    { name: 'ColorF2Yellow', code: 405, defaultDelivered: false },
    { name: 'ColorF3Blue', code: 406, defaultDelivered: false },
    { name: 'MediaPlayPause', code: 10252, defaultDelivered: false },
    { name: 'MediaPlay', code: 415, defaultDelivered: false },
    { name: 'MediaPause', code: 19, defaultDelivered: false },
    { name: 'MediaStop', code: 413, defaultDelivered: false },
    { name: 'MediaRewind', code: 412, defaultDelivered: false },
    { name: 'MediaFastForward', code: 417, defaultDelivered: false },
    { name: 'MediaRecord', code: 416, defaultDelivered: false },
    { name: 'MediaTrackPrevious', code: 10232, defaultDelivered: false },
    { name: 'MediaTrackNext', code: 10233, defaultDelivered: false },
    { name: 'Info', code: 457, defaultDelivered: false },
    { name: 'Menu', code: 18, defaultDelivered: false },
    { name: 'Tools', code: 10135, defaultDelivered: false },
    { name: 'Guide', code: 458, defaultDelivered: false },
    { name: 'Source', code: 10072, defaultDelivered: false },
    { name: 'Caption', code: 10221, defaultDelivered: false },
    { name: 'Search', code: 10225, defaultDelivered: false },
    { name: 'Extra', code: 10253, defaultDelivered: false },
    { name: 'E-Manual', code: 10146, defaultDelivered: false },
    { name: 'PictureSize', code: 10140, defaultDelivered: false },
    { name: 'Soccer', code: 10228, defaultDelivered: false },
    { name: 'Teletext', code: 10200, defaultDelivered: false },
    { name: 'MTS', code: 10195, defaultDelivered: false },
    { name: '3D', code: 10199, defaultDelivered: false },
];

export type RemoteKeyName = string;

export function findRemoteKey(name: string): RemoteKey | undefined {
    const wanted = name.toLowerCase();
    return REMOTE_KEYS.find((key) => key.name.toLowerCase() === wanted);
}

export function findRemoteKeyByCode(code: number): RemoteKey | undefined {
    return REMOTE_KEYS.find((key) => key.code === code);
}

export interface DeviceProfile {
    name: string;
    label: string;
    tizenVersion: string;
    modelYear: number;
    chromiumMilestone: number;
    userAgent: string;
    width: number;
    height: number;
    cpuThrottle: number;
    model: string;
    modelCode: string;
    firmware: string;
    duid: string;
    locale: string;
    country: string;
    nuiDpi?: number;
}

export interface AppPrivilege {
    name: string;
}

export interface AppManifest {
    widgetId: string;
    appId: string;
    packageId: string;
    name: string;
    version: string;
    requiredVersion: string;
    contentSrc: string;
    icon: string | null;
    privileges: AppPrivilege[];
    features: string[];
    contentSecurityPolicy: string | null;
    accessOrigins: string[];
    settings: Record<string, string>;
    profile: string | null;
    kind?: 'wgt' | 'tpk';
    exec?: string;
    appType?: string;
    apiVersion?: string;
}

export interface InstalledApp {
    manifest: AppManifest;
    installDir: string;
    installedAt: string;
}

export interface LaunchOptions {
    debug?: boolean;
    profile?: string;
}

export interface HostApi {
    listApps(): Promise<InstalledApp[]>;
    installWgt(wgtPath: string): Promise<InstalledApp>;
    uninstall(packageId: string): Promise<void>;
    launch(appId: string, options?: LaunchOptions): Promise<void>;
    terminate(appId: string): Promise<void>;
    runningApp(): Promise<InstalledApp | null>;
    sendKey(key: RemoteKeyName, action?: KeyAction): Promise<void>;
    deviceInfo(): DeviceProfile;
}

export interface BridgeRequest {
    id: number;
    api: string;
    method: string;
    args: unknown[];
}

export interface BridgeResponse {
    id: number;
    ok: boolean;
    result?: unknown;
    error?: { name: string; message: string };
}

export interface BridgeEvent {
    event: string;
    payload: unknown;
}

export const BRIDGE_SEND_BINDING = '__tvemuSend';
export const BRIDGE_RECEIVE_FUNCTION = '__tvemuReceive';
export const BRIDGE_PROFILE_GLOBAL = '__tvemuProfile';
export const BRIDGE_MANIFEST_GLOBAL = '__tvemuManifest';

export interface EngineStartOptions {
    profile: DeviceProfile;
    userDataDir: string;
    injectedScripts: string[];
    windowTitle?: string;
    headless?: boolean;
    scale?: number;
}

export interface Engine {
    start(options: EngineStartOptions): Promise<void>;
    navigate(url: string): Promise<void>;
    dispatchKey(code: number, keyName: string, action: KeyAction): Promise<void>;
    evaluate<T>(expression: string): Promise<T>;
    onBindingCall(listener: (message: BridgeRequest) => void): void;
    resolveBinding(response: BridgeResponse): Promise<void>;
    emitEvent(event: BridgeEvent): Promise<void>;
    screenshot(): Promise<Buffer>;
    onExit(listener: (reason: string) => void): void;
    stop(): Promise<void>;
}

export const SDB_DEFAULT_PORT = 26101;
export const TVEMU_HOME_ENV = 'TVEMU_HOME';

export type RemoteUiClientMessage =
    | { type: 'key'; key: RemoteKeyName; action: KeyAction }
    | { type: 'launch'; appId: string }
    | { type: 'terminate' }
    | { type: 'hello' };

export type RemoteUiServerMessage =
    | { type: 'state'; profile: DeviceProfile; apps: InstalledApp[]; running: string | null; registeredKeys: string[] }
    | { type: 'log'; level: 'log' | 'warn' | 'error'; text: string };

export type NuiColor = [number, number, number, number];
export type NuiNodeKind = 'view' | 'text' | 'image' | 'field';
export type NuiHAlign = 'begin' | 'center' | 'end';
export type NuiVAlign = 'top' | 'center' | 'bottom';
export type NuiImageFitting = 'fill' | 'contain' | 'cover' | 'center';
export type NuiImePanel = 'normal' | 'email' | 'password' | 'number' | 'url';

export interface NuiProps {
    x?: number;
    y?: number;
    w?: number | null;
    h?: number | null;
    visible?: boolean;
    opacity?: number;
    scale?: [number, number];
    pivot?: [number, number];
    bg?: NuiColor;
    radius?: [number, number, number, number];
    borderWidth?: number;
    borderColor?: NuiColor;
    clip?: boolean;
    name?: string;
    text?: string;
    textColor?: NuiColor;
    pixelSize?: number;
    multiline?: boolean;
    hAlign?: NuiHAlign;
    vAlign?: NuiVAlign;
    ellipsis?: boolean;
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    lineSpacing?: number;
    placeholder?: string;
    placeholderColor?: NuiColor;
    hidden?: boolean;
    maxLength?: number;
    url?: string;
    fitting?: NuiImageFitting;
}

export interface NuiWindowProps {
    bg?: NuiColor;
}

export interface NuiImeOptions {
    panel?: NuiImePanel;
    hidden?: boolean;
}

export type NuiOp =
    | ['create', number, NuiNodeKind]
    | ['set', number, NuiProps]
    | ['insert', number, number, number]
    | ['detach', number]
    | ['destroy', number]
    | ['window', NuiWindowProps]
    | ['focus', number]
    | ['ime', number, NuiImeOptions?];

export type NuiPlayerMessage =
    | { t: 'player'; id: number; op: 'open'; url: string; plane?: boolean }
    | { t: 'player'; id: number; op: 'display'; mode: 'window' | 'none' }
    | { t: 'player'; id: number; op: 'prepare' }
    | { t: 'player'; id: number; op: 'start' }
    | { t: 'player'; id: number; op: 'pause' }
    | { t: 'player'; id: number; op: 'stop' }
    | { t: 'player'; id: number; op: 'seek'; ms: number }
    | { t: 'player'; id: number; op: 'volume'; value: number }
    | { t: 'player'; id: number; op: 'mute'; value: boolean }
    | { t: 'player'; id: number; op: 'rate'; value: number }
    | { t: 'player'; id: number; op: 'close' };

export type NuiRuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type NuiRuntimeMessage =
    | { t: 'hello'; v: number; token: string }
    | { t: 'ready' }
    | { t: 'frame'; ops: NuiOp[] }
    | NuiPlayerMessage
    | { t: 'log'; level: NuiRuntimeLogLevel; tag: string; msg: string }
    | { t: 'missing'; member: string }
    | { t: 'exit'; code: number; reason: 'app-exit' | 'crash'; error?: string };

export interface NuiWelcomeAppInfo {
    packageId: string;
    appId: string;
    exec: string;
    installDir: string;
    dataDir: string;
    locale: string;
}

export type NuiPlayerEventName =
    | 'prepared'
    | 'playing'
    | 'paused'
    | 'ended'
    | 'error'
    | 'time'
    | 'seeked';

export type NuiLifecycleEventName = 'pause' | 'resume' | 'terminate';

export type NuiHostMessage =
    | { t: 'welcome'; v: number; window: { w: number; h: number }; profile: DeviceProfile; app: NuiWelcomeAppInfo }
    | { t: 'key'; state: 'down' | 'up'; key: RemoteKeyName; code: number }
    | { t: 'text'; id: number; value: string }
    | { t: 'image'; id: number; status: 'ready' | 'failed'; w?: number; h?: number }
    | { t: 'measure'; id: number; w: number; h: number }
    | {
          t: 'player';
          id: number;
          event: NuiPlayerEventName;
          positionMs?: number;
          durationMs?: number;
          message?: string;
      }
    | { t: 'lifecycle'; event: NuiLifecycleEventName };
