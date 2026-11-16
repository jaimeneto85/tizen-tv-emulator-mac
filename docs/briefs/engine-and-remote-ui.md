# Brief: `packages/engine` and `packages/remote-ui`

Read `docs/briefs/COMMON.md` first.

## packages/engine (`@tvemu/engine`)

Implements the `Engine` interface from `@tvemu/protocol` on top of a Chromium child process
driven only through the Chrome DevTools Protocol over WebSocket (dependency: `ws`; no Puppeteer,
no Playwright).

Exports:
- `createChromiumEngine(options: { executablePath: string; allowCrossOrigin?: boolean; log?: (line: string) => void }): Engine`
- `ENGINE_REGISTRY`: pinned builds per Chromium milestone, each `{ milestone, tizenVersion,
  modelYear, platform: 'mac-x64' | 'mac-arm64', url, sha256 | null, revision, verified: boolean }`.
- `resolveEngine(milestone, { home }): Promise<{ executablePath, source, version }>` — search order:
  1. env `TVEMU_CHROMIUM_<milestone>` (explicit executable path),
  2. `<home>/engines/<milestone>/` (already downloaded),
  3. env `TVEMU_ENGINE_SEARCH_PATHS` (colon separated dirs scanned for `Chromium.app`; the real
     version is read from the app's `Info.plist` and must match the milestone),
  4. any Playwright Chromium in `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/` as
     the "modern" fallback (report `source: 'playwright-cache'` and the real version).
- `downloadEngine(milestone, { home, onProgress })`: downloads the zip from the registry URL,
  verifies sha256 when known, extracts to `<home>/engines/<milestone>/`. Implement it and unit-test
  it against a local HTTP server with a tiny fake zip. Do NOT download real Chromium builds.
- `DEFAULT_PROFILES: DeviceProfile[]` — one per supported Tizen TV year:
  2020 Tizen 5.5 → M69, 2021 Tizen 6.0 → M76, 2022 Tizen 6.5 → M85, 2023 Tizen 7.0 → M94,
  2024 Tizen 8.0 → M108, 2025 Tizen 9.0 → M120. User agent format used by Samsung TVs:
  `Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106/5.5 TV Safari/537.36`
  (adapt version numbers per profile). 1920x1080. `cpuThrottle` default 1 (configurable).

Registry facts already measured on this machine:
- M69 = snapshot revision 576753, Chromium 69.0.3497.0, mac x64 only
  `https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac/576753/chrome-mac.zip`
  sha256 `19fe5c201dfbee45168bfdfe9829c82000728c38e0eda128c232b1973cbfc2a9`, 84934656 bytes; runs on
  Apple Silicon through Rosetta 2. No arm64 build exists for it.
- Branch base positions to probe for the others (HTTP HEAD only, find the nearest existing
  snapshot at or after the position under `Mac/` and `Mac_Arm/`): M76 665002, M85 782793,
  M94 911515, M108 1058933, M120 1217362. Record what you actually find; mark `verified: false`
  and `sha256: null` for builds you did not download. Prefer `Mac_Arm` when it exists.

Chromium 69 pitfalls (measured, must be handled for every milestone <= 76):
- Needs `--no-sandbox` or the renderer dies with `Seatbelt::IsSandboxed`.
- The `--screen-info` flag does not exist.
- A fixed `--remote-debugging-port` can silently bind IPv6 only. Use `--remote-debugging-port=0`
  and read the real port from `<userDataDir>/DevToolsActivePort`.
- CDP there is protocol 1.3: `Emulation.setCPUThrottlingRate`, `Page.addScriptToEvaluateOnNewDocument`,
  `Runtime.addBinding`, `Input.dispatchKeyEvent`, `Emulation.setDeviceMetricsOverride`,
  `Network.setUserAgentOverride` exist. Do not use anything newer without a fallback.
- A persistent profile dir with a stale `SingletonLock` prevents startup: remove stale locks.
- `CSS.supports` lies on old milestones; never use it for anything.

Launch flags: `--user-data-dir`, `--no-first-run`, `--no-default-browser-check`,
`--disable-features=Translate`, `--autoplay-policy=no-user-gesture-required`, `--app=<url>` with
a window sized so the content area is `profile.width*scale` x `profile.height*scale`, plus
`Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor: 1, mobile: false, scale })`
so the page always sees 1920x1080. `--disable-web-security` only when `allowCrossOrigin` is true.

Behaviour:
- `start`: launch, connect to the page target, enable Page/Runtime/Network, apply UA + metrics +
  CPU throttle, add binding `__tvemuSend`, register every `injectedScripts` entry with
  `Page.addScriptToEvaluateOnNewDocument` (they must run before any app script, in every frame).
- `dispatchKey(code, keyName, action)`: `Input.dispatchKeyEvent` with `windowsVirtualKeyCode` and
  `nativeVirtualKeyCode` = code, `key` = keyName, for `rawKeyDown`/`keyUp`; `press` = down then up.
  Verify in a real browser test that `event.keyCode` seen by the page equals `code`, including
  large Tizen codes such as 10009 (Back). If the milestone cannot deliver a code through
  `Input.dispatchKeyEvent`, fall back to evaluating a synthetic `KeyboardEvent` dispatch on
  `document.activeElement || document.body` with `keyCode`/`which` defined via getters, and say so.
- `onBindingCall` / `resolveBinding` / `emitEvent`: JSON over the binding and
  `window.__tvemuReceive(json)`.
- `screenshot()`: PNG buffer via `Page.captureScreenshot`.
- `onExit`: fires when Chromium exits or the page target closes, with a human-readable reason.
- Forward page `console` messages and uncaught exceptions to `log`.

Tests: unit tests for registry/resolve/download/arg building; plus an integration test (skipped
automatically when no Chromium is resolvable) that starts a real engine headless against a local
HTTP page, injects a script, dispatches Enter (13) and Back (10009), asserts the page saw them,
exercises the binding round trip, and takes a screenshot. Run it for real against the Playwright
Chromium in the cache, and against Chromium 69 with
`TVEMU_CHROMIUM_69=<chromium-69>/Chromium.app/Contents/MacOS/Chromium`.
Report real results for both.

## packages/remote-ui (`@tvemu/remote-ui`)

A dependency-free static web UI (plain TypeScript compiled to one ES module + one HTML + one CSS,
no framework, no bundler beyond `tsc`) that the host serves at `http://127.0.0.1:<port>/remote/`.

- Speaks `RemoteUiClientMessage` / `RemoteUiServerMessage` (see protocol) over a WebSocket at
  `ws://<same host>/remote/ws`.
- Draws an original (not Samsung artwork) TV remote: exit, source, number pad, volume and
  channel rockers, mute, D-pad with Enter, Back, Info, Menu, Tools, Guide, colour keys
  (red/green/yellow/blue), media transport (rewind, play, pause, play/pause, stop, fast-forward,
  record). Every button sends a key name from `REMOTE_KEYS`. Keys the running app has not
  registered (from `state.registeredKeys`) and that are not `defaultDelivered` are shown dimmed
  but still clickable.
- Mouse press = `down`, release = `up` (so long-press repeats work); the host handles repeat.
- Physical keyboard mapping while the remote window has focus: arrows, Enter, Backspace/Escape →
  Back, digits, Space → MediaPlayPause, R/G/Y/B → colour keys, +/- → volume.
- Side panel: device profile label, installed apps with a Launch button, running app, Terminate
  button, and a scrolling log fed by `log` messages.
- Export from `src/index.ts` (Node side): `remoteUiAssetsDir(): string` returning the absolute path
  of the built static assets so the host can serve them.
- Accessible: every button is a real `<button>` with an `aria-label`. Works at 360px width.

Tests: Vitest + jsdom for the message encoding and keyboard mapping.
