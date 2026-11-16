# 05 - Samsung TV Simulator: `tizen.*` / `webapis.*` API surface

Behavioural spec recovered by **static** reverse-engineering of the Samsung "TV Simulator" (Tizen TV web simulator,
`sec-tv-simulator.version` = "Version:10.0.6", `package.json` version "1.0 beta"). The application was never executed.
This document is clean-room: it describes behaviour, names, signatures, constants and default values only. No function
body or asset of the simulator is reproduced.

Companion document: `06-websimulator-keys-lifecycle-config.md` (config.xml, privileges, keys, lifecycle, settings, media,
runtime versions).

## 0. How to read this document

### 0.1 Evidence tags

- **OBSERVED** - read directly in the shipped files. Each OBSERVED claim cites a location.
- **INFERRED** - a conclusion drawn from OBSERVED facts (for example "this would throw at runtime"). Never verified by running.

### 0.2 Citation convention

The simulator's JS lives in one minified, single-line 2.4 MB file:
`<sim>/nwjs.app/Contents/Resources/app.nw/ripple.js`, where `<sim>` =
`_samsung-tv-sdk-ref/x/websimulator/data/tools/sec-tv-simulator`. Line numbers are meaningless there, so citations use the
AMD module id plus an identifier:

- `M:<name>` = AMD module `ripple/platform/tizentv/2.0/<name>` inside `ripple.js`
  (example: `M:application` = `define("ripple/platform/tizentv/2.0/application", ...)`; `M:webapis/avplay`;
  `M:spec` = `.../2.0/spec`).
- `R:<name>` = AMD module `ripple/<name>` (framework level, example `R:emulatorBridge`, `R:platform/builder`).
- Other files are cited by path relative to `app.nw/` or `<sim>/`.

To locate a citation: `grep -o 'define("ripple/platform/tizentv/2.0/application"' ripple.js`.

### 0.3 Architecture in one paragraph (OBSERVED)

The simulator is a fork of the Ripple emulator (tinyHippos / RIM) running in NW.js. 284 AMD modules are bundled in
`ripple.js`. The platform id is `tizentv`, spec version string `"3.0"`, display name `"Samsung Tizen TV"`, persistence prefix
`"tizentv-"` (`M:spec`). The TV app is loaded into `<iframe id="document">` of the simulator window. On every frame load,
`R:emulatorBridge.link` builds a sandbox object tree from `M:spec.objects` using `R:platform/builder` and copies each top-level
object onto the iframe `window`: `tizen`, `webapis`, `b2bapis`, `navigator` (wrapper), plus leftovers of the mobile Ripple
(`Coordinates`, `Position`, `PositionError`, `SensorConnection`). It also replaces `XMLHttpRequest` and `Date` in the frame and
overrides screen / `innerWidth`-style getters.

Consequences for a reimplementation:

- `window.tizen` and `window.webapis` exist **before any app script runs** and do not depend on any `<script>` include.
- The APIs execute in the same JS realm family as the simulator UI (direct object sharing, no IPC, no serialisation).
- Every member of the namespace objects is defined as a **getter without a setter** (OBSERVED `R:platform/builder`): assigning
  `tizen.application = x` is silently ignored in sloppy mode.

### 0.4 Legacy `$WEBAPIS/webapis/webapis.js` include (question 1)

- OBSERVED: zero occurrences of the strings `$WEBAPIS` and `webapis.js` in `ripple.js` (grep count 0), and no request
  interception / URL rewriting module handles them.
- INFERRED: an app containing `<script src="$WEBAPIS/webapis/webapis.js">` gets a failed local file load for that tag (the
  literal path does not exist) and keeps working because `window.webapis` is injected unconditionally. A clean-room emulator
  should do what a real TV does instead: serve an empty (or shim) script for that URL so no 404 appears in the console, while
  always injecting `window.webapis`.

### 0.5 General conventions observed across modules

| Topic | Behaviour | Evidence |
|---|---|---|
| Async delivery | "Async" methods call their callback from `setTimeout(fn, 1)` (1 ms). | OBSERVED `M:application`, `M:systeminfo`, `M:filesystem`, `M:package` |
| Argument validation | Most `tizen.*` managers validate through a schema table (`M:typedef` + `M:typecast`): wrong type throws `WebAPIException` `TYPE_MISMATCH_ERR` synchronously, even when an error callback was supplied. | OBSERVED `M:typecast` |
| Thrown vs callback errors | Thrown object = `WebAPIException`; object passed to error callbacks = `WebAPIError` (several modules pass a `WebAPIException` to callbacks instead). | OBSERVED `M:WebAPIException`, `M:WebAPIError` |
| Listener ids | Numeric, generated ad hoc per module (random 8-10 digit ints, counters from 1024 / 2048, or `Date.now()`). | OBSERVED per module |
| Privilege failures | `WebAPIException` code 18, name `SecurityError`. | OBSERVED section 2.3 |
| Logging | Almost every method logs to the simulator console; irrelevant to behaviour. | OBSERVED |

Known defects of the simulator that a reimplementation must **not** copy (all OBSERVED; the runtime effect is INFERRED):

- Several modules reference identifiers that are never declared in their scope (`ErrorCode`, `constants`, `_console`,
  `_cancelMessage`, `keyNameArray`). Reaching those statements raises a native `ReferenceError` instead of the intended result.
  Affected: `tizen.tvinputdevice.registerKeyBatch/unregisterKeyBatch`, `tizen.tvchannel.*`, `tizen.tvaudiocontrol.setMute`,
  `tizen.application.launch`, the error-callback path of `tizen.systeminfo.getPropertyValue`.
- Misspelled constants (`TYPE_MISSMATCH_ERR`, `UNKNOWN_ERROR`) produce an exception whose code is `undefined`, which the
  exception constructor normalises to 9999 / `UnknownError`.

## 1. Error objects

### 1.1 Error codes (OBSERVED `M:errorcode`)

| Constant | Code | `name` |
|---|---|---|
| `UNKNOWN_ERR` | 9999 | `UnknownError` |
| `INDEX_SIZE_ERR` | 1 | `IndexSizeError` |
| `DOMSTRING_SIZE_ERR` | 2 | `DOMStringSizeError` (INFERRED spelling, DOM-standard table) |
| `HIERARCHY_REQUEST_ERR` | 3 | `HierarchyRequestError` |
| `WRONG_DOCUMENT_ERR` | 4 | `WrongDocumentError` |
| `INVALID_CHARACTER_ERR` | 5 | `InvalidCharacterError` |
| `NO_DATA_ALLOWED_ERR` | 6 | `NoDataAllowedError` |
| `NO_MODIFICATION_ALLOWED_ERR` | 7 | `NoModificationAllowedError` |
| `NOT_FOUND_ERR` | 8 | `NotFoundError` |
| `NOT_SUPPORTED_ERR` | 9 | `NotSupportedError` |
| `INUSE_ATTRIBUTE_ERR` | 10 | `InuseAttributeError` |
| `INVALID_STATE_ERR` | 11 | `InvalidStateError` |
| `SYNTAX_ERR` | 12 | `SyntaxError` |
| `INVALID_MODIFICATION_ERR` | 13 | `InvalidModificationError` |
| `NAMESPACE_ERR` | 14 | `NamespaceError` |
| `INVALID_ACCESS_ERR` | 15 | `InvalidAccessError` |
| `VALIDATION_ERR` | 16 | `ValidationError` |
| `TYPE_MISMATCH_ERR` | 17 | `TypeMismatchError` |
| `SECURITY_ERR` | 18 | `SecurityError` |
| `NETWORK_ERR` | 19 | `NetworkError` |
| `ABORT_ERR` | 20 | `AbortError` |
| `URL_MISMATCH_ERR` | 21 | `URLMismatchError` |
| `QUOTA_EXCEEDED_ERR` | 22 | `QuotaExceededError` |
| `TIMEOUT_ERR` | 23 | `TimeoutError` |
| `INVALID_NODE_TYPE_ERR` | 24 | `InvalidNodeTypeError` |
| `DATA_CLONE_ERR` | 25 | `DataCloneError` |
| `INVALID_VALUES_ERR` | 26 | `InvalidValuesError` |
| `IO_ERR` | 27 | `IOError` |
| `SERVICE_NOT_AVAILABLE_ERR` | 28 | `ServiceNotAvailableError` |

The names for codes 1, 17-28 and 9999 are OBSERVED verbatim in `M:WebAPIException`; names for codes 2-16 follow the standard
DOMException naming and were not individually transcribed (INFERRED for those rows).

### 1.2 `WebAPIException(code, message?, name?)` (OBSERVED `M:WebAPIException`)

- Instance exposes every `*_ERR` constant as a read-only getter, plus read-only `code`, `message`, `name`.
- A non-number `code` becomes 9999.
- `name` defaults from the code table above; `message` defaults from a message table.
- Quirk: the message table is keyed 0-25, 99, 100 and 111, so codes 26, 27, 28 and 9999 get `message === undefined` unless a
  message is passed explicitly.
- Not an `Error` subclass: no `stack` (INFERRED from the plain-constructor shape).

### 1.3 `WebAPIError(code, message?, name?)` (OBSERVED `M:WebAPIError`)

- Only `code`, `message`, `name` getters (no constants).
- Quirk: its name table uses keys 99 / 100 / 111 for InvalidValuesError / IOError / ServiceNotAvailableError, so a
  `WebAPIError` created with code 26, 27, 28 or 9999 has `name === undefined`.

### 1.4 Exposure

OBSERVED `M:spec`: neither `WebAPIException` nor `WebAPIError` is listed as a child of `tizen`, so
`tizen.WebAPIException` is `undefined` in the simulator and `e instanceof tizen.WebAPIException` throws. Real devices expose
`tizen.WebAPIException` and `tizen.WebAPIError`; a reimplementation should expose them (divergence noted on purpose).

Recommended (INFERRED) behaviour for the clean-room implementation: one `WebAPIException` class that extends `Error`, carries
the constants statically and on the prototype, and always fills `name` and `message`.

## 2. Global object tree and privilege gating

### 2.1 Globals injected into the app window (OBSERVED `M:spec.objects`, `R:emulatorBridge`)

`tizen`, `webapis`, `b2bapis`, `navigator` (wrapper, see doc 06 section 7), `Coordinates`, `Position`, `PositionError`,
`SensorConnection`; plus overrides of `XMLHttpRequest`, `Date`, and the internal `tinyHippos` handle. Node's `require` is
removed from the app window (an alias `requireNode` is kept for the simulator itself; `R:bootstrap`).

### 2.2 Children of `tizen` (OBSERVED `M:spec.objects.tizen.children`)

Feature of the root: `http://tizen.org/privilege/tizen`.

| Member | Kind | Backing module | Privilege(s) attached in spec | Section |
|---|---|---|---|---|
| `application` | manager | `M:application` | application.info, application.launch, appmanager.kill, appmanager.certificate | 3.1 |
| `ApplicationControl`, `ApplicationControlData` | constructors | same names | - | 3.1 |
| `tvinputdevice` | manager | `M:tvInputDevice` | - | 3.2 |
| `systeminfo` | manager | `M:systeminfo` | system, systemmanager | 3.3 |
| `tvaudiocontrol` | manager | `M:audiocontrol` | - | 3.4 |
| `tv.audiocontrol` | manager | `M:audiocontrol` (same module) | - | 3.4 |
| `tv.window` | manager | `M:TVWindow` | - | 3.5 |
| `tvchannel` | manager | `M:TVChannel` | - | 3.6 |
| `tv.channel` | manager | `M:channel` | - | 3.6 |
| `tv.displaycontrol` | manager | `M:displaycontrol` | (spec key misspelled `feather`) | 3.7 |
| `tvinfo` | manager | `M:tvinfo` | - | 3.8 |
| `filesystem` | manager | `M:filesystem` | filesystem.read, filesystem.write | 3.9 |
| `time`, `TZDate`, `TimeDuration` | manager + constructors | `M:time`, `M:TZDate`, `M:TimeDuration` | - | 3.10 |
| `alarm`, `AlarmAbsolute`, `AlarmRelative` | manager + constructors | `M:alarm` | alarm | 3.11 |
| `download`, `DownloadRequest` | manager + constructor | `M:download` | download | 3.12 |
| `package` | manager | `M:package` | packagemanager.install, package.info | 3.13 |
| `messageport` | manager | `M:messageport` | - | 3.14 |
| `keymanager` | manager | `M:keymanager` | - | 3.15 |
| `datacontrol` | manager | `M:datacontrol` | - | 3.16 |
| `websetting` | manager | `M:websetting` | websetting | 3.17 |
| `systemsetting` | manager | `M:systemsetting` | setting | 3.18 |
| `notification` | manager | `M:notification` | (notification) | 3.18 |
| `push` | manager | `M:push` | (push) | 3.18 |
| `content` | manager | `M:content` | content.read, content.write | 3.18 |
| `calendar` + `Calendar*` constructors | manager | `M:calendar` | calendar.read, calendar.write | 3.18 |
| `archive` | manager | `M:archive` | filesystem.read, filesystem.write | 3.18 |
| `voicecontrol` | manager | `M:VoiceControl` | - | 3.18 |
| `exif`, `ExifInformation` | manager + constructor | `M:exif` | - | 3.18 |
| iotcon members (spread onto `tizen`) | functions | `M:iotcon` | - | 3.18 |
| `AttributeFilter`, `AttributeRangeFilter`, `CompositeFilter`, `SortMode`, `SimpleCoordinates` | constructors | same names | - | 3.18 |
| `appList`, `mode`, `automatedTestTool` | simulator-internal | `M:appList`, `M:mode`, `M:automatedTestTool` | - | 3.19 |

