# Brief: tpk / NUI support on the Node side

Read `docs/briefs/COMMON.md`, `docs/nui/protocol.md` (the contract with the .NET runtime, built
in parallel by another agent under `dotnet/`; do not edit `dotnet/` or the protocol doc), and
`docs/briefs/tpk.md` (the `@tvemu/tpk` package, built in parallel by a third agent; do not edit
`packages/tpk`, import it with a dynamic `import()` and code against the signatures in that brief).

You own: `packages/protocol`, `packages/wgt` (app store only), `packages/host`,
`packages/remote-ui`, `packages/sdb-bridge`, a NEW `packages/nui-renderer`, `README.md`, and
`docs/notes/nui-node.md`. All existing tests must stay green.

## What to build

1. **Protocol types** (`packages/protocol`): `AppManifest` gains optional `kind?: 'wgt' | 'tpk'`
   (absent = wgt), `exec?: string`, `appType?: string`, `apiVersion?: string`. Add TypeScript
   types for every message of `docs/nui/protocol.md` (`NuiRuntimeMessage`, `NuiHostMessage`,
   `NuiOp`, `NuiProps`). `DeviceProfile` gains optional `nuiDpi?: number`.
2. **App store**: install a `.tpk` (`@tvemu/tpk` `extractTpk` into
   `<home>/apps/<packageId>/content`), recorded with `kind: 'tpk'`. `host.installWgt(path)` and
   `tvemu install/run <file>` detect the kind by content (`isTpk`) so every existing entry point
   (CLI, control endpoint, sdb bridge) accepts both. Native tpk -> the `TpkError` message.
3. **`packages/nui-renderer`**: static page (`index.html` + one bundled IIFE script, same build
   approach and Chromium-69-safe syntax rules as `packages/tizen-api`, including its
   forbidden-syntax test) exporting `nuiRendererAssetsDir()`. It implements
   `window.__tvemuNui.apply(json)`:
   - scene ops -> absolutely positioned DOM nodes inside a fixed 1920x1080 stage;
     `insert` index = DOM order; `set` props mapped to CSS (`bg`, `opacity`, `scale` with
     `pivot` as transform-origin, `radius`, `borderWidth/Color` drawn INSIDE the box without
     changing layout, `clip`, `visible`); text nodes with `pixelSize`, colours, wrapping when
     `multiline`, single line otherwise, `hAlign`/`vAlign` (vertical alignment inside the box),
     `ellipsis`; images with `fitting`, reporting `image` ready/failed with natural size;
     `w`/`h` null = natural size, reported back with `measure` after layout.
   - `field` nodes: a real `<input>` (type password when `hidden`), placeholder; on the `ime` op
     for a field the input gets DOM focus so the Mac keyboard types into it, each change sends
     `text`; `ime` with id 0 blurs.
   - `focus` op: no automatic outline (the app draws its own focus); just track it for the
     `text`/`ime` logic and expose it in `window.__tvemuNui.debug()`.
   - `player` messages: one `<video>` per player id BEHIND the scene (window underlay) when
     display mode is `window`; map ops to the element; report `prepared` (loadedmetadata, with
     duration), `playing`, `paused`, `ended`, `error`, `seeked`, `time` every 250 ms. HLS: native
     first, then `window.Hls` if present, else `error`.
   - keys: capture `keydown`/`keyup` on `window`; translate `event.keyCode` to a `RemoteKey`
     (`REMOTE_KEYS`) and send `{t:'key',state,key,code}`; `preventDefault` for remote keys. While
     an input has focus, printable keys and Backspace/Delete/Home/End/ArrowLeft/ArrowRight inside
     non-empty text edit the input and are NOT forwarded; ArrowUp/ArrowDown/Enter/Back are
     forwarded.
   - `window.__tvemuNui.debug()` returns a JSON snapshot (node count, focused id, node list with
     kind/rect/text) used by tests and by `tvemu` diagnostics.
4. **Host** (`packages/host`):
   - launching a `kind: 'tpk'` app: resolve the runtime (`TVEMU_NUI_HOST` env, else
     `<repo>/dotnet/artifacts/nui-host/Tvemu.NuiHost.dll`; when missing, fail with a message that
     says exactly `run: dotnet build dotnet/Tvemu.sln -c Release`), check `dotnet` is on PATH, run
     `dotnet <NuiHost.dll> inspect <installDir>/bin/<exec> --json` first and log every missing
     member as a warning (launch anyway), start the engine, navigate to `/nui/`, open the TCP
     listener, spawn `dotnet <NuiHost.dll> --app-dir <installDir> --exec <exec> --data-dir
     <home>/appdata/<packageId>` with `TVEMU_NUI_ENDPOINT`/`TVEMU_NUI_TOKEN`, validate the token,
     send `welcome`.
   - relay: `frame`/`player` -> page (`engine.evaluate('window.__tvemuNui.apply(...)')`, ordered,
     queued until the page is loaded; chunk very large frames); page events (bridge
     `nui.event`) -> runtime; `log` -> host log + remote UI log; `missing` -> warning;
     `exit`/process exit/socket close -> app ended (same path as `application.exit` for wgt),
     non-zero exit logs the error and the last 20 lines of the runtime's stderr.
   - `sendKey` for a tpk app keeps using `engine.dispatchKey` (the page forwards it). `terminate`
     sends `lifecycle terminate`, waits up to 2 s, then kills the process. `stop()` never leaves a
     dotnet child behind (also on SIGINT/SIGTERM of the CLI and when the engine window closes).
   - `tvemu doctor` reports: `dotnet` version, whether the NUI runtime is built. `tvemu list`
     shows the kind. New `tvemu inspect <file.tpk|installed id>` prints the inspector report.
5. **sdb bridge**: Samsung's CLI installs a tpk with the same flow as a wgt but
   `pkgcmd -i -t tpk -p <path>` (see `docs/re/02-tizen-cli-install-run-flow.md`); make install,
   run (`launch_app`/`app_launcher` variants already handled for wgt), terminate and uninstall
   work for tpk packages, printing the same success strings.
6. **README**: a section for .NET apps (what runs, how, the inspector, limitations: no Tizen OS,
   native C/C++ tpk unsupported, rendering is a DOM approximation of DALi, fonts differ, DRM
   absent). No claim that was not verified by a test you ran.

## Tests

- Unit: renderer in jsdom with the BUILT bundle (ops -> DOM, text field, key translation,
  measure/image events, player with a stubbed media element, forbidden syntax).
- Host with a FAKE runtime: a small Node script that speaks the protocol (hello, frames for two
  focusable boxes and a field, reacts to `key`/`text`, exits on Back) launched through
  `TVEMU_NUI_HOST` pointing to a shim that makes `dotnet <x>` unnecessary — make the launcher
  command injectable (`TVEMU_NUI_COMMAND`, default `dotnet`) so the test can run `node fake.mjs`.
  Assert with a real Chromium (skip when none resolves): nodes appear in `debug()`, `tvemu key`
  reaches the fake runtime, typed text reaches it, exit ends the app, no orphan process.
- If `dotnet/artifacts/nui-host/Tvemu.NuiHost.dll` exists when you finish, also run the real
  thing: `node packages/host/dist/cli.js run <api11-app>.tpk --headless --no-sdb --no-remote`, take a
  screenshot, send keys, and report honestly what you saw. If it does not exist yet, say so.

Finish with `pnpm -r run build` and `pnpm -r run test` green and report real output.
