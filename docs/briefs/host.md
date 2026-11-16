# Brief: `packages/host` (`@tvemu/host`)

Read `docs/briefs/COMMON.md` first. You already built `packages/engine` and
`packages/remote-ui`; `packages/wgt` exists (read its `src/index.ts`). Two packages are being
built in parallel by other agents and may not exist yet — code against these contracts and make
the host degrade gracefully (clear log line, feature disabled) when a package fails to import:

- `@tvemu/sdb-bridge`: `createSdbBridge({ host: HostApi, port?, home, serialName?, log? })`
  returning `{ start(): Promise<{ port: number }>, stop(): Promise<void> }`.
- `@tvemu/tizen-api`: `tizenApiBundlePath(): string` — absolute path of a single IIFE JavaScript
  file to inject into every app document before any app script.

Use dynamic `import()` for both so the host builds and its tests run before they land. Declare
them as `optionalDependencies` with `workspace:*`.

## What the host does

`createHost(options: { home: string; profile: DeviceProfile; headless?: boolean; scale?: number; sdbPort?: number | false; uiPort?: number; log? }): TvemuHost`
where `TvemuHost extends HostApi` plus `start()`, `stop()`, `urls(): { remote: string; app: string | null }`.

- App store: `createAppStore(home)` from `@tvemu/wgt`.
- Static app server: one HTTP server on `127.0.0.1` (random free port unless `uiPort`), serving
  - `/app/<packageId>/...` → the installed app's content dir, correct MIME types, `Range`
    requests for media (video seeking needs 206), no directory listing, path traversal rejected,
    and the app's `tizen:content-security-policy` sent as the `Content-Security-Policy` header
    for HTML documents;
  - `/$WEBAPIS/webapis/webapis.js` and `/app/<packageId>/$WEBAPIS/webapis/webapis.js` → an empty
    JavaScript file with a 200 (real apps include this script tag; the API is already injected);
  - `/remote/` → static assets from `remoteUiAssetsDir()`, and WebSocket `/remote/ws` speaking
    `RemoteUiClientMessage` / `RemoteUiServerMessage`.
- `launch(appId)`: resolve the app, resolve the engine for `profile.chromiumMilestone`
  (`resolveEngine`; if missing, throw an error whose message says exactly how to get it:
  `tvemu engine install <milestone>`), start it if not running with user data dir
  `<home>/profiles/<profile.name>`, inject, in this order: a tiny bootstrap that defines
  `window.__tvemuProfile` (the profile) and `window.__tvemuManifest` (the app manifest), then the
  tizen-api bundle. Navigate to `http://127.0.0.1:<port>/app/<packageId>/<contentSrc>` (or the
  absolute URL when `contentSrc` is http/https). `allowCrossOrigin` = manifest has
  `accessOrigins` containing `*`.
- `terminate(appId)`: navigate to a built-in idle page (`/idle`, a dark screen with the profile
  label) and clear the running app. `stop()` closes the engine and servers.
- `sendKey(name, action = 'press')`: look the key up with `findRemoteKey`; unknown name → error.
  `down` starts an auto-repeat (first repeat after 500 ms, then every 100 ms, dispatching
  `down` again) until `up`. Calls `engine.dispatchKey(code, name, action)`.
- Bridge requests from the page (`engine.onBindingCall`) are routed by `"<api>.<method>"`:
  - `application.exit` → `terminate`, respond ok
  - `application.hide` → respond ok, log
  - `tvinputdevice.keysChanged` (args: `[string[]]`) → store as registered keys, broadcast state
  - `console.log` (args: `[level, text]`) → forward to log and to remote UI `log` messages
  - anything else → `{ ok: false, error: { name: 'NotSupportedError', message } }`
- Remote UI state broadcast on every change (apps installed/removed, app launched/terminated,
  registered keys changed). Engine `onExit` → clear running app, broadcast, log the reason.
- Start the sdb bridge when `sdbPort !== false` (default `SDB_DEFAULT_PORT`); if the port is
  busy, log it and continue without sdb.

## CLI (`packages/host/src/cli.ts`, bin name `tvemu`)

No CLI framework; `node:util` `parseArgs`. Home dir: `$TVEMU_HOME` or `~/.tvemu`.

```
tvemu start [--profile <name>] [--scale 0.5] [--headless] [--no-sdb] [--no-remote]   run the emulator (foreground), open the remote UI window
tvemu install <file.wgt>            install into the app store (works with or without a running emulator)
tvemu run <appId|packageId|file.wgt> [--profile <name>]   start (if needed), install when given a .wgt, launch
tvemu uninstall <packageId>
tvemu list                          installed apps
tvemu profiles                      device profiles with their Chromium milestone and whether the engine is available
tvemu engine list | install <milestone>
tvemu key <name> [--action press|down|up]     send a remote key to the running emulator
tvemu screenshot <out.png>
tvemu stop
```

`start`/`run` keep running in the foreground. `key`, `screenshot`, `stop`, and `install`/`run`
against an already running instance talk to it through a control endpoint on the host HTTP server
(`POST /control/<command>`, JSON, bound to 127.0.0.1, protected by a random token written to
`<home>/run.json` together with the port and pid; remove the file on exit; detect and replace a
stale file whose pid is dead). `tvemu start` opens the remote UI in a small Chromium `--app`
window using the same engine binary (separate user data dir `<home>/profiles/_remote`), unless
`--no-remote`.

Default profile: the 2020 one (Tizen 5.5, Chromium 69) when its engine resolves, otherwise the
newest profile whose engine resolves; print which one was chosen and why.

## Tests

- Unit: static server (MIME, Range → 206, traversal, CSP header, webapis.js stub), key repeat
  with fake timers, bridge routing, control endpoint auth, run.json stale handling — all with a
  fake `Engine`.
- Integration (skip when no Chromium resolves): build a tiny fixture `.wgt` in the test (an
  `index.html` that writes received `keydown` keyCodes into `document.title` and calls
  `window.__tvemuSend` when present), `createHost` headless, `installWgt`, `launch`,
  `sendKey('Enter')`, `sendKey('Back')`, assert through `engine.evaluate`, take a screenshot,
  `terminate`, `stop`. Run it for real on the Playwright Chromium and on Chromium 69
  (`TVEMU_CHROMIUM_69=<chromium-69>/Chromium.app/Contents/MacOS/Chromium`).
- Finally, a manual smoke run you must actually execute and report: build everything, then
  `TVEMU_HOME=$(mktemp -d) node packages/host/dist/cli.js run <fixture.wgt> --headless --no-sdb --no-remote`
  in the background, `tvemu key Enter`, `tvemu screenshot /tmp/tvemu-smoke.png`, `tvemu stop`.

Also write `README.md` at the repo root (you may create this one root file): what it is, why the
official emulator does not run on Apple Silicon, install, quick start, CLI reference, supported
profiles table, using it with Samsung's `sdb`/`tizen` tools, limitations (no Tizen OS, no native
apps, DRM/AVPlay limits), legal note (not affiliated with Samsung; no Samsung code or assets;
Tizen is a trademark of the Linux Foundation), MIT.