**Not present** in the simulator (OBSERVED by absence from the children list): `tizen.tvwindow` (only `tizen.tv.window`
exists), `tizen.preference`, `tizen.network` / connection, `tizen.bluetooth` (a module exists but is not wired),
`tizen.bookmark`, `tizen.WebAPIException`, `tizen.WebAPIError`, and the interface constructors such as `tizen.TVInputDeviceKey`.

Divergence warning (INFERRED from public Tizen TV API knowledge, not from the simulator): real Tizen TV exposes
`tizen.tvwindow`, `tizen.tvaudiocontrol`, `tizen.tvchannel`, `tizen.tvinputdevice`, `tizen.tvdisplaycontrol`. The simulator's
`tizen.tv.*` aliases are a legacy (Tizen 2.3 TV) naming. A reimplementation should expose the modern names and may keep the
`tizen.tv.*` aliases.

### 2.3 Privilege gating mechanism (OBSERVED `R:platform/builder`, `R:app`, `M:spec/config`)

1. On app load, `config.xml` is parsed and each `<tizen:privilege name="...">` whose name is in a fixed whitelist (doc 06
   section 2.3) is recorded as a feature of the app.
2. For each spec child flagged `handleSubfeatures: true` whose module exports a **constructor function**, the builder
   instantiates it, splits its `feature` string on `|`, keeps the features that the app declared, and calls
   `instance.handleSubFeatures(map)`. That method flips an internal per-method "allowed" flag for every method listed under
   each granted privilege. `handleSubFeatures` is then deleted from the public object.
3. A gated method whose flag is still unset throws `WebAPIException(SECURITY_ERR)` synchronously.
4. Modules that export a plain object (not a constructor) never receive the call and are therefore **ungated**
   (`tizen.tv.channel`, `tizen.tv.displaycontrol`).

Complete list of gated methods found:

| Privilege (`http://tizen.org/privilege/...`) | Gated methods | Evidence |
|---|---|---|
| `application.launch` | `tizen.application.launch`, `launchAppControl` | `M:application` |
| `application.info` | `tizen.application.getAppMetaData` | `M:application` |
| `appmanager.kill` | `tizen.application.kill` | `M:application` |
| `appmanager.certificate` | `tizen.application.getAppCerts` | `M:application` |
| `alarm` | `tizen.alarm.add`, `remove`, `removeAll` | `M:alarm` |
| `filesystem.read` | `filesystem.getStorage`, `resolve`, `listStorages`; `File.toURI`, `listFiles`, `openStream("r")`, `resolve`; `FileStream.close`, `read`, `readBytes`, `readBase64` | `M:filesystem` |
| `filesystem.write` | `filesystem.addStorageStateChangeListener`, `removeStorageStateChangeListener`; `File.copyTo`, `moveTo`, `createDirectory`, `createFile`, `deleteDirectory`, `deleteFile`, `readAsText` (sic), `openStream("w")`; `FileStream.write`, `writeBytes`, `writeBase64` | `M:filesystem` |
| `packagemanager.install` | `tizen.package.install`, `uninstall` | `M:package` |
| `package.info` | `tizen.package.getPackagesInfo`, `getPackageInfo`, `setPackageInfoEventListener`, `unsetPackageInfoEventListener` | `M:package` |
| `system` | `tizen.systeminfo` SIM property; deprecated capability getters `platformVersion`, `webApiVersion`, `nativeApiVersion` | `M:systeminfo` |
| `systemmanager` | `imei` getter of CELLULAR_NETWORK | `M:systeminfo` |
| `setting` | `tizen.systemsetting.setProperty` | `M:systemsetting` |
| `download` | `tizen.download.*` (flags present) | `M:download` |
| `notification` | `tizen.notification.post`, `update`, `remove`, `removeAll` | `M:notification` |
| `push` | `tizen.push.register`, `unregister`, `connect`, `disconnect`, `getRegistrationId` | `M:push` |

Key finding: **no TV-specific API is privilege-gated.** `tizen.tvinputdevice`, `tizen.tvaudiocontrol`, `tizen.tv.window`,
`tizen.tvchannel`, and every `webapis.*` namespace work without any privilege, and the TV privilege names
(`http://tizen.org/privilege/tv.inputdevice`, `tv.audio`, `tv.window`, `tv.channel`,
`http://developer.samsung.com/privilege/productinfo`, `.../avplay`, `.../network.public`) are not even in the whitelist
(OBSERVED `M:spec/config`). Real devices do enforce them (INFERRED from public documentation), so a faithful emulator should
implement gating from the real privilege list rather than copy the simulator here; a "warn, do not throw" mode is the closest
match to simulator behaviour.

## 3. `window.tizen` namespaces

Notation: `?` = optional argument. "sync" = result returned / exception thrown before the call returns. "async" = callback
invoked from a 1 ms timer.

### 3.1 `tizen.application` (OBSERVED `M:application`, `M:typedef`)

| Method | Sync/async | Behaviour and mock values |
|---|---|---|
| `getCurrentApplication()` | sync | Returns `Application { appInfo, contextId, exit(), hide(), getRequestedAppControl() }`. `contextId` is a 16-character uuid-like string generated per load. |
| `kill(contextId, successCb?, errorCb?)` | async | Unknown context -> error `NotFoundError`; own context -> `InvalidValuesError`; otherwise `successCb()`. Gated. |
| `launch(appId, successCb?, errorCb?)` | async | Unknown id -> `NotFoundError`; known id -> shows a simulator dialog then `successCb()`. Does not navigate. References an undeclared identifier (defect). Gated. |
| `launchAppControl(appControl, appId?, successCb?, errorCb?, replyCb?)` | async | Matches installed apps by `operation`; shows a dialog; no match -> `NotFoundError`. Gated. |
| `findAppControl(appControl, successCb, errorCb?)` | async | `successCb(ApplicationInformation[], appControl)`. |
| `getAppsContext(successCb, errorCb?)` | async | Array of `ApplicationContext { id, appId }`. |
| `getAppContext(contextId?)` | sync | Default = current app; unknown -> throws `NotFoundError`. |
| `getAppsInfo(successCb, errorCb?)` | async | Array of `ApplicationInformation`. |
| `getAppInfo(appId?)` | sync | Default = current app; unknown -> throws `NotFoundError`. |
| `getAppCerts(appId?)` | sync | `[ { type: "AUTHOR_ROOT", value: "" } ]`. Gated. |
| `getAppSharedURI(appId?)` | sync | `"/usr/local/share/"`. |
| `getAppMetaData(appId?)` | sync | `[ { key: "", value: "" } ]`. Gated. |
| `addAppInfoEventListener(cb)` | sync | Returns a random 10-digit integer; `cb` = `{ oninstalled, onupdated, onuninstalled }`. |
| `removeAppInfoEventListener(id)` | sync | - |
| `addAppStatusChangeListener(cb, appId?)` / `removeAppStatusChangeListener(id)` | sync | Registration only. |
| `getBatteryUsageInfo(...)`, `getAppsUsageInfo(...)` | sync | Return the literal string `"dummy value"`. |

`ApplicationInformation` fields: `id`, `name`, `iconPath`, `version`, `show` (always `true`), `installDate`
(`Date`), `size` (size of the installed `.wgt`, or 1024), `packageId`. Values come from the parsed `config.xml` (doc 06
section 2).

`Application` instance:

- `exit()` and `hide()` are **the same action**: both raise an internal event that makes the simulator stop AVPlay (if its
  state is not `NONE`) and navigate the app iframe back to the launcher page (`appLauncher/index.html` or
  `FirstScreen/index.html`). OBSERVED `M:application`, `R:ui/custom/UserInteraction/remoteControlBridge.exitToPreScreen`.
  No `visibilitychange`, `pagehide` hook or suspend notification is sent by the simulator itself; the document just unloads
  (INFERRED: standard `unload` / `pagehide` DOM events fire as for any navigation).
- `getRequestedAppControl()` returns `RequestedApplicationControl { appControl, callerAppId, replyResult(data?), replyFailure() }`
  where `appControl` is always `ApplicationControl(operation = "", uri = null, mime = null, category = null, data = [])` and
  `callerAppId` is the app's own id. **There is no deep-link / `PAYLOAD` simulation** (OBSERVED: the only `PAYLOAD` strings in
  the bundle belong to the push-notification UI).

Constructors: `tizen.ApplicationControl(operation, uri?, mime?, category?, data?)` and
`tizen.ApplicationControlData(key, value[])`, both with type-coercing setters (wrong types are ignored or coerced rather
than thrown).

Recommended divergence (INFERRED): on a real TV, `exit()` terminates and `hide()` backgrounds the app (firing
`visibilitychange`); a real deep link arrives as `getRequestedAppControl().appControl.data` containing key `PAYLOAD`. The
emulator should implement the real semantics; the simulator offers no reference for them.

### 3.2 `tizen.tvinputdevice` (OBSERVED `M:tvInputDevice`)

| Method | Behaviour |
|---|---|
| `getSupportedKeys()` | sync, returns an array of `{ name, code }` (read-only fields); table in doc 06 section 3.2. |
| `getKey(keyName)` | sync, returns the entry or throws `InvalidValuesError`. |
| `registerKey(keyName)` | Validates that the argument is a non-empty string (else `InvalidValuesError`). **Otherwise a no-op.** |
| `unregisterKey(keyName)` | Same validation, no-op. |
| `registerKeyBatch(names, successCb?, errorCb?)` / `unregisterKeyBatch(...)` | Defective (undeclared identifier); INFERRED to throw `ReferenceError`. |

Key finding: the simulator performs **no key filtering**. Every remote button reaches the app whether or not it was
registered (details in doc 06 section 3). The key names in its table are `KEY_*` style (`KEY_PLAY`, `KEY_RED`, ...), not the
real-device names (`MediaPlay`, `ColorF0Red`, ...); the real-device names appear only in `webapis.appcommon` (section 4.6).

### 3.3 `tizen.systeminfo` (OBSERVED `M:systeminfo`, `M:spec/device`, `M:systeminfo_keys`)

Accepted property ids: `BATTERY`, `CPU`, `STORAGE`, `DISPLAY`, `BUILD`, `LOCALE`, `NETWORK`, `WIFI_NETWORK`,
`CELLULAR_NETWORK`, `SIM`, `PERIPHERAL`. Any other id (including the TV-relevant `ETHERNET_NETWORK`, `MEMORY`, `VIDEOSOURCE`,
`DEVICE_ORIENTATION`, `NET_PROXY_NETWORK`) fails with `TypeMismatchError`.

| Method | Sync/async | Behaviour |
|---|---|---|
| `getPropertyValue(id, successCb, errorCb?)` | async | `successCb(object of read-only getters)`. |
| `getPropertyValueArray(id, successCb, errorCb?)` | async | Same as above; passes a single object, not an array (quirk). |
| `addPropertyValueChangeListener(id, cb, options?)` | sync | Returns an 8-digit number. Fires `cb` once after 1 ms and again on simulator setting changes. `options` = `{ timeout, highThreshold, lowThreshold }`. |
| `removePropertyValueChangeListener(id)` | sync | Unknown id -> `InvalidValuesError`. |
| `addPropertyValueArrayChangeListener(...)` | sync | Returns `undefined`. |
| `getCapability(key)` | sync | `key` must be a string containing `http://tizen.org/`, else throws `UnknownError`. Returns the table value, or `false` for an unknown key. |
| `getCapabilities()` | sync | Deprecated object, table below. |
| `getCount(id)` | sync | Number of fields of that property. |
| `getTotalMemory()`, `getAvailableMemory()` | sync | Return `undefined`. |

Default property values:

