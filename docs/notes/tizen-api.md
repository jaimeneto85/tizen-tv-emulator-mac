# Notes: `packages/tizen-api` (`@tvemu/tizen-api`)

Decisions and coverage for the in-page `window.tizen` / `window.webapis` reimplementation.
Built artifact: `dist/tizen-api.js` (single IIFE, esbuild `--target=chrome69 --format=iife`, no runtime
imports). Verified on real **Chromium 69.0.3497.0** with `--headless --dump-dom` (see
`src/fixtures/selfcheck.html`); all 47 Vitest tests load the *built* bundle into jsdom.

## Real-TV behaviour chosen over the simulator spec

| Place | Simulator (docs/re 05/06) | Implemented (real TV) |
|---|---|---|
| Key registration | no-op, every key delivered | `registerKey`/`unregisterKey`/`registerKeyBatch`/`unregisterKeyBatch` maintain a registered set; capture-phase `keydown`/`keyup`/`keypress` listeners on `window` swallow (`stopImmediatePropagation` + `preventDefault`) any key in the table that is neither default-delivered nor registered; keys not in the table pass through |
| Default-delivered keys | n/a | ArrowLeft/ArrowUp/ArrowRight/ArrowDown (37-40), Enter (13), Back (10009) — matches `REMOTE_KEYS` in `@tvemu/protocol` (test cross-checks every shared name) |
| Key table | simulator's `KEY_*` table with swapped VolUp/VolDown/ChUp/ChDown codes and `KEY_BACK = 0` | real-device-style table from doc 06 §3.5.3 (~147 entries). One deviation from 3.5.3: `Menu` is **18** (contract `REMOTE_KEYS` and doc 03 §2.4) instead of 10133; `SysMenu` keeps 10133 |
| `tizen.WebAPIException` / `tizen.WebAPIError` | not exposed; `WebAPIError` names `undefined` for 26/27/28/9999 | both exposed on `tizen`; `WebAPIException` extends `Error`, carries all `*_ERR` constants (static + prototype getters), non-number code → 9999; both always fill `name` and `message` |
| Privileges | TV privileges not even whitelisted, nothing gated | warn-don't-throw (per brief): one `console.warn('[tvemu] <api> needs privilege <name> in config.xml')` per API when a manifest exists and lacks the privilege |
| `tizen.tvaudiocontrol` | `getVolume()` returns 1, `getOutputMode()` returns 0, volume up/down defective | volume 0-100 (default 60, applied to all `<audio>`/`<video>`), `getOutputMode()` returns `'PCM'`, up/down actually change the stored volume |
| `tizen.tvdisplaycontrol` | `get3DEffectMode()` returns the whole list; `is3DModeEnabled()` returns `false` | `'OFF'` and `'NOT_SUPPORTED'` respectively |
| `application.exit()` / `hide()` | both navigate the iframe away | `exit()` → bridge `application.exit` (falls back to `window.close()`); `hide()` → bridge `application.hide` **and** flips a script-controlled `document.hidden`/`visibilityState` override + `visibilitychange`; a host `BridgeEvent {event:'visibility'}` does the same |
| `webapis.avplay.getCurrentTime()` | seconds | milliseconds (matches real AVPlay and the brief) |
| `webapis.appcommon.registerKey` | returns boolean, no delivery effect | returns boolean (never throws, per spec) **and** toggles the same registration set as `tizen.tvinputdevice`, so it affects delivery |
| `webapis.appcommon.setIMERecommendedWordsType` | quirk: always `false` | `true` for 0/1 |
| `webapis.network` | reads the host's real NICs via Node `os` | browser cannot; plausible static mocks (`192.168.0.2`, `00:0B:2F:33:7B:4A`), `isConnectedToGateway()` follows `navigator.onLine`, and `addNetworkStateChangeListener` actually delivers `GATEWAY_CONNECTED`/`GATEWAY_DISCONNECTED` on `online`/`offline` |
| `webapis.productinfo.getForegroundAppId()` | hard-coded `'bixbycapsuleviewer'` | the running app's own id from the manifest |
| `webapis.widgetdata.read/write` | raise `ReferenceError` (undeclared identifier) | fixed-slot read/write implemented normally |
| `tizen.time` listeners | stored only | same (registration only), noted as mock |

