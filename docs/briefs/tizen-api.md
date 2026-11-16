# Brief: `packages/tizen-api` (`@tvemu/tizen-api`)

Read `docs/briefs/COMMON.md` first, then the behavioural specs:
`docs/re/05-websimulator-api-surface.md` (API tables), `docs/re/06-websimulator-keys-lifecycle-config.md`
(keys, lifecycle; use the real-device-style key table in section 3.5.3, NOT the swapped codes of
Samsung's simulator), and `docs/re/03-remote-control-and-device-templates.md`. If
`docs/re/07-tv-image-web-runtime.md` exists when you start or appears while you work, it describes
the real TV image and WINS over 05/06 wherever they disagree.

The specs describe Samsung's own simulator, which has known gaps. Where the spec says the simulator
is wrong or incomplete compared with a real TV (key registration is a no-op there, WebAPIException
not exposed, no TV privileges), implement the REAL TV behaviour described below.

## Deliverable

A single self-contained browser script, `dist/tizen-api.js`: an IIFE, no imports at runtime,
that must run unmodified on **Chromium 69** (2018). So: write the browser source in
TypeScript under `src/browser/` and compile it with a dedicated `tsconfig.browser.json` targeting
`ES2015` with `module: none`/`outFile` (or bundle with `esbuild --target=chrome69 --format=iife` —
your choice, esbuild as a devDependency is fine). Do not use, even after compilation: optional
chaining, nullish coalescing, `Object.fromEntries`, `Array.prototype.flat`, `globalThis`,
`Promise.allSettled`, `String.prototype.matchAll`, `BigInt`, class fields, `async` iteration.
Add a test that parses the built file and fails if any of those appear.

Node-side entry `src/index.ts` exports `tizenApiBundlePath(): string` (absolute path of
`dist/tizen-api.js`) and `TIZEN_API_VERSION`.

## Environment the script runs in

It is injected before any app script in every frame. Globals provided by the host (may be absent
in tests — then use built-in defaults):

- `window.__tvemuProfile`: `DeviceProfile` (see `packages/protocol/src/index.ts`)
- `window.__tvemuManifest`: `AppManifest`
- `window.__tvemuSend(json: string)`: sends a `BridgeRequest` to the host. Replies arrive through
  `window.__tvemuReceive(json)`, which YOU define: it accepts a `BridgeResponse` (resolve the
  pending request by `id`) or a `BridgeEvent`.

Host methods available over the bridge (`api.method`): `application.exit`, `application.hide`,
`tvinputdevice.keysChanged` (args `[string[]]`, send on every register/unregister),
`console.log` (args `[level, text]`). Everything else must be implemented in-page.

Only install the API in the top frame and same-origin child frames; never throw during install
(wrap, log through `console.error`), because a throw here breaks the app under test.

## Required behaviour

1. **Errors**: `tizen.WebAPIException` and `tizen.WebAPIError` exposed, with the code table and
   names from the spec; type validation throws `TypeMismatchError` synchronously; async callbacks
   are asynchronous (`setTimeout 0`).
2. **`tizen.tvinputdevice`** (real TV semantics): `getSupportedKeys()`, `getKey(name)`,
   `registerKey`, `unregisterKey`, `registerKeyBatch`, `unregisterKeyBatch` (with callbacks).
   Unknown key name → `InvalidValuesError`. Keys delivered without registration: ArrowLeft,
   ArrowUp, ArrowRight, ArrowDown, Enter, Back (10009). Install capture-phase `keydown`/`keyup`/
   `keypress` listeners on `window` that `stopImmediatePropagation()` + `preventDefault()` any key
   whose code is in the supported table, is not default-delivered, and is not registered. Keys not
   in the table at all (a developer typing on the Mac keyboard) pass through untouched.
3. **`tizen.application`**: `getCurrentApplication()` → object with `appInfo` (from the manifest),
   `contextId`, `exit()` (bridge `application.exit`; without a bridge, `window.close()`), `hide()`,
   `getRequestedAppControl()` (operation `http://tizen.org/appcontrol/operation/default`, empty
   data); `getAppInfo`, `getAppsInfo`, `getAppContext`, `getAppsContext`, `launch`,
   `launchAppControl`, `kill`, `getAppSharedURI`, `getAppMetaData`, `ApplicationControl`,
   `ApplicationControlData` constructors on `tizen`.
4. **`tizen.systeminfo`**: `getCapability(key)` (include the `http://tizen.org/feature/...` and
   `http://tizen.org/system/...` keys from the spec with values derived from the profile, e.g.
   `http://tizen.org/feature/screen.width` 1920, platform version from `profile.tizenVersion`),
   `getPropertyValue`, `getPropertyValueArray`, `addPropertyValueChangeListener`,
   `removePropertyValueChangeListener`, `getTotalMemory`, `getAvailableMemory`, `getCount`.
   Properties: BUILD, CPU, DISPLAY, DEVICE_ORIENTATION, LOCALE, NETWORK, WIFI_NETWORK,
   ETHERNET_NETWORK, STORAGE, MEMORY, VIDEOSOURCE, PERIPHERAL as the spec lists. NETWORK follows
   `navigator.onLine` and emits changes on `online`/`offline`.
5. **`tizen.tvaudiocontrol`** (volume 0-100, mute, change listener, `playSound`, `getOutputMode`),
   **`tizen.tvwindow`**, **`tizen.tvchannel`**, **`tizen.tvdisplaycontrol`**, **`tizen.tvinfo`**
   if in the spec: implement with the spec's mock values.
6. **`tizen.filesystem`**: virtual filesystem kept in memory and persisted to `localStorage` under
   one namespaced key (virtual roots `documents`, `downloads`, `wgt-private`, `wgt-private-tmp`,
   `wgt-package` read-only listing derived from nothing = empty, `images`, `music`, `videos`).
   Implement the classic API (`resolve`, `File` with `listFiles`/`createFile`/`createDirectory`/
   `openStream`/`readAsText`/`deleteFile`/`deleteDirectory`/`copyTo`/`moveTo`, `FileStream`) and
   the newer flat API if the spec lists it (`openFile`, `FileHandle`, `listDirectory`,
   `pathExists`, `isFile`, `isDirectory`, `createDirectory`, `deleteFile`, `deleteDirectory`,
   `toURI`).
7. **`tizen.time`** / `tizen.TZDate`, **`tizen.package`**, **`tizen.preference`**,
   **`tizen.keymanager`**, **`tizen.network`-related** namespaces: implement what the spec tables
   list for TV, with mock values; skip mobile-only namespaces (calendar, contact, nfc, bluetooth,
   push, messaging) — for those expose nothing (apps feature-detect with `if (tizen.x)`).
8. **`webapis`**:
   - `webapis.productinfo` (model, model code, firmware, DUID, real model, local set, smartTV server
     type constants, `isUdPanelSupported`, etc. from the profile),
   - `webapis.network` (constants, `getActiveConnectionType`, `isConnectedToGateway`, `getIp`,
     `getMac`, `getDns`, `getGateway`, `addNetworkStateChangeListener`/remove),
   - `webapis.appcommon` (`AppCommonScreenSaverState`, `setScreenSaver`, `getVersion`, `getUuid`),
   - `webapis.tvinfo`, `webapis.avinfo`, `webapis.systeminfo`-like and `webapis.adinfo`,
     `webapis.sso`, `webapis.billing`, `webapis.widgetdata`, `webapis.preview` if listed: mocks,
   - **`webapis.avplay`**: a real implementation on top of an HTML5 `<video>` the script creates
     and owns, absolutely positioned according to `setDisplayRect` (coordinates are in the
     1920x1080 app space), inserted as the FIRST child of `document.body` with `z-index` below the
     app content like the real TV plane (apps punch a transparent hole). Full state machine
     NONE → IDLE → READY → PLAYING ⇄ PAUSED, with `InvalidStateError` on illegal transitions:
     `open`, `close`, `prepare`, `prepareAsync`, `play`, `pause`, `stop`, `seekTo`, `jumpForward`,
     `jumpBackward`, `getState`, `getDuration`, `getCurrentTime` (milliseconds), `setDisplayRect`,
     `setDisplayMethod`, `setListener` (`onbufferingstart`, `onbufferingprogress`,
     `onbufferingcomplete`, `oncurrentplaytime`, `onstreamcompleted`, `onevent`, `onerror`,
     `onsubtitlechange`, `ondrmevent`), `setSpeed`, `setStreamingProperty`, `getStreamingProperty`,
     `setDrm` (accept and log; DRM is not emulated → `onerror('PLAYER_ERROR_NOT_SUPPORTED_FORMAT')`
     only when playback actually fails), `getTotalTrackInfo`, `getCurrentStreamInfo`,
     `setSelectTrack`, `setTimeoutForBuffering`, `setBufferingParam`, `suspend`, `restore`,
     `getVersion`. HLS (`.m3u8`): try native `<video>` first; when the engine cannot play it, and
     `window.Hls` exists (an app-provided hls.js), use it; otherwise report the error. Do not
     bundle hls.js.
9. **`tizenhwkey`**: on Back, dispatch a `tizenhwkey` event on `document` with `keyName: 'back'`
   before the `keydown` 10009 reaches the app (as the spec describes), without swallowing the
   keydown.
10. **Lifecycle**: `application.hide()` flips a script-controlled `document.hidden`/
    `visibilityState` override and dispatches `visibilitychange`; a `BridgeEvent`
    `{ event: 'visibility', payload: 'visible' | 'hidden' }` from the host does the same.
11. **Privileges**: a table mapping API calls to Tizen/Samsung TV privilege names; when the
    manifest exists and lacks the privilege, do NOT throw (real TVs differ by firmware) — log one
    `console.warn('[tvemu] <api> needs privilege <name> in config.xml')` per API, so developers
    catch missing privileges before certification.
12. `window.webapis` and `window.tizen` must be non-configurable-by-accident: if the page later
    loads a script that assigns `window.webapis = ...`, keep ours (define with a setter that
    ignores writes).

## Tests (Vitest + jsdom)

Load the BUILT bundle into jsdom (so the shipped artifact is what is tested): install without
bridge; key filtering before/after `registerKey` for 10252 and for default keys; `tizenhwkey`
ordering; `getSupportedKeys` codes match `REMOTE_KEYS` in `@tvemu/protocol` for shared names (report
any mismatch instead of silently choosing); systeminfo capability values from a profile;
filesystem round trip incl. persistence across a reload; avplay state machine with a stubbed
`HTMLMediaElement`; bridge request/response correlation and timeout; privilege warning; the
forbidden-syntax scan. Then run the bundle for real in Chromium 69 with a tiny CDP-free check:
`"<chromium-69>/Chromium.app/Contents/MacOS/Chromium" --headless --no-sandbox --disable-gpu --dump-dom file://<fixture.html>`
where the fixture loads the bundle and writes `JSON.stringify` of a self-check (API presence,
a registerKey call, an avplay open/close) into the DOM. Report the real dumped output.

Record every place where you chose real-TV behaviour over the simulator spec, and every API you
left as a mock, in `docs/notes/tizen-api.md` (a coverage table: namespace, method, real / mock /
missing).