| Property | Fields and defaults |
|---|---|
| `BATTERY` | `level: 1`, `isCharging: false` |
| `CPU` | `load: 0.1` |
| `STORAGE` | `units: [ { type: "INTERNAL", capacity: 16000000000, availableCapacity: 12000000000, isRemovable: true } ]` (the object also mirrors those fields at top level) |
| `DISPLAY` | `resolutionWidth: 0`, `resolutionHeight: 0`, `dotsPerInchWidth: 0`, `dotsPerInchHeight: 0`, `physicalWidth: 0`, `physicalHeight: 0`, `brightness: 1` |
| `BUILD` | `model: "Simulator"`, `manufacturer: "Tizen"`, `buildVersion: "TIZEN_WEB_SIMULATOR_000001"` |
| `LOCALE` | `language: "eng_USA"`, `country: "eng_USA"` (UI options: eng_USA, eng_CAN, deu_DEU, jpn_JPN, zho_CHN, UNKNOWN) |
| `NETWORK` | `networkType: "Wired"` (options Wired / Wireless; real devices use `ETHERNET` / `WIFI` / `NONE`) |
| `WIFI_NETWORK` | `status: "OFF"`, `ssid: "Tizen WiFi"`, `ipAddress: "192.168.0.1"`, `ipv6Address: "2001:db8:85a3:0:0:0:70:7334"`, `signalStrength: 0` |
| `CELLULAR_NETWORK` | `status: "ON"`, `apn: "Tizen"`, `ipAddress: "10.0.2.16"`, `ipv6Address` as above, `mcc: 460`, `mnc: 0`, `cellId: 0`, `lac: 0`, `isRoaming: true`, `isFlightMode: false`, `imei: "012417005203000"` |
| `SIM` | `state: "READY"`, `operatorName: "Tizen"`, `msisdn: "088123456789"`, `iccid: "123000MFSSYYGXXXXXXP"`, `mcc: 460`, `mnc: 0`, `msin: "H1 H2 H3 S 12345"`, `spn: "TizenSPN"` |
| `PERIPHERAL` | `isVideoOutputOn: false` |

`getCapability` table: every listed `http://tizen.org/feature/...` key returns `true`, except:

| Key | Value |
|---|---|
| `http://tizen.org/feature/platform.core.api.version` | `"2.2"` |
| `http://tizen.org/feature/platform.core.cpu.arch` | `"x86"` |
| `http://tizen.org/feature/platform.core.fpu.arch` | `"ssse3"` |
| `http://tizen.org/feature/platform.native.api.version` | `"2.2"` |
| `http://tizen.org/feature/platform.version` | `"5.0"` |
| `http://tizen.org/feature/platform.web.api.version` | `"2.2"` |
| `http://tizen.org/feature/profile` | `"MOBILE_WEB"` |
| `http://tizen.org/system/duid` | `"device unique ID"` |
| `http://tizen.org/system/platform.name` | `"Tizen"` |

No TV keys exist in the table (`http://tizen.org/feature/screen.width`, `.../screen.height`, `http://tizen.org/system/model_name`,
`http://tizen.org/feature/tv.*`, `http://developer.samsung.com/...`): they all return `false`.

Deprecated `getCapabilities()` object: `bluetooth true`, `nfc true`, `nfcReservedPush false`, `multiTouchCount 5`,
`inputKeyboard false`, `inputKeyboardLayout false`, `wifi true`, `wifiDirect true`, `opengles false`,
`openglestextureFormat ""`, `openglesVersion1_1 false`, `openglesVersion2_0 false`, `fmRadio false`,
`platformVersion "2.2.0"`, `webApiVersion "2.2"`, `nativeApiVersion "2.2"`, `platformName "Tizen"`, `cameras false`,
`location true`, `locationGps true`, `locationWps false`, `microphone false`, `usbHost true`, `usbAccessory false`,
`screenOutputRca false`, `screenOutputHdmi false`, `platformCoreCpuArch "x86"`, `platformCoreFpuArch "ssse3"`, `sipVoip false`,
`duid "device unique ID"`, speech flags `false`, `accelerometer true`, `gyroscope true`, `push true`, `telephony true`,
`telephonyMms true`, `telephonySms true`, `screenSizeNormal true`, `screenSize480_800 true`, `screenSize720_1280 true`,
`autoRotation true`, `shellAppWidget false`, vision flags `false`, `secureElement false`, `nativeOspCompatible false`,
`profile "MOBILE_WEB"`.

Assessment (INFERRED): this namespace is inherited from the mobile simulator and is a poor model of a TV. The emulator
should take its property set and capability keys from the public Tizen TV documentation and a `DeviceProfile`, using the
simulator only as evidence of shape (read-only getter objects, 1 ms async delivery).

### 3.4 `tizen.tvaudiocontrol` and `tizen.tv.audiocontrol` (OBSERVED `M:audiocontrol`; one module, two mount points)

| Method | Behaviour |
|---|---|
| `setMute(bool)` | Applies `muted` to every `<audio>` / `<video>` in the app document, stores the flag. Then hits an undeclared identifier (defect). |
| `isMute()` | Default `false`. |
| `setVolume(n)` | `n < 0` or `n > 100` -> `InvalidValuesError`. Sets `element.volume = n / 100` on all media elements, fires the change listener with the new volume. |
| `setVolumeUp()` / `setVolumeDown()` | Defective: clamp only, the stored value does not change. |
| `getVolume()` | Default returned by this module: `1` (the simulator UI separately seeds TV volume 60, doc 06 section 5). |
| `setVolumeChangeListener(cb)` | Non-function -> exception with undefined code (-> `UnknownError`). Callback receives the volume number. |
| `unsetVolumeChangeListener()` | - |
| `getOutputMode()` | Returns the number `0` (real devices return a string such as `"PCM"`). |
| `playSound(type)` | Valid types: `UP`, `DOWN`, `LEFT`, `RIGHT`, `PAGE_LEFT`, `PAGE_RIGHT`, `BACK`, `SELECT`, `CANCEL`, `WARNING`, `KEYPAD`, `KEYPAD_ENTER`, `KEYPAD_DEL`, `MOVE`, `PREPARING`. Invalid -> exception. |

### 3.5 `tizen.tv.window` (OBSERVED `M:TVWindow`)

Fixed logical screen 1920 x 1080. Enumerations: WindowType `MAIN`, `UNKNOWN`; WindowSourceType `TV`, `AV`, `SVIDEO`, `COMP`,
`PC`, `HDMI`, `SCART`, `DVI`, `MEDIA`, `IPTV`; MeasurementUnit `px`, `%`.

| Method | Behaviour |
|---|---|
| `getAvailableWindows(successCb, errorCb?)` | `successCb(["MAIN"])`. |
| `getAvailableSources()` | `[ {type:"TV",number:1}, {type:"HDMI",number:1}, {type:"HDMI",number:2} ]`. |
| `setSource(sourceInfo, successCb, errorCb?, windowType?)` | Accepts TV 1 or the HDMI entries; otherwise `NotSupportedError`. `successCb(sourceInfo, "MAIN")`. |
| `getSource(windowType?)` | Current source, default `{type:"TV",number:1}`. |
| `show(successCb, errorCb?, rectangle?, windowType?)` | `rectangle` = 4 strings `[x, y, w, h]`, each `"N"`, `"Npx"` or `"N%"`. Invalid format, or `x + w > 1920`, or `y + h > 1080` -> `InvalidValuesError` (to callback when given, otherwise thrown). Positions a placeholder element in the simulator and calls `successCb(rectangle, "MAIN")`. |
| `hide(successCb, errorCb?, windowType?)` | `successCb("MAIN")`. |
| `getRect(successCb, errorCb?, unit?, windowType?)` | `successCb([x, y, w, h] as strings, "MAIN")`; also returns the array. Default rect `[0, 0, 1920, 1080]`. |
| `getVideoResolution()` | `{ width: 1920, height: 1080, aspectRatio: "ASPECT_RATIO_16x9" }`. |
| `addVideoResolutionChangeListener(cb)` / `removeVideoResolutionChangeListener(id)` | Validation only. |

### 3.6 `tizen.tvchannel` and `tizen.tv.channel`

`tizen.tvchannel` (OBSERVED `M:TVChannel`): validation-only stubs returning `undefined`: `tune`, `tuneUp`, `tuneDown`,
`findChannel`, `getChannelList`, `getCurrentChannel`, `getProgramList`, `getCurrentProgram`, `addChannelChangeListener`,
`removeChannelChangeListener`, `addSignalStateChangeListener`, `removeSignalStateChangeListener`, `getFavorites`,
`getBroadcastStandard`. Bad callback / enum -> `TypeMismatchError`. Defective (undeclared identifier in every method).

`tizen.tv.channel` (OBSERVED `M:channel`): a working mock, ungated.

- Data: 3 channels `{ major: i, minor: i, channelName: "ChannelInfo{i}_channelName", programNumber: i, ptc: i, lcn: i,
  sourceID: i, transportStreamID: i, originalNetworkID: i, serviceName: "ChannelInfo{i}_serviceName" }` and 3 programs
  `{ title: "ProgramInfo{i}_title", startTime: TZDate(now), duration: i, detailedDescription, language, rating }`.
- `tune(tuneOption, { onsuccess })` -> `onsuccess(currentChannel, "MAIN")`; `tuneUp` / `tuneDown({ onsuccess })` cycle the
  index modulo 3; `findChannel(major, minor, cb)` and `getChannelList(cb, ...)` -> `cb(allChannels)`;
  `getCurrentChannel()` -> channel at index 1; `getProgramList(channel, start, cb)` -> `cb(programs)`;
  `getCurrentProgram()` -> program 1; `addChannelChangeListener(cb)` calls `cb(channel, "MAIN")` immediately and returns an
  id counting from 1024; `addProgramChangeListener(cb)` -> id from 2048; `getNumOfAvailableTuner()` -> 1;
  `getNumOfAvailableSources()` -> 1.

### 3.7 `tizen.tv.displaycontrol` (OBSERVED `M:displaycontrol`)

- `get3DEffectMode()` -> returns the whole mode list array (quirk; real API returns one string).
- `is3DModeEnabled()` -> `false` (real API returns a string such as `"NOT_SUPPORTED"`).
- `getSupported3DEffectModeList(successCb, errorCb?)` -> `successCb(["OFF", "TOP_BOTTOM", "SIDE_BY_SIDE", "LINE_BY_LINE",
  "VERTICAL_STRIPE", "FRAME_SEQUENCE", "CHECKER_BD", "FROM_2D_TO_3D"])`.

### 3.8 `tizen.tvinfo` (OBSERVED `M:tvinfo`, `M:spec/tvinfo`)

- `CaptionInfoKey`: identity enum of 12 names: `CAPTION_ONOFF_KEY`, `CAPTION_MODE_KEY`, `CAPTION_FONT_SIZE_KEY`,
  `CAPTION_FONT_STYLE_KEY`, `CAPTION_FONT_COLOR_KEY`, `CAPTION_FONT_OPACITY_KEY`, `CAPTION_BG_COLOR_KEY`,
  `CAPTION_BG_OPACITY_KEY`, `CAPTION_EDGE_TYPE_KEY`, `CAPTION_EDGE_COLOR_KEY`, `CAPTION_WINDOW_COLOR_KEY`,
  `CAPTION_WINDOW_OPACITY_KEY`.
- `getCaptionValue(key)` -> string from simulator settings (defaults in doc 06 section 5.3); bad key -> `TypeMismatchError`.
- `addCaptionValueChangeListener(key, cb)` -> returns `1`; `removeCaptionValueChangeListener(id)`.

### 3.9 `tizen.filesystem` (OBSERVED `M:filesystem`, `M:dbfs`)

Backing store: a real directory on the host, `<HOME>/root` by default (overridable through a persisted "FS root" setting),
seeded on first use by copying the bundled `app.nw/vfs/` tree. An in-memory index of that tree is built at first `resolve`.
Virtual roots = the top-level folders of the seed tree: `apps`, `camera`, `documents`, `downloads`, `hls`, `images`, `music`,
`other`, `removable`, `usb`, `videos`, `wgt-package`, `wgt-private`, `wgt-private-tmp`. Mutations are applied to the index
and mirrored to disk through shell commands (`cp`, `mv`, `mkdir`, `touch`, `rm`).

Manager:

| Member | Behaviour |
|---|---|
| `maxPathLength` | `256` |
| `resolve(location, successCb, errorCb?, mode?)` | async. `mode` `"r"` or `"rw"` (default `"rw"`), other -> error `InvalidValuesError`. Each path segment must be a valid name (not `.` / `..`, <= 256 chars) else `InvalidValuesError`; unknown path -> `NotFoundError`. `successCb(File)`. |
| `getStorage(label, successCb, errorCb?)` | async `successCb({ label, type, state })`; unknown label -> `NotFoundError` (thrown if no error callback). |
| `listStorages(successCb, errorCb?)` | async; `[ { label: "InternalFlash", type: "INTERNAL", state: "MOUNTED" }, { label: "MMC", type: "EXTERNAL", state: "REMOVED" } ]` (populated after the first `resolve`). |
| `addStorageStateChangeListener(cb, errorCb?)` | Returns `Date.now()` as id. |
| `removeStorageStateChangeListener(id)` | Non-number -> `TypeMismatchError`; unknown -> `InvalidValuesError`. |

`File` object: read-only getters `parent`, `readOnly` (always `false`), `isFile`, `isDirectory`, `created`, `modified`, `path`,
`name`, `fullPath`, `fileSize` (files only), `length` (directories only: child count). Methods:

| Method | Behaviour |
|---|---|
| `toURI()` | `"file://" + fullPath` (host path). |
| `listFiles(successCb, errorCb?, filter?)` | async array of `File`; filter `{ name (with % wildcard, case-insensitive), startModified, endModified, startCreated, endCreated }`; called on a file -> `IOError`. |
| `openStream(mode, successCb, errorCb?, encoding?)` | `mode` `r` / `w` / `a` else `InvalidValuesError`; encoding `UTF-8` (default) or `ISO-8859-1` else `InvalidValuesError`; writing on an `"r"`-resolved file -> `SecurityError`. async `successCb(FileStream)`. |
| `readAsText(successCb, errorCb?, encoding?)` | Reads the host file; directory -> `IOError`. |
| `copyTo(src, dest, overwrite, successCb?, errorCb?)`, `moveTo(...)` | Source must be a direct child, else `IOError`; `"r"` mode -> `SecurityError`. |
| `createDirectory(path)` | sync, returns `File`; existing -> `IOError`; invalid name -> `InvalidValuesError`. |
| `createFile(name)` | sync, returns `File`; existing -> `IOError`. |
| `resolve(relativePath)` | sync, returns `File` or `null`. |
| `deleteDirectory(path, recursive, successCb?, errorCb?)` | Non-empty without `recursive` -> `IOError`. |
| `deleteFile(path, successCb?, errorCb?)` | Not a direct child file -> `IOError`. |

`FileStream`: getters `eof`, `position` (settable; out of range -> `InvalidValuesError`), `bytesAvailable` (`-1` at end);
methods `close()`, `read(count)`, `readBytes(count)` (array of char codes), `readBase64(count)`, `write(string)`,
`writeBytes(byteArray)`, `writeBase64(string)`. Data is flushed to the host file on `close()` for `w` / `a` modes.

Divergence note (INFERRED): `wgt-package` and `wgt-private` here are shared seed folders, not per-app locations; the real
platform maps `wgt-package` to the installed app (read-only) and `wgt-private` to app-private storage. The emulator should
implement the real mapping.

### 3.10 `tizen.time`, `tizen.TZDate`, `tizen.TimeDuration` (OBSERVED `M:time`, `M:TZDate`, `M:TimeDuration`)

- `time.getCurrentDateTime()` -> `TZDate` now; `getLocalTimezone()` -> zone name derived from the host UTC offset;
  `getAvailableTimezones()` -> list from a bundled table; `getDateFormat(shortformat?)` -> `"d/m/y"` when truthy, else
  `"D, M d, y"`; `getTimeFormat()` -> `"h:m:s ap"`; `isLeapYear(year)`; `setDateTimeChangeListener(cb)` /
  `unsetDateTimeChangeListener()`; `setTimezoneChangeListener(cb)` / `unsetTimezoneChangeListener()`.
- `TZDate` methods: `getDate/setDate`, `getDay`, `getFullYear/setFullYear`, `getHours/setHours`,
  `getMilliseconds/setMilliseconds`, `getMinutes/setMinutes`, `getMonth/setMonth`, `getSeconds/setSeconds`, the `UTC`
  counterparts of each, `getTimezone`, `toTimezone(tzid)`, `toLocalTimezone`, `toUTC`, `difference(other)`, `equalsTo`,
  `earlierThan`, `laterThan`, `addDuration(duration)`, `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString`,
  `toDateString`, `toTimeString`, `toString`, `getTimezoneAbbreviation`, `secondsFromUTC`, `isDST`,
  `getPreviousDSTTransition`, `getNextDSTTransition`.
- `TimeDuration(length, unit?)`: units `MSECS` (1), `SECS` (1e3), `MINS`, `HOURS`, `DAYS`; unknown unit -> `TypeMismatchError`;
  methods `difference`, `equalsTo`, `lessThan`, `greaterThan`.

### 3.11 `tizen.alarm` (OBSERVED `M:alarm`)

Constants `PERIOD_MINUTE 60`, `PERIOD_HOUR 3600`, `PERIOD_DAY 86400`, `PERIOD_WEEK 604800`. Methods: `add(alarm,
applicationId, appControl?)` (assigns a 16-char id, persists), `remove(id)` (unknown -> `NotFoundError`), `removeAll()`,
`get(id)` (unknown or expired -> `NotFoundError`), `getAll()`. Alarms are stored only; **they never fire** (no launch is
simulated). `add`, `remove`, `removeAll` are gated by `privilege/alarm`.

### 3.12 `tizen.download` (OBSERVED `M:download`, `M:typedef`)

`start(DownloadRequest, listener?)` -> numeric id; simulated progress on a timer, no real network transfer (INFERRED from
the size / speed counters); `cancel(id)`, `pause(id)`, `resume(id)`, `getState(id)`, `getDownloadRequest(id)`,
`getMIMEType(id)`, `setListener(id, listener)`. States: `QUEUED`, `DOWNLOADING`, `PAUSED`, `CANCELED`, `COMPLETED`, `FAILED`.
Network types: `CELLULAR`, `WIFI`, `ALL`. Wrong-state transitions report `InvalidValuesError` through `listener.onfailed`.
Listener callbacks: `onprogress`, `onpaused`, `oncanceled`, `oncompleted`, `onfailed`.

### 3.13 `tizen.package` (OBSERVED `M:package`, `M:PackageInformation`)

`install(path, { onprogress(id, percent), oncomplete(id) }, errorCb?)` (simulated in 1 s ticks), `uninstall(id, cb,
errorCb?)`, `getPackagesInfo(successCb, errorCb?)` (async), `getPackageInfo(id?)` (sync, default own package; unknown ->
`NotFoundError`), `setPackageInfoEventListener(cb)`, `unsetPackageInfoEventListener()`. `PackageInformation` (read-only getters):
`packageName`, `id`, `name`, `iconPath`, `version`, `totalSize` (wgt size or 1024), `lastModified` (`Date`),
`author: "TizenDev"`, `appIds`, `path`.

### 3.14 `tizen.messageport` (OBSERVED `M:messageport`)

- `requestLocalMessagePort(name)` / `requestTrustedLocalMessagePort(name)` -> `LocalMessagePort { messagePortName, isTrusted,
  addMessagePortListener(cb) -> watchId (0-based), removeMessagePortListener(id) }`.
- `requestRemoteMessagePort(appId, name)` / `requestTrustedRemoteMessagePort(appId, name)` -> `RemoteMessagePort
  { messagePortName, appId, isTrusted, sendMessage(dataArray, localPort?) }`.
- `sendMessage` validates only and **never delivers** anything. Missing arguments -> `NotFoundError`; wrong type ->
  `TypeMismatchError`.

### 3.15 `tizen.keymanager` (OBSERVED `M:keymanager`)

`saveData(name, rawData, password?, successCb?, errorCb?)` (non-string -> `TypeMismatchError`; persists; `successCb()` is
called synchronously), `removeData({ name })` (`NotFoundError`), `getData({ name }, password?)` -> string (`NotFoundError`),
`getDataAliasList()` -> `[ { packageId: "packagaid", name } ]`, `setPermission({ name, packageId }, otherPackageId,
permission, successCb?, errorCb?)` with permission in `NONE`, `READ`, `REMOVE`, `READ_REMOVE`.

### 3.16 `tizen.datacontrol` (OBSERVED `M:datacontrol`)

`getDataControlConsumer(providerId, dataId, type)` with type `"SQL"` or `"MAP"` (else `TypeMismatchError`).
SQL consumer: `insert(reqId, { columns, values }, successCb(reqId, 1))`, `update(reqId, data, where, successCb(reqId))`,
`remove(reqId, where, successCb(reqId))`, `select(reqId, columns, where, successCb(rows, reqId))` with dummy rows.
MAP consumer: `addValue`, `removeValue`, `getValue(reqId, key, successCb(["dummy"], reqId))`, `updateValue`.

### 3.17 `tizen.websetting` (OBSERVED `M:websetting`)

`setUserAgentString(ua, successCb?, errorCb?)` stores the UA on the current simulated device (so `navigator.userAgent` in
later frames reflects it; doc 06 section 7); invalid -> `InvalidValuesError`. `removeAllCookies(successCb?, errorCb?)`:
defective.

### 3.18 Low-priority namespaces (inherited from the mobile simulator)

| Namespace | Behaviour summary | Evidence |
|---|---|---|
| `tizen.systemsetting` | `setProperty(type, value, successCb, errorCb?)`, `getProperty(type, successCb, errorCb?)`; types `HOME_SCREEN`, `LOCK_SCREEN`, `INCOMING_CALL`, `NOTIFICATION_EMAIL`; persisted. | `M:systemsetting` |
| `tizen.notification` | `post`, `update`, `remove`, `removeAll`, `get`, `getAll`; persisted list shown in the simulator UI; `StatusNotification` objects. | `M:notification` |
| `tizen.push` | `register`, `unregister`, `connect`, `disconnect`, `getRegistrationId`, empty `getUnreadNotifications`, `getPushMessage`. | `M:push` |
| `tizen.content` | Every method is an empty stub: `update`, `updateBatch`, `getDirectories`, `find`, `scanFile`, `scanDirectory`, `cancelScanDirectory`, `addChangeListener`, `removeChangeListener`, `getPlaylists`, `createPlaylist`, `removePlaylist`, `createThumbnail`. Callbacks are never invoked. | `M:content` |
| `tizen.archive` | `open(file, mode, successCb, errorCb?, options?)` -> `ArchiveFile { add, extractAll, getEntries, getEntryByName, close }`; `abort(opId)`. Closed archive -> `InvalidStateError`. | `M:archive` |
| `tizen.voicecontrol` | `getCurrentLanguage()` -> `"en_US"`; `setCommandList`, `unsetCommandList`, `release` empty; `addResultListener(cb)`, `addLanguageChangeListener(cb)` require a function, `remove*Listener(id)` require a number (`TypeMismatchError`). | `M:VoiceControl` |
| `tizen.exif` | `getExifInfo(uri, successCb, errorCb?)`, `saveExifInfo(info, successCb?, errorCb?)`, `getThumbnail(uri, successCb, errorCb?)`. `getThumbnail` requires a Node module (`exif`) that is not shipped in `node_modules` (OBSERVED absence; INFERRED to fail). | `M:exif` |
| iotcon | `initialize`, `getClient`, `getServer`, `getTimeout` / `setTimeout`, `addGeneratedPinListener` (calls back `"dummy-pin"`, returns 10000) and dummy client / server objects. | `M:iotcon` |
| `tizen.calendar` and filters | Mobile calendar mock; not relevant to TV. | `M:calendar` |

### 3.19 Simulator-internal members (do not reimplement)

- `tizen.appList`: `getAppList(cb)`, `getAppLauncherUrl()`, `setPreFrame` / `getPreFrame` (default `"main"`),
  `setSortIndex` / `getSortIndex`, `getFSALOrientation()`. Used by the simulator's own home screen and launcher pages
  (`FirstScreen/`, `appLauncher/`). OBSERVED `M:appList`.
- `tizen.mode.getDebugFlag()` -> the simulator's debug flag. OBSERVED `M:mode`.
- `tizen.automatedTestTool`: `collect()`, `addFileContent()`, `exportFile()`. OBSERVED `M:automatedTestTool`.

## 4. `window.webapis`

OBSERVED (`M:spec` `objects.webapis`): `webapis` is built from `M:webapis/webapis` plus the children listed below. Every child is
a plain object exposed through a getter (so `webapis.avplay = x` is silently ignored). There is no privilege gating on any
`webapis.*` member: none of the children declares `feature`/`handleSubfeatures`.