## Bridge

- `window.__tvemuSend(json)` used when present; `window.__tvemuReceive(json)` is defined by the bundle:
  `BridgeResponse` resolves/rejects the pending request by `id` (5 s timeout → rejected `TimeoutError`
  logged through the console bridge); `BridgeEvent` `visibility` flips document visibility.
- Bridge methods used: `application.exit`, `application.hide` (requests), `tvinputdevice.keysChanged`
  (notify with the registered-name array on every register/unregister), `console.log` (`[level, text]`).
- Everything else is implemented in-page with deterministic defaults from `window.__tvemuProfile`
  (built-in default profile when absent: UKS9000 / 16_JAZZM_UHD / T-HKPAKUC-0000.0 / SDKHUWUR7SQ24,
  1920x1080, Tizen 2.4).

## Coverage table

| Namespace | Method / member | Status |
|---|---|---|
| tizen root | WebAPIException, WebAPIError, ApplicationControl, ApplicationControlData, TZDate, TimeDuration | real |
| tizen.application | getCurrentApplication, getAppContext, getAppInfo, getAppsContext, getAppsInfo, findAppControl, launch, launchAppControl, kill, getAppSharedURI, getAppMetaData, getAppCerts, add/removeAppInfoEventListener, add/removeAppStatusChangeListener, getBatteryUsageInfo, getAppsUsageInfo | real shape, in-page data (only the current app is "installed"); launch/kill are stubs that succeed/fail against the known-app set |
| tizen.tvinputdevice | getSupportedKeys, getKey, registerKey, unregisterKey, registerKeyBatch, unregisterKeyBatch | real (registration actually gates delivery) |
| tizen.systeminfo | getPropertyValue(Array), add/removePropertyValueChangeListener, getCapability(ies), getCount, getTotal/AvailableMemory | real shape; TV property set (BUILD, CPU, DISPLAY, DEVICE_ORIENTATION, LOCALE, NETWORK, WIFI_NETWORK, ETHERNET_NETWORK, STORAGE, MEMORY, VIDEOSOURCE, PERIPHERAL); NETWORK follows `navigator.onLine`. `getPropertyValueArray` keeps the simulator quirk (passes a single object). Memory figures and ETHERNET/WIFI/VIDEOSOURCE field values are mocks |
| tizen.tvaudiocontrol (+tv.audiocontrol alias) | set/isMute, set/getVolume, setVolumeUp/Down, volume change listener, getOutputMode, playSound | real volume model; `playSound` validates and no-ops (no audio assets); `getOutputMode` returns `'PCM'` |
| tizen.tvwindow (+tv.window) | getAvailableWindows/Sources, set/getSource, show/hide/getRect, getVideoResolution, resolution change listeners | mock (no broadcast picture); validation per spec |
| tizen.tvchannel (+tv.channel alias) | tune/tuneUp/tuneDown, findChannel, getChannelList, getCurrentChannel/Program, getProgramList, channel/program change listeners, tuner/source counts, getBroadcastStandard | mock 3-channel/3-program carousel (the working `tv.channel` data from the spec) |
| tizen.tvdisplaycontrol (+tv.displaycontrol alias) | get/set3DEffectMode, is3DModeEnabled, getSupported3DEffectModeList | mock |
| tizen.tvinfo | CaptionInfoKey enum, getCaptionValue, caption change listeners | mock (caption settings return defaults) |
| tizen.filesystem | resolve, getStorage, listStorages, storage change listeners; File (listFiles, openStream, readAsText, createDirectory/File, resolve, copyTo, moveTo, deleteDirectory, deleteFile, toURI); FileStream (read/readBytes/readBase64/write/writeBytes/writeBase64, position, eof, bytesAvailable, close) | real against an in-memory virtual FS persisted to one namespaced `localStorage` key per app (`tvemu.fs.v1:<appId>`); roots: documents, downloads, wgt-private, wgt-private-tmp, wgt-package (read-only, empty), images, music, videos. The newer flat API (`openFile`/`FileHandle`/...) is **missing** — doc 05 §3.9 does not list it |
| tizen.time / TZDate / TimeDuration | full method sets per spec | real TZDate wrapping `Date` (timezone conversion relabels only — no tz database, mock); time change listeners are registration-only |
| tizen.package | install, uninstall, getPackagesInfo, getPackageInfo, package info event listener | mock (own package only; install simulates progress/completed on a timer) |
| tizen.preference | set/getValue, getAll, remove(All), exists, change listeners | real (in-memory per page load; not persisted — TV persistence backend unverified) |
| tizen.keymanager | saveData, removeData, getData, getDataAliasList, setPermission | mock (in-memory; alias list returns the spec's dummy `packageId`) |
| webapis.productinfo | model/modelCode/firmware/DUID/realModel/localSet from profile; SmartTV server type constants; is*Supported; get/setSystemConfig + ProductInfoConfigKey (0..57); system config change listener | real values from profile; system config values are mocks |
| webapis.network | constants, getActiveConnectionType, isConnectedToGateway, getIp/Mac/Dns/Gateway, add/removeNetworkStateChangeListener (+InternetCheck), DHCP option 60, soft AP mocks | mostly mocks (see real-TV table above) |
| webapis.appcommon | AppCommonScreenSaverState, setScreenSaver, getVersion, getUuid, getForegroundAppId, getSpecialSupportedKeys, register/unregisterKey, generateKey, IME/EPOP helpers | real key registration; rest mocks |
| webapis.tvinfo | TvInfoKey/Value/MenuKey/MenuValue enums, get/setMenuValue, caption/TvInfo listeners, showCaption | mocks per spec |
| webapis.avinfo | full spec table ( DolbyDigitalCompMode/isHdrTvSupport throw NotSupportedError) | mocks |
| webapis.avplay | full state machine NONE→IDLE→READY→PLAYING⇄PAUSED with `InvalidStateError` on illegal transitions; open/close/prepare/prepareAsync/play/pause/stop/seekTo/jumpForward/jumpBackward/getDuration/getCurrentTime(ms)/setDisplayRect (1920x1080 app-space px)/setDisplayMethod/setListener (buffering/currentplaytime/streamcompleted/error callbacks from real media events)/setSpeed/setStreamingProperty/getStreamingProperty/setDrm (accepted+logged, DRM not emulated)/track info/selectTrack/buffering params/suspend/restore/getVersion; HLS: native `<video>` first, app-provided `window.Hls` fallback, else error | real on top of an owned `<video id="tvemu-avplay-video">` inserted as the first child of `document.body`, absolutely positioned, `z-index: 0` (app content stacks above — apps punch a transparent hole like the real video plane) |
| webapis.adinfo / sso / billing / drminfo / systemcontrol / timer | spec mocks | mock |
| webapis.widgetdata | write/read/removeWidgetData + fixed-slot read/write/write | mock (hex-encoded storage under `tvemu.widgetdata.*` keys; no Blowfish) |
| webapis.preview | setPreviewData, action data listener | mock |
| webapis.SystemInfo | isSupportedAudioCodec/VideoCodec | mock (regex against spec codec strings) |
| webapis root | load/unload no-ops | mock |
| `tizenhwkey` | dispatched on `document` with `keyName: 'back'` before the 10009 keydown reaches the app, without swallowing the keydown | real |
| Lifecycle | `application.hide()` and host `visibility` events flip `document.hidden`/`visibilityState` and fire `visibilitychange` | real (script-controlled override) |

## Deliberately missing

- Mobile-only namespaces: `calendar`, `contact`, `nfc`, `bluetooth`, `push`, `messaging` — nothing exposed
  (apps feature-detect with `if (tizen.x)`).
- Low-priority webapis mocks not requested by the brief: `avplaystore`, `microphone`, `allshare`,
  `broadcast`, `syncplay`, `displayrotator`, `featureconfig`, `hybridchannelinfo`, `clone`,
  `systemdebug`, `objectdetection`, `poseestimation`, `voiceInteraction`, `logging`, `remotepower`,
  `document`, `b2bapis`.
- `webapis.avplay` multi-instance (`avplaystore`) and DRM playback are not emulated; `setDrm` is
  accepted and logged, and playback failures surface through `onerror` with
  `PLAYER_ERROR_*` names (`PLAYER_ERROR_NOT_SUPPORTED_FORMAT` for unplayable sources).
- Filesystem flat API (`openFile`, `FileHandle`, ...) — not listed in doc 05 §3.9.
