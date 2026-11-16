# Architecture

`tizen-tv-emulator-mac` (CLI: `tvemu`) is a clean-room, open-source replacement for the
Samsung Tizen TV emulator on macOS, including Apple Silicon. It does not boot the Tizen
OS. It runs Tizen **web apps** (`.wgt`) on the same Chromium milestone the target TV
ships, with the `tizen` / `webapis` JavaScript APIs reimplemented, a remote control, and
an sdb-compatible endpoint so the official `sdb` and `tizen` CLIs treat it as a device.

Nothing from Samsung is redistributed. `docs/re/` holds behavioural notes obtained by
static analysis of the official SDK; code is written from those notes, never copied.

## Why not the official emulator

It is an x86_64 QEMU virtual machine that requires hardware virtualization of x86, which
Apple Silicon does not provide. On this class of machine it refuses to start.

## Processes

```
            sdb / tizen CLI                       developer
                  |  TCP 26101                        |  tvemu CLI
          +-------v---------+                 +-------v--------+
          |   sdb-bridge    |---- HostApi --->|      host      |<--- WebSocket --- remote-ui (browser window)
          +-----------------+                 +---+--------+---+
                                                  |        |
                                     wgt (install)|        | engine (CDP)
                                                  v        v
                                    ~/.tvemu/apps/<pkg>   Chromium (pinned milestone)
                                                           + tizen-api bundle injected
```

One Node.js process (`host`) owns everything. Chromium is a child process controlled only
through the Chrome DevTools Protocol, so any milestone can be swapped in.

## Packages (pnpm workspace, TypeScript, ESM, Node >= 22)

| Package | Responsibility |
|---|---|
| `@tvemu/protocol` | Shared types and constant tables. No runtime dependencies. The contract. |
| `@tvemu/wgt` | Read a `.wgt` (zip), parse `config.xml`, install/uninstall/list apps on disk. |
| `@tvemu/sdb-bridge` | TCP daemon speaking the sdb device protocol; translates device shell commands and file sync into `HostApi` calls. |
| `@tvemu/tizen-api` | The script injected into every app document: `window.tizen`, `window.webapis`, key filtering. Must run on Chromium 69 (ES2017 at most, no optional chaining, single IIFE bundle). |
| `@tvemu/engine` | Locate/download pinned Chromium builds, launch them, CDP client, script injection, key dispatch, CPU throttling, screenshots. |
| `@tvemu/remote-ui` | Static web UI of the remote control and status panel, talking to the host over WebSocket. |
| `@tvemu/host` | Wires everything, static file server for installed apps, `tvemu` CLI. |

## Contracts

All cross-package types live in `packages/protocol/src`. Packages depend on
`@tvemu/protocol` and never on each other, except `host`, which depends on all of them.

### HostApi (implemented by `host`, consumed by `sdb-bridge` and the CLI)

```ts
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
```

### Engine (implemented by `engine`, consumed by `host`)

```ts
export interface Engine {
    start(options: EngineStartOptions): Promise<void>;
    navigate(url: string): Promise<void>;
    dispatchKey(code: number, keyName: string, action: KeyAction): Promise<void>;
    evaluate<T>(expression: string): Promise<T>;
    onBindingCall(listener: (message: BridgeRequest) => void): void;
    resolveBinding(response: BridgeResponse): Promise<void>;
    screenshot(): Promise<Buffer>;
    stop(): Promise<void>;
}
```

### Page <-> host bridge (between `tizen-api` and `host`, carried by `engine`)

The engine exposes a CDP binding named `__tvemuSend(json: string)` and delivers replies
by evaluating `window.__tvemuReceive(json)`.

```ts
export interface BridgeRequest { id: number; api: string; method: string; args: unknown[]; }
export interface BridgeResponse { id: number; ok: boolean; result?: unknown; error?: { name: string; message: string }; }
export interface BridgeEvent { event: string; payload: unknown; }
```

`tizen-api` must work standalone when the binding is missing (unit tests in jsdom):
every call that needs the host falls back to a deterministic default from the injected
`window.__tvemuProfile` (a `DeviceProfile`).

### Remote key delivery

1. Remote UI or CLI calls `HostApi.sendKey(name)`.
2. Host looks up the key in `REMOTE_KEYS` (`@tvemu/protocol`) and calls
   `Engine.dispatchKey(code, name, action)`.
3. Inside the page, `tizen-api` installs capture-phase listeners on `window` for
   `keydown`/`keyup` and stops propagation of any key that is neither a default key
   (arrows, Enter, Back) nor registered through `tizen.tvinputdevice.registerKey`.

### Device profiles

A profile pins a Tizen platform version to a Chromium milestone, a user agent, a screen
size and the default values returned by `tizen.systeminfo` / `webapis.productinfo`.

## On-disk layout

```
~/.tvemu/
  apps/<packageId>/        extracted wgt + manifest.json
  engines/<milestone>/     downloaded Chromium builds (never committed)
  profiles/<name>/         Chromium user-data-dir per device profile (localStorage survives)
  tmp/                     files pushed over sdb
```

## Code rules

- TypeScript strict, ESM, named exports only, 4-space indentation, max line 144.
- No comments in code; names carry the meaning.
- Tests with Vitest next to the source (`*.test.ts`).
- No credentials, no Samsung assets, no copied SDK code.