Children, in declaration order: `avinfo`, `avplay`, `avplaystore`, `appcommon`, `drminfo`, `logging`, `network`, `productinfo`,
`tvinfo`, `widgetdata`, `sso`, `SystemInfo` (capital S and I, sic), `billing`, `preview`, `microphone`, `allshare`
(`allshare.serviceconnector`), `displayrotator`, `featureconfig`, `hybridchannelinfo`, `document`, `syncplay`, `systemcontrol`,
`timer`, `adinfo`, `remotepower`, `clone`, `systemdebug`, `broadcast`, `objectdetection`, `poseestimation`, `voiceInteraction`.

NOT present in the simulator (OBSERVED by absence from `M:spec`): `webapis.widevine`, `webapis.was`, `webapis.caph`,
`webapis.avplaydrm`, `webapis.email`, `webapis.security`. A module `webapis/prdinfo` exists in the bundle but is not wired into
the object tree (see 4.20).

### 4.1 `webapis` root object

OBSERVED (`M:webapis/webapis`). All six methods are empty no-ops returning `undefined`:

| Method | Arity |
|---|---|
| `loadPepperPluginScript(a, b, c, d)` | 4 |
| `loadPepperPlugin(a)` | 1 |
| `setLoadCallback(cb)` | 1 |
| `loadCallback(a, b)` | 2 |
| `load(a, b)` | 2 |
| `unload(a)` | 1 |

### 4.2 `webapis.avplay`

OBSERVED (`M:webapis/avplay`). Singleton module with one module-level state variable and one backing HTML5 `<video>` element.
See doc 06 section 6 for the media plumbing; this section is the API contract.

#### States

`"NONE"`, `"IDLE"`, `"READY"`, `"PLAYING"`, `"PAUSED"` (an internal table also names `UNKNOWN: "unknown"`, never assigned).
Initial state is `"NONE"`. `getState()` returns the string. There is no `"STOPPED"`-like state: `stop()` goes back to `"IDLE"`.

#### State machine as implemented

| Call | Allowed from | Resulting state | Otherwise |
|---|---|---|---|
| `open(url)` | NONE, IDLE | IDLE | throws `InvalidStateError` |
| `close()` | any | NONE | never throws |
| `prepare()` | IDLE, READY | READY (only when the video element reports `networkState > 0`) | wrong state: throws `InvalidStateError`; `networkState == 0`: throws `NetworkError` |
| `prepareAsync(ok, err)` | IDLE, READY | READY when the element fires `loadedmetadata`, then `ok()` | wrong state: `err(InvalidStateError)` but execution continues; `networkState == 0`: `err(NetworkError)` |
| `play()` | READY, PLAYING, PAUSED | PLAYING | NONE or IDLE: throws `InvalidStateError` |
| `pause()` | PLAYING, PAUSED | PAUSED | throws `InvalidStateError` |
| `stop()` | any | IDLE (sets `currentTime = 0`, pauses the element) | never throws |
| `suspend()` | any | PAUSED (pauses the element) | throws a native TypeError if no element |
| `restore(url, ms, bPrepare)` | anything except READY, IDLE | PLAYING (delegates to the same routine as `play()`) | READY/IDLE: throws `InvalidStateError` |

Note (OBSERVED): the simulator is more permissive than the documented device state machine: `play()` straight after `open()`
throws, but `stop()`/`close()` are legal everywhere, and `prepareAsync` continues after reporting a state error.

#### Methods

All methods are synchronous unless noted. `"success"` below is a literal string return value.

| Method | Returns | Behaviour and validation |
|---|---|---|
| `open(url)` | `"success"` for `.ism`/`.m3u8` URLs, `""` (empty string) for everything else | `url` must be a string, else `TypeMismatchError`. Wrong state: `InvalidStateError`. Finds or creates the video element (see doc 06). URL sniffing is substring based: contains `"ism"` selects the Smooth Streaming path, contains `"m3u8"` selects the HLS path, otherwise `video.src = url`. |
| `close()` | `"success"` | Removes listeners registered through `setListener`, sets `src=""`, drops the element reference, state NONE. |
| `setListener(obj)` | `undefined` | Only acts when a video element exists (after `open`). For each own key of `obj`: strip a leading `on`, map through the event map below, then `addEventListener` on the video element. Not validated. |
| `setDisplayRect(x, y, w, h)` | `"success"` (`""` if called with fewer than 4 arguments) | All four must be numbers, else `TypeMismatchError`. State NONE: `InvalidStateError`. See doc 06 for the scaling rule. |
| `setNextURI(url)` | `undefined` | No-op. |
| `play()` | `"success"` | See state table. |
| `prepare()` | `undefined` | See state table. |
| `prepareAsync(successCb, errorCb)` | `"success"` or `""` | Both arguments must be functions; otherwise calls `errorCb(TypeMismatchError)` if it is a function and then throws `TypeMismatchError`. `successCb` is invoked with no arguments on `loadedmetadata`. |
| `stop()` | `"success"` | |
| `pause()` | `"success"` | |
| `jumpForward(ms, successCb, errorCb)` | `"success"` | `ms` number and both callbacks functions, else `errorCb(TypeMismatchError)` + throw. `ms < 0`: `errorCb(InvalidValuesError)`. State not READY/PLAYING/PAUSED: `errorCb(InvalidStateError)`. Execution continues after either error callback. New `currentTime = min(current + ms/1000, duration)`. Then `successCb()` synchronously. |
| `jumpBackward(ms, successCb, errorCb)` | `"success"` | Same, `currentTime = max(current - ms/1000, 0)`. |
| `seekTo(ms, successCb, errorCb)` | `"success"` | `ms` is passed through `parseInt` first. Type errors as above. `ms < 0`: `errorCb(InvalidValuesError)`; state NONE: `errorCb(InvalidStateError)`; both continue. Seeks only when `0 < ms/1000 < duration`. `successCb()` is called synchronously in every case. |
| `getDuration()` | number (ms) | `video.duration * 1000` (`NaN` before metadata). No state check. |
| `getCurrentTime()` | number (**seconds**, sic) | Returns `video.currentTime` unconverted. No state check. |
| `getState()` | state string | |
| `getSubState()` | state string | Same value as `getState()`. |
| `setSpeed(n)` | `"success"` | Number else `TypeMismatchError`; outside 1..4: `InvalidValuesError`; state not READY/PLAYING/PAUSED: `InvalidStateError`. Sets `video.playbackRate`. Negative speeds (rewind) are rejected. |
| `setDrm(drmType, drmOperation, json)` | `undefined` | `drmType` must be one of 0,1,2 and `drmOperation` one of 0..4. Validation only; never succeeds in practice (see quirks). |
| `setTimeoutForBuffering(sec)` | `"success"` | Number else `TypeMismatchError`; `< 0`: `InvalidValuesError`; state NONE: `InvalidStateError`. |
| `setSoundAnalysisListener(cb)` | `undefined` | Function else `TypeMismatchError`; state must be IDLE else `InvalidStateError`. |
| `unsetSoundAnalysisListener()` | `undefined` | State NONE: `InvalidStateError`. |
| `setSilentSubtitle(bool)` | `undefined` | Boolean else `TypeMismatchError`; NONE: `InvalidStateError`. |
| `setExternalSubtitlePath(path)` | `undefined` | String else `TypeMismatchError`; NONE: `InvalidStateError`. |
| `setSubtitlePosition(ms)` | `undefined` | Number else `TypeMismatchError`; state must be PLAYING/PAUSED. |
| `setDisplayMethod(mode)` | `undefined` | Must be one of the display-mode strings below else `TypeMismatchError`; NONE: `InvalidStateError`. No visual effect. |
| `setSelectTrack(type, index)` | `undefined` | String + number else `TypeMismatchError`; NONE/IDLE: `InvalidStateError`. No effect. |
| `getCurrentStreamInfo()` | array | Always `[{ index: 0, type: "VIDEO", extra_info: "" }]`. |
| `getTotalTrackInfo()` | array | Always `[{ index: 0, type: "VIDEO", extra_info: "Just an example for TrackInfo" }]`. |
| `setStreamingProperty(name, value)` | `undefined` | `name` must be one of the property strings below. |
| `getStreamingProperty(name)` | string | Returns the property name itself (echo), not a value. Unknown name: `TypeMismatchError`. |
| `getVersion()` | `"1.0"` | |
| `enableAudioStream()`, `disableAudioStream()`, `setDisplayRotation(x)` | `undefined` | No-ops. |

Constants used for validation (OBSERVED, module-private, not exposed as attributes of `webapis.avplay`):

- DRM types: `PLAYREADY: 0`, `MARLIN: 1`, `VERIMATRIX: 2`.
- DRM operations: `SETPROPERTIES: 0`, `GENCHALLENGE: 1`, `INSTALLLICENSE: 2`, `DELETELICENSE: 3`, `PROCESSINITIA: 4`.
- Streaming properties: `AVAILABLE_BITRATE`, `CURRENT_BANDWIDTH`, `DURATION`, `BUFFER_SIZE`, `START_FRAGMENT`, `COOKIE`,
  `CUSTOM_MESSAGE`, `USER_AGENT`, `PREBUFFER_MODE`, `ADAPTIVE_INFO`, `SET_MODE_3D`, `SET_MODE_4K`, `HD_AUDIO`, `WIDEVINE`.
- Display modes: `PLAYER_DISPLAY_MODE_ORIGIN_SIZE`, `_FULL_SCREEN`, `_LETTER_BOX`, `_CROPPED_FULL`, `_ZOOM_HALF`,
  `_ZOOM_THREE_QUARTERS`, `_ORIGIN_OR_LETTER`, `_DST_ROI` (all prefixed `PLAYER_DISPLAY_MODE`).

Methods of the real device API that are ABSENT here (OBSERVED: zero occurrences of the identifier in `M:webapis/avplay`):
`setBufferingParam`, `setVideoStillMode`, `getVideoStillMode`, `getUID`, `setVideoRoi`, `setLooping`. Calling a missing method raises a
native `TypeError` ("is not a function"), not a `WebAPIException`.

#### Listener callback names

OBSERVED (`M:webapis/avplay` `setListener`, `M:webapis/avplayEventMap`). Keys are lower-cased only by the caller's spelling:
the code strips a leading `on` and then looks the remainder up **case-sensitively** in this map:

| Stripped key | DOM event actually listened to |
|---|---|
| `bufferingstart` | `loadstart` |
| `bufferingcomplete` | `loadeddata` |
| `bufferingprogress` | `progress`, which is then deliberately NOT registered (dropped) |
| `currentplaytime` | `timeupdate`; the callback receives `video.currentTime * 1000` (ms) |
| `streamcompleted` | `ended` |
| anything else | registered verbatim as a DOM event name |

Consequences (OBSERVED from the code, INFERRED as behaviour): the documented camelCase names `onbufferingstart`,
`onbufferingcomplete`, `oncurrentplaytime`, `onstreamcompleted` work. `onbufferingprogress` never fires. `onerror` becomes a DOM
`error` listener, so the callback receives a DOM `Event`, not an AVPlay error-name string such as
`PLAYER_ERROR_CONNECTION_FAILED`. `onevent`, `onsubtitlechange`, `ondrmevent` are registered as DOM events `event`,
`subtitlechange`, `drmevent`, which never fire. Callbacks other than `currentplaytime` receive the DOM event object as argument.

No `PLAYER_ERROR_*` name strings exist anywhere in the simulator (OBSERVED: no match in `ripple.js`).

#### Quirks worth knowing (OBSERVED)

- `setDrm` compares the state with `PAUSE` (undefined key), so it throws `InvalidStateError` unless the state is IDLE; several
  branches reference an undeclared `ErrorCode` identifier and would raise `ReferenceError` instead of a WebAPIException.
- `setStreamingProperty` references an undeclared identifier (`url`) and therefore raises `ReferenceError` for any valid name.
- `setListener` after `close()` (or before `open()`) is a silent no-op, because it is guarded by the element's existence.

### 4.3 `webapis.avplaystore`

OBSERVED (`M:webapis/AVPlayStore`): single method `getPlayer()` returning `undefined`. Multi-instance AVPlay is not simulated.

### 4.4 `webapis.productinfo`

OBSERVED (`M:webapis/ProductInfo`). All synchronous. Values marked "setting" come from the simulator's device settings
(key `Product.<name>`, defaults in doc 06 section 5); the fallback is used when the setting is null.

| Method | Returns (default) | Notes |
|---|---|---|
| `getVersion()` | `"1.0"` | |
| `getFirmware()` | setting `Product.Firmware`, default `"T-HKPAKUC-0000.0"` | |
| `getDuid()` | `"SDKHUWUR7SQ24"` | Hard-coded, not user-configurable. |
| `getModelCode()` | setting `Product.ModelCode`, default `"16_JAZZM_UHD"` | |
| `getModel()` | setting `Product.Model`, default `"UKS9000"` | |
| `getRealModel()` | `"UN65KS9000"` | Hard-coded. |
| `getSmartTVServerType()` | number, default `1` | Setting `Product.SmartTVServerType` mapped `"oprating"`→0, `"development"`→1, `"developing"`→2. |
| `getSmartTVServerVersion()` | setting, default `"T-INFOLINK2015-1000"` | |
| `getTunerEpop()` | setting, default `"dummy value"` | The settings default has a trailing space: `"dummy value "`. |
| `getLocalSet()` | setting `Product.LocalSet`, default `"US"` | |
| `getNoGlass3dSupport()` | `0` by default | `1` when the setting is null or `"ON"`, else `0`; settings default is `"OFF"`. |
| `isSoccerModeEnabled()` | `false` | |
| `isTtvSupported()` | `false` by default | `true` when setting `Product.TTV Support` is `"ON"`. |
| `isUdPanelSupported()` | `true` | |
| `is8KPanelSupported()` | `true` | |
| `isDisplayRotatorSupported()` | `true` | |
| `isUHDAModel()` | `false` by default | setting `Product.UHDAModel == "ON"`. |
| `isWallModel()` | `false` by default | setting `Product.WallModel == "ON"`. |
| `getPsid()` | setting `Product.PSID`, default `"dummy value"` | |
| `getLicensedBrand()` | `"Samsung"` | Setting key `Product.LicensedBrand` is read but has no UI/default. |
| `getLicensedVendor()` | `"Samsung"` | Same. |
| `getSystemConfig(key)` | `"dummyValue"` | `key` must be a value of `ProductInfoConfigKey`; a non-member number throws `InvalidValuesError`, a non-number throws `TypeMismatchError`. |
| `setSystemConfig(key, value, onSuccess, onError)` | `undefined` | Same key validation; `key == 1` (`CONFIG_KEY_SERVICE_COUNTRY`) throws `InvalidValuesError`; `value` must be a string and callbacks functions when present, else `onError(TypeMismatchError)` and throw. Calls `onSuccess("1")` for key 0, otherwise `onSuccess("dummy value")`, synchronously. |
| `addSystemConfigChangeListener(key, cb)` | `1` | Calls `cb(1)` immediately, synchronously, once. |
| `removeSystemConfigChangeListener(id)` | `undefined` | Non-number: `TypeMismatchError`; any id other than `1`: `InvalidValuesError`. |

Attributes (enums, OBSERVED):

- `ProductInfoNoGlass3dSupport`: `NO_GLASS_3D_NOT_SUPPORTED: 0`, `NO_GLASS_3D_SUPPORTED: 1`.
- `ProductInfoSiServerType`: `SI_TYPE_OPERATIING_SERVER: 0` (sic), `SI_TYPE_DEVELOPMENT_SERVER: 1`, `SI_TYPE_DEVELOPING_SERVER: 2`.
- `ProductInfoConfigKey` (0..57 in this order): `CONFIG_KEY_DATA_SERVICE`, `CONFIG_KEY_SERVICE_COUNTRY`, `CONFIG_KEY_SHOPLOGO`,
  `CONFIG_KEY_CHANNELBOUND_APPS_TICKER`, `CONFIG_KEY_SUPPORT_SOCCER_PANEL`, `CONFIG_KEY_SUPPORT_ONTV_PANEL`,
  `CONFIG_KEY_SUPPORT_NEWSON_PANEL`, `CONFIG_KEY_SUPPORT_MYCONTENTS_PANEL`, `CONFIG_KEY_SUPPORT_GAME_PANEL`,
  `CONFIG_KEY_SUPPORT_CLIPS_PANEL`, `CONFIG_KEY_SUPPORT_APPS_PANEL`, `CONFIG_KEY_SYSTEM_PNP_COUNTRY`, `CONFIG_KEY_PIN`,
  then `CONFIG_GPMURL_KEY_` + `ACRCT`(13), `AM`, `AQUA`, `APPS`, `CDS`, `CLIPS`, `EMP`, `EXPLORER3D`, `FITNESS`, `FKP`, `GAME`,
  `GEO`, `HA`, `HBBTV`, `IMS`, `KBO`, `KIDS`, `NOTICE`, `LC`, `MSVC`, `NCS`, `NEWSON`, `ONTV`, `PUSH`, `RM`, `SAPPHIRE`, `SAS`,
  `SCS`, `SEARCHALL`, `SHS`, `SOCCER`, `SSO`, `STS`, `TWITTERGW`(46), then `CONFIG_KEY_ACCESSIBILITY_TTS`(47),
  `CONFIG_KEY_MW_MSO_CONFIG`(48), `CONFIG_GPMURL_KEY_EXTRA`(49), `CONFIG_GPMURL_KEY_MUSIC`(50),
  `CONFIG_KEY_ACTIVE_CATEGORY`(51), `CONFIG_KEY_MUTE`(52), `CONFIG_KEY_OSD_NUMBERPAD`(53), `CONFIG_KEY_OSD_VIRTUALREMOTE`(54),
  `CONFIG_KEY_STATUS_NETFLIX`(55), `CONFIG_KEY_MULTIVIEW_INFO`(56), `CONFIG_KEY_MULTIVIEW_STATE`(57).

### 4.5 `webapis.network`

OBSERVED (`M:webapis/network`). All synchronous. Several getters read the **host machine's** real network interfaces through
Node `os.networkInterfaces()`: the first non-internal IPv4 entry of an interface whose name contains `en` (macOS), `eth` (Linux)
or `Local Area Connection` (Windows); `"NA"` when none is found.

| Method | Returns |
|---|---|
| `getVersion()` | `"1.0"` |
| `isConnectedToGateway()` | `navigator.onLine` (boolean) |
| `isConnectedToInternet()` | `true` |
| `getActiveConnectionType()` | `3` (ETHERNET) |
| `getIpMode()` | `2` (DYNAMIC) |
| `getIp()` | host IPv4 address or `"NA"` |
| `getSubnetMask()` | host netmask or `"NA"` |
| `getGateway()` | first three octets of the host IPv4 address + `.1` |
| `getMac()` | host MAC address or `"NA"` |
| `getEthernetMac()` | `"00:0B:2F:33:7B:4A"` |
| `getDns()` | `"10.0.2.3"` |
| `getSecondaryDns()` | `"0.0.0.0"` |
| `getProxyserverInfo()` | `"id,pwd,10.20.30.40,9998"` |
| `getWiFiSsid()` | `"Strawbarry"` (sic) |
| `getWiFiSignalStrengthLevel()` | `1` |
| `getWiFiSecurityMode()` | `6` (UNKNOWN) |
| `getWiFiEncryptionType()` | `6` (UNKNOWN) |
| `getTVName()` | `"dummyValue: getTVName"` |
| `getdata()` | `"dummyValue: getdata"` |
| `addNetworkStateChangeListener(cb)` | `1`; calls `cb(1)` once, synchronously (1 = `LAN_CABLE_ATTACHED`). Non-function: `TypeMismatchError`. No later events are ever delivered. |
| `removeNetworkStateChangeListener(id)` | `undefined`; non-number `TypeMismatchError`, id other than `1` `InvalidValuesError` |
| `addInternetCheckListener(cb)` / `removeInternetCheckListener(id)` | same contract as the pair above |
| `setDhcpOption60Field(str)` | stores the string in simulator persistence; non-string `TypeMismatchError` |
| `getCurrentDhcpOption60Field()` | stored string or `""` |
| `removeDhcpOption60Field()` | clears it |
| `checkCurrentIpWith60Field()` | `"udhcpc1.21.1"` |
| `setTVName(str)`, `setEAPCAfilePath(str)`, `setEAPPassphrase(str, x)` | validation only (first argument must be a string) |
| `setIpMode`, `setSubnetMask`, `setGateway`, `setDns`, `setIp`, `setProxyserverInfo` | no-ops |
| `enableSoftAP()`, `disableSoftAP()`, `setSoftAPChannel()`, `setSoftAPSignalStrength()`, `setSoftAPSecurityKeyAutoGeneration()` | `1` |
| `isSoftAPEnabled()` | `true` |
| `getSoftAPSSID()`, `getSoftAPSecurityKey()` | `"K3DYMEHP4CWNH"` |

Enums (attributes of `webapis.network`):

- `NetworkActiveConnectionType`: `DISCONNECTED: 0`, `WIFI: 1`, `CELLULAR: 2`, `ETHERNET: 3`.
- `NetworkIpMode`: `NONE: 0`, `STATIC: 1`, `DYNAMIC: 2`, `AUTO: 3`, `FIXED: 4`, `UNKNOWN: 5`.
- `NetworkWiFiSecurityMode`: `WEP: 1`, `WPA_PSK: 2`, `WPA2_PSK: 3`, `EAP: 4`, `NONE: 5`, `UNKNOWN: 6`.
- `NetworkWiFiEncryptionType`: `WEP: 1`, `TKIP: 2`, `AES: 3`, `TKIP_AES_MIXED: 4`, `NONE: 5`, `UNKNOWN: 6`.
- `NetworkState`: `INTERNET_CONNECTED: 0`, `LAN_CABLE_ATTACHED: 1`, `LAN_CABLE_DETACHED: 2`, `LAN_CABLE_STATE_UNKNOWN: 3`,
  `GATEWAY_CONNECTED: 4`, `GATEWAY_DISCONNECTED: 5`, `WIFI_MODULE_STATE_ATTACHED: 6`, `WIFI_MODULE_STATE_DETACHED: 7`,
  `WIFI_MODULE_STATE_UNKNOWN: 8`, `INTERNET_DISCONNECTED: 9`.

There is no simulator switch that makes `webapis.network` report a disconnected network; only the host going offline changes
`isConnectedToGateway()` (INFERRED from the absence of any writer for these values).

### 4.6 `webapis.appcommon`

OBSERVED (`M:webapis/AppCommon`).

| Method | Returns | Behaviour |
|---|---|---|
| `getVersion()` | `"2.2.0"` | |
| `getUuid()` | `"K3DYMEHP4CWNH"` | |
| `getForegroundAppId()` | `"bixbycapsuleviewer"` | |
| `setScreenSaver(state, onSuccess, onError)` | `undefined` | `state` must be 0 or 1 (non-member number: `InvalidValuesError`, other type: `TypeMismatchError`). **Both callbacks are mandatory functions** (else `TypeMismatchError`). Calls `onSuccess()` synchronously with no argument. |
| `getSpecialSupportedKeys()` | array of frozen `{ name, code }` | One entry per row of the special-key table (doc 06 section 3.5.3). Does not include arrows/Enter/Back. |
| `registerKey(names)` | boolean | `names` must be an array, every entry a key of the special-key table or one of `ArrowLeft/ArrowUp/ArrowRight/ArrowDown/Enter/Back`. Returns `true` on success and `false` on any validation failure (errors are swallowed, never thrown). No effect on key delivery. |
| `unregisterKey(names)` | boolean | Same contract. |
| `generateKey(name)` | boolean | `name` must be a key of the generate-key table; `true`/`false`, no key event is actually synthesised. |
| `setEpopAppWindow(n)` | boolean | `false` when `n` is null/undefined or a truthy non-number; otherwise `true`. |
| `setIMERecommendedWords(arr)` | boolean | Array of strings. |
| `setIMERecommendedWordsType(n)` | boolean | Always `false`: the guard as written (`n != 0 \|\| n != 1`) rejects every value. OBSERVED quirk. |
| `setIMEPosition(a, b, c)` | `undefined` | No-op. |
| `requestTvContextTask(target, action)` | boolean | Both must be `0`. |

Enums: `AppCommonScreenSaverState { SCREEN_SAVER_OFF: 0, SCREEN_SAVER_ON: 1 }`, `AppcommonTarget { CONFIG_LAST_SOURCE: 0 }`,
`AppcommonAction { CONFIG_LAUNCH: 0 }`, `AppCommonRecommendedWordsType { RECOMMENDED_WORDS_DISABLE: 0, RECOMMENDED_WORDS_ENABLE: 1 }`,
`AppCommonGenerateKeyName` (identity map of: `VolumeUp`, `VolumeDown`, `VolumeMute`, `ChannelUp`, `ChannelDown`, `ArrowLeft`,
`ArrowUp`, `ArrowRight`, `ArrowDown`, `Enter`, `Back`, `GamepadHomekey`, `MediaTrackPrevious`, `MediaRewind`, `MediaTrackNext`,
`MediaFastForward`, `Search`, `Exit`, `Source`, `MultiView`, `SmartHub`, `ARKVolume`, `PlayBackGame`, `More`).

### 4.7 `webapis.tvinfo`

OBSERVED (`M:webapis/TVInfo`).

| Method | Returns | Behaviour |
|---|---|---|
| `getVersion()` | `"1.0"` | |
| `getMenuValue(key)` | see note | `key` must be a value of `TvInfoMenuKey` and not `14`; otherwise `InvalidValuesError` (number) or `TypeMismatchError`. For keys 18 and 19 returns `"AFR"`. For string-valued keys (`"UI_SIZE"` etc.) returns `"err"`. For keys 0..13, 15..17 it returns `TvInfoMenuKey[key]`, i.e. indexes the enum **by its numeric value**, which is `undefined` unless `setMenuValue` stored something under that number. |
| `setMenuValue(key, value, onSuccess, onError)` | `undefined` | Both numbers, callbacks functions when present (`TypeMismatchError`). Stores `TvInfoMenuKey[key] = value` (mutating the enum object) and calls `onSuccess()` synchronously. |
| `addCaptionChangeListener(key, cb)` | `1` on success, `0` on any validation failure (swallowed) | Never calls `cb`. |
| `removeCaptionChangeListener(key)` | `undefined` | Key validation as `getMenuValue`. |
| `isTvsPicSizeResized()` | `true` | |
| `showCaption(bool)`, `registerInAppCaptionControl(bool)` | `undefined` | Non-boolean: `TypeMismatchError`. |
| `getTvInfoValue(key)` | `0` (`1` if `key` is not a number) | |
| `addTvInfoChangeListener(key, cb)` | `0` (`1` on validation failure) | |
| `removeTvInfoChangeListener(key)` | `undefined` | Non-number: `TypeMismatchError`. |

Enums:

- `TvInfoKey`: `TV_VIEWER_BG_EXECUTABLE: 0`, `SMART_RC_BATTERY: "SMART_RC_BATTERY"`, `BOARD_TEMPERATURE: "BOARD_TEMPERATURE"`.
- `TvInfoValue`: `TV_VIEWER_BG_NOT_EXECUTABLE: 0`, `TV_VIEWER_BG_EXECUTABLE: 1`.
- `TvInfoMenuKey`: `CAPTION_ONOFF_KEY: 0`, `CAPTION_MODE_KEY: 1`, `CAPTION_FONT_SIZE_KEY: 2`, `CAPTION_FONT_STYLE_KEY: 3`,
  `CAPTION_FG_COLOR_KEY: 4`, `CAPTION_FG_OPACITY_KEY: 5`, `CAPTION_BG_COLOR_KEY: 6`, `CAPTION_BG_OPACITY_KEY: 7`,
  `CAPTION_EDGE_TYPE_KEY: 8`, `CAPTION_EDGE_COLOR_KEY: 9`, `CAPTION_WINDOW_COLOR_KEY: 10`, `CAPTION_WINDOW_OPACITY_KEY: 11`,
  `ACCESSIBILITY_FORCUS_ZOOM: 12` (sic), `ACCESSIBILITY_HIGH_CONTRAST: 13`, `SMARTHUB_CHANNEL_BOUND_APPS_TICKER: 14`,
  `VOICE_GUIDE_KEY: 15`, `SUBTITLE_ONOFF_KEY: 16`, `SUBTITLE_MODE_KEY: 17`, `PRIMARY_AUDIO_LANGUAGE_KEY: 18`,
  `SECONDARY_AUDIO_LANGUAGE_KEY: 19`, `ACCESSIBILITY_VOICE_GUIDE_SPEED: 20`, `CAPTION_STYLE_KEY: 21`,
  `CAPTION_LANGUAGE_KEY: 22`, `UI_SIZE: "UI_SIZE"`, `UI_TRANSPARENCY: "UI_TRANSPARENCY"`, `UI_TIMEOUT: "UI_TIMEOUT"`,
  `MOVING_TEXT_AND_IMAGE: "MOVING_TEXT_AND_IMAGE"`.
- `TvInfoMenuValue`: `OFF: 0`, `ON: 1`, `CAPTION_OFF: 0`, `CAPTION_ON: 1`; `CAPTION_MODE_DEFAULT: 0`,
  `CAPTION_MODE_SERVICE1..6: 1..6`, `CAPTION_MODE_CC1..4: 7..10`, `CAPTION_MODE_TEXT1..4: 11..14`; `CAPTION_SIZE_DEFAULT: 0`,
  `_SMALL: 1`, `_STANDARD: 2`, `_LARGE: 3`, `_EXTRA_LARGE: 4`, `_EXTRA_SMALL: 5`; `CAPTION_FONT_DEFAULT: 0`,
  `CAPTION_FONT_STYLE0..7: 1..8`; `CAPTION_COLOR_DEFAULT: 0`, `_WHITE: 1`, `_BLACK: 2`, `_RED: 3`, `_GREEN: 4`, `_BLUE: 5`,
  `_YELLOW: 6`, `_MAGENTA: 7`, `_CYAN: 8`; `CAPTION_OPACITY_SOLID: 0`, `_FLASH: 1`, `_TRANSLUCENT: 2`, `_TRANSPARENT: 3`,
  `_DEFAULT: 4`, `_HIGHLY_TRANSLUCENT: 5`, `_SLIGHTLY_TRANSLUCENT: 6`; `CAPTION_EDGE_NONE: 0`, `_RAISED: 1`, `_DEPRESSED: 2`,
  `_UNIFORM: 3`, `_DROP_SHADOWED: 4`; `SUBTITLE_NORMAL: 0`, `SUBTITLE_HEARING_IMMPEARED: 1` (sic); `CAPTION_STYLE_DEFAULT: 0`,
  `_BOLD: 1`, `_ITALIC: 2`; `VOICEGUIDE_SPEED_VERY_FAST: "VERY_FAST"`, `_FAST: "FAST"`, `_NORMAL: "NORMAL"`, `_SLOW: "SLOW"`,
  `_VERY_SLOW: "VERY_SLOW"`; `UI_TIMEOUT_DEFAULT: 0`, `_1MINUTE: 1`, `_2MINUTES: 2`, `_5MINUTES: 5`, `_10MINUTES: 10`; and
  `AUDIO_LANGUAGE_CODE_<XXX>: "<XXX>"` for the 3-letter codes AFR AKA AMH ARA ASM BEN BUL CAT CHI CMN CZE DAG DAN DUT ENG EST
  EUS EWE FIN FRE GAA GER GLA GLG GOS GRE GUJ HAU HEB HIN HRV HUN IGB IND IRI ITA JPN KAN KOK KOR LAV LIT MAL MAO MAR MSA NBL
  NOR NSO NZI ORI PAN PER POL POR QAA QAB QAC ROM RUS SLK SOT SPA SRP SSW SWA SWE TAM TEL THA TSN TSO TUR TWI UKR VAL VEN VIE
  WEL XHO XSM YOR YUE ZHO ZUL.

### 4.8 `webapis.avinfo`

OBSERVED (`M:webapis/AvInfo`). Setters validate the argument type inside a try/catch and return `true`/`false` instead of
throwing, except the last three.

| Method | Returns |
|---|---|
| `getVersion()` | `"1.0"` |
| `getDolbyDigitalCompMode()` | **throws** `NotSupportedError` |
| `isHdrTvSupport()` | **throws** `NotSupportedError` |
| `getSpeakerSelection()` | `0` |
| `setSpeakerSelection(n)` | `true` for a number 0..7, else `false` |
| `setWideScreenMode(a, b)` | `true` when both non-null |
| `getBrightness()` | `true` (sic, boolean) |
| `getContrast()`, `getColorStrength()`, `getColorTint()`, `getWhiteBalance()`, `getSharpness()`, `getBacklight()`, `getHdmiHdcpType()` | `0` |
| `setBrightness(n,…)`, `setContrast(n)`, `setColorStrength(n)`, `setColorTint(n)`, `setSharpness(n)`, `setBacklight(n)` | `true` for a number, else `false` |
| `setWhiteBalance(a,b,c,d,e,f)` | `true` when all six are numbers |
| `getColorSpaceCustomRGB(str)`, `setColorEffect(str)`, `setSubAmpMode(str)` | `true` for a string |
| `setColorSpaceCustomRGB(str, n, n, n)` | `true` when types match |
| `resetPictureSettings()`, `unsetHdmiActivateChangeListener()` | `true` |
| `setHdmiActivateChangeListener(cb)` | `true` for a function (never invoked) |
| `getHdmiHighestResolution()` | `"hdmi"` |
| `setAiScalerValue(x)` | `true` when non-null |
| `getEnergySaving()` | `"LOW"` |
| `setEnergySaving(x)`, `setEcoSensor(x)`, `set8kUpscalingDemo(x)` | `undefined`; throw `TypeMismatchError` when the argument is null/undefined |

Constants: `SCREEN_MODE_WIDESCREEN: 0`, `SCREEN_MODE_SUPERWIDESCREEN: 1`, `SCREEN_MODE_PANORAMA: 2`;
`AvInfoDigitalCompMode { DOLBY_DIGITAL_COMP_MODE_LINE: 0, DOLBY_DIGITAL_COMP_MODE_RF: 1 }`;
`AvInfoSoundOutputMode`: `SOUND_TV_OUTPUT_SPEAKER: 0`, `_EXTERNAL_SPEAKER: 1`, `_RECEIVER: 2`, `_SOUND_SHARE: 3`,
`_MULTIROOM_LINK: 4`, `_BT_HEADSET: 5`, `_DUAL_BT_SPK: 6`, `_MAX: 7`, `_DUAL_RECEIVER_SPK: 8`, `_DUAL_EXTERNAL_SPK: 9`,
`_DUAL_MULTIROOM_SPK: 10`.

### 4.9 `webapis.sso`

OBSERVED (`M:webapis/sso`). `getVersion()` returns `"3.4"`. Every other method is an empty body returning `undefined` and never
invokes a callback: `getSsoState()`, `getGuid()`, `getLoginStatus()`, `getLoginUid()`, `showAccountView(a,b,c)`,
`showAccountViewWithTransparent(a,b,c)`, `getOspAccessToken(a,b,c,d)`, `showCreateAccountView(a,b)`, `showTermsPage(a,b,c,d)`,
`getTermsAgreementState(a)`, `getPartnerAccountMappingList(a,b,c,d)`, `addPartnerAccountMappingInfo(a,b,c,d,e)`,
`removePartnerAccountMappingInfo(a,b,c,d,e)`, `requestAuthCodeForEffortlessLogin(a,b,c,d)`, `requestUserJsonInfo()`,
`subscribeLoginState(cb)`, `unsubscribeLoginState()`.
Enums: `SsoLoginState { SSO_NOT_LOGIN: 0, SSO_LOGIN: 1 }`, `SsoTermsAgreementState { SSO_NOT_AGREE: 0, SSO_AGREE: 1 }`.

### 4.10 `webapis.billing`

OBSERVED (`M:webapis/billing`). `getVersion()` returns `"1.0"`. Every other method is an empty body (no callback is ever
invoked): `applyInvoice` (7 args), `verifyInvoice` (7), `isServiceAvailable` (3), `getServiceCountryAvailability` (6),
`getUserPurchaseList` (8), `getProductsList` (8), `cancelSubscription` (7), `showRegisterPromotionalCode` (3),
`showPaymentInfo` (0), `showRegisterCreditCard` (2), `showPurchaseHistory` (4), `buyItem` (5).
A UI plugin `M:ui/plugins/billing` exists in the bundle (a mock payment dialog); it is not reachable from these stubs
(INFERRED: `buyItem` has an empty body and triggers no event).

### 4.11 `webapis.adinfo`

OBSERVED (`M:webapis/adinfo`): `getVersion()` → `"1.0"`, `getTIFA()` → `"TIFA Information"`, `isLATEnabled()` → `true`.

### 4.12 `webapis.systemcontrol`

OBSERVED (`M:webapis/systemcontrol`). No validation anywhere.

| Method | Returns |
|---|---|
| `getVersion()` | `"1.0"` |
| `getSerialNumber()`, `getFirmwareVersion()` | `"1234567890"` |
| `getScreenLampSchedule()` | `{ use: "ON", firstTime: "08:55", level1: 30, secondTime: "16:50", level2: 80 }` |
| `getPanelMute()`, `getSafetyLock()`, `getMessageDisplay()`, `getIRLock()`, `getButtonLock()`, `getAutoPowerOn()` | `"ON"` |
| `getOnScreenMenuOrientation()`, `getSourceOrientation()` | `"LANDSCAPE"` |
| `getPCConnection()` | `"RJ45"` |
| `getCustomAppInfo()` | `{ downloadServerAddress: "http://testserver/testwebapp/check", connectionTimeout: "30SEC" }` |
| `getMagicinfoServerInfo()` | `{ ssl: "http", address: "100.43.33.55", port: "8080" }` |
| `isCustomAppDownloaded()` | `true` |
| `captureScreen`, `rebootDevice`, `updateFirmware`, `setUpdateFirmwareListener`, `unsetUpdateFirmwareListener`, `setScreenLampSchedule`, `setPanelMute`, `setSafetyLock`, `setPCConnection`, `setMessageDisplay`, `deleteAppPrivateInfo`, `setCustomAppInfo`, `setIRLock`, `setButtonLock`, `setAutoPowerOn`, `setMagicinfoServerInfo`, `setCustomAppDownloadListener`, `unsetCustomAppDownloadListener`, `startNodeServer`, `stopNodeServer` | `undefined` (no-ops) |

### 4.13 `webapis.SystemInfo`

OBSERVED (`M:webapis/SystemInfo`). Exposed under the key `SystemInfo`, not `systeminfo`.

- `isSupportedAudioCodec(name)`: `true` when `name` is found (as a regular-expression search) inside the string
  `"MPEG MPEG-H AC3 E-AC3 AC4 TrueHD Vorbis G2Cook AAC HE-AAC WMA ADPCM OPUS PCM"`; `false` for non-strings.
- `isSupportedVideoCodec(name)`: same against
  `"MPEG1 MPEG2 MPEG4 H263 H264 HEVC VP8 VP9 RV WMV AVS AVS_PLUS MJPEG JPEG H264_MVC HEIC AVS2 EVC_VR360 H264_VR360 VP9_VR360 HEVC_SHVC AV1 AV1_VR360"`.

### 4.14 `webapis.widgetdata`

OBSERVED (`M:webapis/widgetdata`). Stores Blowfish-encrypted hex strings in the simulator's own persistence under the key
`"widgetdata" + <name>`.

- `writeWidgetData(password, data, n, name, onSuccess, onError)`: types string, string, number, string; mismatch →
  `onError(TypeMismatchError)` when `onError` is supplied, else throws. Calls `onSuccess(<hex ciphertext>)`.
- `readWidgetData(password, n, name, onSuccess, onError)`: types string, number, string, function. Calls
  `onSuccess(<plaintext>)`.
- `removeWidgetData(name, onSuccess, onError)`: calls `onSuccess(<stored value>)` only if something was stored.
- `getVersion()` → `"1.0"`.
- `read(onSuccess, onError)`, `write(data, onSuccess, onError)`, `remove(onSuccess, onError)`: fixed slot `"widgetdata0"`;
  `read`/`write` reference an undeclared `password` identifier and therefore raise `ReferenceError` (OBSERVED quirk).

### 4.15 `webapis.drminfo`

OBSERVED (`M:webapis/drminfo`): `getVersion()` → `"dummy value: 1.0"`; `getSupportedKeySystems()` → `"dummy value"`
(more than 2 args: `InvalidValuesError`); `isKeySystemSupported()` → `"dummy value"` (more than 1 arg: `InvalidValuesError`);
`getEsn()` → `"dummy value: Netflix ESN"`; `getSdiId()` → `"dummy value: SDI ID"`; `nvInvoke(...)` → `"dummy value"`
(`"dummy"` on validation failure); `SecureStorage()` → object with `writeData()` → `0`, `readData()` → `"OK"`,
`deleteData()` → `0`.

### 4.16 `webapis.logging`

OBSERVED (`M:webapis/logging`): `getVersion()` → `"dummy value: plugin version"`; `isAgreedWith()` → `0`;
`setServiceConfigInfo` (8 args), `addEventConfigInfo` (7), `setEventHeader` (7), `addEventFullLog` (4), `addEventLog` (7),
`flushLog` (2): type-check leading arguments (string/number as appropriate; mismatch → `onError(TypeMismatchError)` if supplied
else throw), then call `onSuccess("dummy onSuccess")` synchronously. The last two parameters are always `onSuccess`, `onError`.

### 4.17 `webapis.preview`

OBSERVED (`M:webapis/preview`): `getVersion()` → `"1.0"`; `setPreviewData(jsonString, onSuccess, onError)` → validates
(string, optional functions; mismatch → `onError(TypeMismatchError)` or throw) then `onSuccess("dummy value")`;
`setActionDataEventListener(cb)` → `1` and calls `cb("dummy value")` immediately (returns `0` when `cb` is not a function);
`unActionDataEventListener()` no-op.

### 4.18 B2B / signage / hospitality namespaces (low priority)

OBSERVED via signature extraction of the named modules; all are mocks with hard-coded values.

| Namespace | Members |
|---|---|
| `webapis.timer` | `getVersion()` `"1.0"`; `getCurrentTime()` `{year:2022,month:12,day:15,hour:8,minute:55,second:43}`; `getOnTimer(id)` `{timerID:"TIMER1",time:"19:50",setup:"TIMER_ONCE",volume:10}`; `getOffTimer(id)` `{timerID:"TIMER1",time:"19:50",setup:"TIMER_ONCE"}`; `getTimerHoliday(id)` `"ON"`; `getNTP()` `{use:"ON",address:"10.89.10.13",timezone:"Asia/Seoul"}`; `getDST()` object with `mode:"ON"`, `start`, `end`; `getSystemTimeSyncTimeout()` `"30SEC"`; no-op setters `setCurrentTime`, `setOnTimer`, `setOffTimer`, `addHoliday`, `deleteHoliday`, `applyTimerHoliday`, `setNTP`, `setDST`, `setSystemTimeSyncTimeout`. |
| `webapis.remotepower` | `getVersion()` `"1.0"`; `getPowerState()` `"NORMAL"`; `getVirtualStandbyMode()` `"ACTIVATION"`; `getVirtualStandbyRebootTime()` `"5MIN"`; no-ops `powerOn`, `powerOff`, `setVirtualStandbyMode`, `setVirtualStandbyRebootTime`. |
| `webapis.document` | `getVersion()` `"1.0"`; no-ops `open`, `close`, `play`, `stop`, `prevPage`, `nextPage`, `pause`, `resume`, `setDocumentOrientation`, `gotoPage`. |
| `webapis.broadcast` | `getVersion()` `"1.0"`; `getTotalAudioInfo()` array of `{index, language:"pol", type}`; `getCurrentAudioInfo()` `{index:1,language:"pol",type:"VISUAL_IMPAIRED"}`; `getTotalSubtitleInfo()`; `getCurrentSubtitle()` `{index:1,language:"pol",type:"HEARING_IMPAIRED"}`; no-ops `enableDataService`, `disableDataService`, `setCurrentAudio`, `setCurrentSubtitleIndex`, `setHotelDrmForensicData`, `tuneDirect`, `clearRating`. |
| `webapis.syncplay` | `getVersion()` `"1.0"`; no-ops `createPlayList`, `start`, `stop`, `removePlaylist`. |
| `webapis.displayrotator` | `getVersion()` `"1.0"`; `isSupported()` `false`; `getStatus()` `"NOT_READY"`; `getOrientation()` `"INVALID"`; no-ops `setOrientation`, `setListener`, `unsetListener`. |
| `webapis.featureconfig` | `getFeatureConfigLong(k)` `""`; `getFeatureConfigBool(k)` `false`; `getFeatureConfigString(k)` `""`. |
| `webapis.hybridchannelinfo` | Empty object (no members). |
| `webapis.clone` | `getVersion()` `"dummy value: plugin version"`; no-ops `restoreCloneData`, `setCloneUpdateStatusListener`, `unSetCloneUpdateStatusListener`. |
| `webapis.systemdebug` | `getVersion()` `"1.0"`; `startDebugLogs(a, ok, err)`, `stopDebugLogs(ok, err)` validate callbacks. |
| `webapis.microphone` | `isSupported()` `true`; `getMicrophones(ok, err)`; `addMicrophoneConnectListener(cb)`; `removeMicrophoneConnectListener(id)`; `isConnected(str)` boolean; plus internal helpers. |
| `webapis.allshare` | Empty object with child `serviceconnector`: `getServiceProvider()`, `getDeviceFinder()`, `createServiceProvider(ok, err)` (calls `ok(null)`), `deleteServiceProvider(ok, err)`; the device finder returns `null`/stub objects. |
| `webapis.objectdetection` | `getVersion()` `"1.0"`; `create()` → `"objectdetection_handle_" + Date.now()`; `init(handle, type)`; `run`, `runWithBuffer` return mock detections; `deinit`, `destroy`; `ObjectDetectionType { FACE, BODY }`. |
| `webapis.poseestimation` | `getVersion()` `"1.0"`; `create()` → `"poseestimation_handle_" + Date.now()`; `init`, `run`, `runWithBuffer`, `deinit`, `destroy`; `KeyPonitId` enum (sic). |
| `webapis.voiceInteraction` | `getVersion()` `"1.0"`; `setCallback(obj)` (object required else `TypeMismatchError`); `listen()`; `getDataFromSearchTerm(term, field)`; `buildCollectionDeeplinkData`, `buildCollectionShowData`, `buildVoiceInteractionContentContextItem`, `buildVoiceInteractionContentContextResponse` (JSON string builders); enums `VoiceApplicationState`, `VoiceNavigation`. Callbacks are never invoked by the simulator. |

### 4.19 `window.b2bapis`

OBSERVED (`M:webapis/b2bapis`, `M:spec` `objects.b2bapis`): a separate global `b2bapis` whose members
(`b2bcontrol`-style getters/setters such as `getSerialNumber`, `rebootDevice`, `setPowerOff`, `getMACAddress`,
`captureScreen`, document and sync-play helpers) are all empty zero-argument functions returning `undefined`.

### 4.20 Not wired: `webapis/prdinfo`

OBSERVED: a module `M:webapis/prdinfo` defines callback-style `getFirmware(cb)`, `getDUID(cb)`, `getModel(cb)`,
`getModelCode(cb)` delivering `{ param, errorCode: -1 }` with params `"T-WSIMUSDK-0624"`, `"7WEBZSDKQSIMU"`, `"15_SDKWSI"`,
`"WSIMU624_SDK"`, and `activateWithData()` → `true`. It is not referenced from the platform object tree, so apps cannot reach
it. Recorded only because the values are alternative simulator identity strings.

## 5. Guidance for the clean-room `tizen-api` package (INFERRED)

What the simulator is good evidence for:

1. **Object shape**: namespaces as getter-only properties; property-bag results as objects of read-only getters; `{ name, code }`
   key entries; string return codes of AVPlay (section 4.2).
2. **Timing**: async callbacks on a 1 ms timer, never synchronously (except the listed quirks).
3. **Validation order**: type check first (throws `TypeMismatchError` synchronously), then state / value checks
   (`InvalidStateError`, `InvalidValuesError`, `NotFoundError`), then privilege (`SecurityError`) for the few gated methods.
4. **Mock values**: product, network, tvinfo and avinfo defaults (sections 4.4 to 4.8) are Samsung's own choice of plausible
   fake identity and are the natural `DeviceProfile` defaults.

What it is poor evidence for (take from public Tizen TV documentation and from real-device measurement instead):

- Privilege enforcement for TV and Samsung product APIs (absent here).
- Key registration semantics (absent: every key is always delivered).
- `tizen.systeminfo` TV properties and capability keys (mobile leftovers).
- Application lifecycle (`exit` vs `hide`, visibility, deep links).
- Names of the modern TV managers (`tizen.tvwindow`, `tizen.tvdisplaycontrol`).

## 6. UNKNOWNS

1. **No runtime observation.** Everything above is static. Claims tagged INFERRED about what "would happen" (ReferenceError
   paths, the failed `$WEBAPIS` script load, missing Node modules) were not confirmed by running the app.
2. **REA call graph incomplete.** The REA JavaScript analysis timed out (300 s provider deadline) on `ripple.js`; only the small
   side files were parsed. The surface was recovered by splitting the bundle into its 284 AMD modules and reading them. Dead
   code versus reachable code inside a module was judged by reading, not by a call graph.
3. **Names for error codes 2 to 16** were not transcribed one by one (section 1.1).
4. **Exact per-method schemas** of the mobile-inherited namespaces (calendar, content, notification, push, archive, download)
   were only skimmed; they are listed for completeness, not to implementation depth.
5. **Real-device divergence is unmeasured here.** Every "real devices do X" remark is INFERRED from public documentation and
   must be checked against a physical TV or the Tizen TV emulator image before being relied on.
6. **`webapis` B2B / signage namespaces** (section 4.18) were catalogued by name and arity only.
7. **Whether `XMLHttpRequest` / `Date` overrides change app-visible behaviour** (the frame gets wrapped versions) was not
   analysed in depth.
