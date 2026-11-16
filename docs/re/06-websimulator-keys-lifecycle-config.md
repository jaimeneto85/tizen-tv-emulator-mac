# 06 - Samsung TV Simulator: config.xml, privileges, keys, lifecycle, settings, media, runtime

Behavioural spec recovered by **static** reverse-engineering of the Samsung "TV Simulator" (`sec-tv-simulator.version` =
"Version:10.0.6"). The application was never executed. Clean-room: behaviour, names, constants and defaults only.

Companion document: `05-websimulator-api-surface.md` (the `tizen.*` / `webapis.*` surface).

## 1. Conventions

- **OBSERVED** = read directly in the shipped files, with a citation. **INFERRED** = conclusion drawn from observed facts,
  never verified by running.
- `<sim>` = `_samsung-tv-sdk-ref/x/websimulator/data/tools/sec-tv-simulator`; `app.nw/` =
  `<sim>/nwjs.app/Contents/Resources/app.nw/`.
- `M:<name>` = AMD module `ripple/platform/tizentv/2.0/<name>` inside the single-line minified `app.nw/ripple.js`;
  `R:<name>` = AMD module `ripple/<name>` in the same file. Line numbers do not exist in that file; locate a module with
  `grep -o 'define("ripple/<id>"' ripple.js`.
- Section numbers 2 to 7 match the question numbers of the brief and are referenced from doc 05.

## 2. config.xml handling and privilege gating

### 2.1 Two independent parsers (OBSERVED)

| When | Where | What is read |
|---|---|---|
| Install time (`.wgt` or folder with an `.html`) | `app.nw/child.js` (forked Node process, uses `adm-zip` + `xml2js`) | `widget/tizen:application@id`, `@package`, `widget/name`; scans the tree for a `.nexe` file (NaCl flag). |
| Launcher listing | `M:appList` (`xml2js`) | `widget.name`, `content@src`, `icon@src` of every `<cwd>/appLauncher/app/<package>/config.xml`. |
| Every app document load | `R:widgetConfig` + `M:spec/config` (synchronous XHR of `<app dir>/config.xml`, schema validation) | Full schema below; result stored through `R:app.saveInfo`. Skipped for the simulator's own `FirstScreen` and `appLauncher` pages. |

### 2.2 Install flow (OBSERVED `app.nw/child.js`, `R:worker`, `R:system_event`)

1. Input is a `.wgt` path or an `.html` path (drag and drop, install window, `--file=` CLI argument, or the HTTP API of
   section 4.6). Anything else: error "Please use wgt or html file".
2. `.wgt`: unzipped to `<cwd>/appLauncher/tmp/<wgt basename>/` just to read `config.xml`, then that temp folder is removed.
   `.html`: `config.xml` is expected next to the html file. Missing file: "File ... does not exist."
3. Validation: `tizen:application@id` and `@package` must both be non-empty, otherwise the (misleading) error "Please don't
   change name of package." An already-installed package with the same package id **and** the same `<name>` is replaced; same
   package id with a different name is refused with the same message.
4. Destination: `<cwd>/appLauncher/app/<package>/` (wgt: unzip; html: recursive copy of the html file's folder).
5. After a wgt install the launcher page is reloaded. After an html install the app is opened immediately:
   `file://<dest>/<html name>`, or `http://localhost:<port from naclport.txt>/<package>/index.html` when a `.nexe` was found.

No signature check (`author-signature.xml` / `signature1.xml` are ignored), no certificate handling, no `required_version`
check against a platform version at install time.

### 2.3 Runtime schema (OBSERVED `M:spec/config`)

| Element | Attributes recognised | Notes |
|---|---|---|
| `widget` | `xmlns` (required, must be `http://www.w3.org/ns/widgets`), `xmlns:tizen`, `id`, `version`, `height`, `width`, `viewmodes` (`windowed`, `floating`, `fullscreen`, `maximized`, `minimized`), `defaultlocale` | Only `xmlns` validity is enforced (warning otherwise). `width` / `height` are parsed, not applied. |
| `name`, `description`, `author`, `license` | text | `name` feeds `ApplicationInformation.name`. |
| `icon` | `src` (required) | Feeds `iconPath`. |
| `content` | `src` (required), `encoding`, `type` | Start page. The HTTP API falls back to `index.html` when absent. |
| `tizen:application` | `id` (required), `required_version` (required; accepted list is only `"1.0"`, `"2.0"`, `"2.1"`, `"2.2"`), `package` | Any modern `required_version` (for example `"6.0"`) fails schema validation, which only produces a validation message (INFERRED: non-fatal). |
| `tizen:setting` | `screen-orientation` (`portrait`, `landscape`, `auto`; default `landscape`), `context-menu` (default `enable`), `background-support` (default `disable`), `encryption` (default `disable`), `install-location` (default `auto`), `hwkey-event` (default `enable`) | Stored. One consumer found: the rotate shortcut (`Ctrl+Shift+R`) inside an app is honoured only when the stored screen setting equals `auto-rotation`, otherwise a "cannot change orientation" popup is shown (`R:ui/custom/UserInteraction/keyShortcuts`, `M:spec/config.getScreen_setting`). No effect found for the other attributes. |
| `access` | `origin`, `subdomains` | Validated only. **Not enforced**: Chromium is started with `--disable-web-security`. |
| `tizen:privilege` | `name` | Only names in the whitelist below are kept. |
| `preference` | `name`, `value`, `readonly` | Saved into the simulator persistence under the platform prefix. No `tizen.preference` API exists to read them back (doc 05 section 2.2). |
| `tizen:content`, `tizen:app-control` (`tizen:src`, `tizen:operation`, `tizen:uri`, `tizen:mime`), `tizen:app-widget`, `tizen:account` | - | Parsed for validation; app-control entries feed `launchAppControl` matching. |

Not handled at all (OBSERVED by absence): `feature`, `tizen:metadata`, `tizen:profile`, `tizen:content-security-policy`
(no CSP is applied), `tizen:allow-navigation`, `tizen:background-category`.

Privilege whitelist (45 names; anything else is silently dropped):

- W3C: `http://www.w3.org/TR/battery-status/`, `.../geolocation-API/`, `.../touch-events/`, `.../vibration/`.
- `http://tizen.org/privilege/` + : `tizen`, `alarm`, `application.launch`, `application.info`, `appmanager.kill`,
  `appmanager.certificate`, `bluetoothmanager`, `bluetooth.admin`, `bluetooth.gap`, `bluetooth.spp`, `bookmark.read`,
  `bookmark.write`, `calendar.read`, `calendar.write`, `callhistory.read`, `callhistory.write`, `contact.read`,
  `contact.write`, `content.read`, `content.write`, `datacontrol.consumer`, `datasync`, `download`, `filesystem.read`,
  `filesystem.write`, `messaging.read`, `messaging.write`, `networkbearerselection`, `nfc.common`, `nfc.admin`, `nfc.tag`,
  `nfc.p2p`, `notification`, `packagemanager.install`, `package.info`, `power`, `push`, `setting`, `system`,
  `systemmanager`, `time`.

TV privileges are **absent from the whitelist**: `http://tizen.org/privilege/tv.inputdevice`, `tv.audio`, `tv.window`,
`tv.channel`, `tv.display`, `http://developer.samsung.com/privilege/productinfo`, `.../avplay`, `.../network.public`,
`.../drmplay`, and so on. Declaring them has no effect and omitting them has no effect.

### 2.4 Gating (summary; full table in doc 05 section 2.3)

Only a handful of mobile-era `tizen.*` methods throw `SecurityError` when their privilege is missing (application launch /
kill / certs / metadata, alarm, filesystem, package, systeminfo SIM, systemsetting, download, notification, push). Nothing in
`tizen.tv*` or `webapis.*` is gated.

## 3. Remote key handling

### 3.1 Pipeline (OBSERVED)

```
remote button (mouse) / host keyboard / HTTP API / protobuf automation
        -> basicRemoteService.sendKeyDownEventRequest(buttonId, once)      R:ui/custom/UserInteraction/basicRemoteService
        -> keyMap lookup buttonId -> key constant                           R:ui/custom/UserInteraction/keyMap
        -> remoteControlBridge.handleKeyDownEvent(code, once)               R:ui/custom/UserInteraction/remoteControlBridge
        -> internal event "sendKeyDownEvent" / "sendKeyUpEvent"
        -> uiEventDispatcher builds and dispatches the DOM event            R:ui/custom/uiEventDispatcher
```

### 3.2 Event object delivered to the app (OBSERVED `R:ui/custom/uiEventDispatcher`)

- Created as a **generic** event (`document.createEvent("Events")`, `initEvent(type, bubbles = true, cancelable = true)`), not a
  `KeyboardEvent`.
- The only custom property set is `keyCode` (a number). `key`, `code`, `which`, `keyIdentifier`, `charCode`, `repeat`,
  modifier flags and `location` are **not set** (`undefined`).
- Target: `document.activeElement` of the app iframe (so `<body>` when nothing is focused); it bubbles to `document` and
  `window`.
- Timing: keydown is dispatched after a 1 ms timer plus a further 100 ms; keyup after 1 ms.
- Digit keys additionally dispatch a `keypress` event (same shape, `keyCode` only) before the keydown.
- INFERRED: `event instanceof KeyboardEvent` is `false`; code that reads `event.key` gets `undefined`. Default actions are not
  triggered (synthetic, untrusted event): an Enter keydown does not click a focused button, arrows do not scroll.

### 3.3 Registration: none

`tizen.tvinputdevice.registerKey` is a no-op (doc 05 section 3.2) and `webapis.appcommon.registerKey` only returns a boolean.
**Every key the remote can produce is always delivered.** There is no "default set vs registered set" distinction in the
simulator. On a real TV only arrows, Enter and Back are delivered without registration (INFERRED from public documentation);
the emulator must implement that filter itself.

### 3.4 Per-key behaviour (OBSERVED `R:ui/custom/UserInteraction/remoteControlBridge`)

| Key | Behaviour |
|---|---|
| Any ordinary key | keydown sent; while the button is held the keydown is re-sent every **300 ms** until release; then one keyup. Auto-repeat events are identical to the first one (no `repeat` flag). |
| `once = true` callers | A single keydown and keyup, no repeat. |
| Back (10009) inside an app | First dispatches the `tizenhwkey` event (below), then sends keydown 10009 (with the 300 ms repeat unless `once`). Keyup 10009 is sent on release. |
| Exit (10182) | **Never delivered as keydown.** Closes a simulator overlay if one is open; otherwise stops AVPlay and navigates the iframe to the launcher / first screen. The keyup may still be dispatched when no overlay was closed. |
| Home (10071) | Not delivered. Stops AVPlay, navigates the iframe to `FirstScreen/index.html`. |
| Menu (internal 22225) | Not delivered. Opens the simulator's TV menu overlay. |
| Power (internal 22223) | Not delivered. Opens the close-confirmation dialog. |
| Source (10072) | Opens the simulator's source switcher. |
| Mouse leaving a pressed button | Cancels the repeat (`stopKeyDownEvent`). |

`tizenhwkey` (OBSERVED `R:hwKeyEmulator`): a plain DOM `Event` named `tizenhwkey`, bubbling, not cancelable, dispatched on the
app `document`, with a read-only `keyName` property equal to `"back"`. (`"menu"` is never produced.) The `hwkey-event`
setting of config.xml is not consulted.

Long press (OBSERVED `R:ui/plugins/basic-remote`, const `LONG_PRESS_TIME` = 1000 ms): only the Rewind and Fast-forward buttons
are special. They send nothing on mouse-down; on mouse-up they send one down+up pair of the normal code (412 / 417) for a
press shorter than 1000 ms, or of the "skip" code (10232 / 10233) for a longer press. All other buttons use the 300 ms
repeat described above. There is no generic long-press event.

Host keyboard (OBSERVED `R:ui/custom/UserInteraction/keyShortcuts`, bound on the simulator document, bubbling phase):

- `Esc` = Back (single shot).
- `Ctrl+Shift+` : `W` devtools (unless `--disableInspector`), `I` install window, `U` uninstall window, `R` rotate,
  `=` / `-` zoom +/- 0.25 (range 0.25 to 1), `F` fullscreen, `K` cycle remote type, `P` product-info configuration window.
- `T` always-on-top, `F1` about, `F5` return to first screen, `F6` TV menu, `F7` close confirmation, `]` volume up,
  `[` volume down, `F12` devtools toggle (global hotkey on macOS / Linux).
- INFERRED: ordinary typing inside the app iframe reaches the app as native Chromium `KeyboardEvent`s (arrows 37-40, Enter
  13), which is how most developers drive the simulator; these native events do carry `key` / `code`.

### 3.5 Key code tables

#### 3.5.1 Codes actually dispatched by the remote UI (OBSERVED `R:ui/custom/UserInteraction/const` `REMOTE_BTN`)

| Constant | keyCode | | Constant | keyCode |
|---|---|---|---|---|
| `KEY_0` .. `KEY_9` | 48 .. 57 | | `KEY_MINUS` | 189 |
| `KEY_LEFT` | 37 | | `KEY_UP` | 38 |
| `KEY_RIGHT` | 39 | | `KEY_DOWN` | 40 |
| `KEY_ENTER` | 13 | | `KEY_BACK` | 10009 |
| `KEY_EXIT` | 10182 | | `KEY_HOME` | 10071 |
| `KEY_VOLUMEUP` | 448 (sic) | | `KEY_VOLUMEDOWN` | 447 (sic) |
| `KEY_MUTE` | 449 | | `KEY_PRECH` | 10190 |
| `KEY_CHANNELUP` | 428 (sic) | | `KEY_CHANNELDOWN` | 427 (sic) |
| `KEY_RED` | 403 | | `KEY_GREEN` | 404 |
| `KEY_YELLOW` | 405 | | `KEY_CYAN` (blue) | 406 |
| `KEY_REWIND` | 412 | | `KEY_FF` | 417 |
| `KEY_REWIND_` (skip back) | 10232 | | `KEY_FF_` (skip forward) | 10233 |
| `KEY_PLAY` | 415 | | `KEY_PAUSE` | 19 |
| `KEY_STOP` | 413 | | `KEY_RECORD` | 416 |
| `KEY_PLAY_BACK` (play/pause) | 10252 | | `KEY_EXTRA` | 10253 |
| `KEY_SOURCE` | 10072 | | `KEY_CH_LIST` | 10073 |
| `KEY_TOOLS` | 10135 | | `KEY_INFO` | 457 |
| `KEY_SEARCH` | 10225 | | `KEY_GUIDE` | 22224 (internal; real Guide is 458) |
| `KEY_MORE` | 10148 | | `KEY_CAPTION` | 10221 |
| `KEY_BT_VOICE` | 10224 | | `KEY_3D` | 10199 |
| `KEY_MBR_WATCH_MOVIE` | 10236 | | `KEY_SOCCER_MODE` | 10228 |
| `KEY_STB_POWER` | 10155 | | `KEY_POINTER` | 10156 |
| `KEY_POWER` | 22223 (internal) | | `KEY_MENU` | 22225 (internal) |
| `KEY_CLOSE` | 22221 (internal) | | `TV_SPE` / `NOT_SUPPORT_TEM` / `UNKNOWN` | 22220 / 22222 / 22224 (internal) |

**Discrepancy (OBSERVED):** the remote UI sends VolumeUp = 448, VolumeDown = 447, ChannelUp = 428, ChannelDown = 427, while
`tizen.tvinputdevice.getSupportedKeys()`, `FirstScreen/js/TVKeyValue.js` and `webapis.appcommon` in the same product say
VolumeUp = 447, VolumeDown = 448, ChannelUp = 427, ChannelDown = 428. The latter matches public Tizen TV documentation
(INFERRED) and is what the emulator should use; the remote-UI constants look like a bug.

Remote models (OBSERVED same module + `R:apiServer`): id 0 "Basic Device" (`basic`), 1 "Smart Control 2016" (`smart2016`),
2 "Smart Signage Control" (`smartsignage`), 3 "Hotel Device" (`hotel`).

- Basic remote, 44 buttons: power, source, 1-9, 0, minus, prech, volumeup, volumedown, mute, channelup, channeldown, chlist,
  menu, search, back, home, tools, info, exit, up, left, enter, right, down, red, green, yellow, cyan, rewind, ff, record,
  play, pause, stop, rewind_ (skip), ff_ (skip).
- Smart Control 2016: power, more, volume up / down, guide, channel up / down, enter, arrows, back, play_back (10252),
  extra (10253), home, mute.

#### 3.5.2 `tizen.tvinputdevice.getSupportedKeys()` (OBSERVED `M:tvInputDevice`)

| name | code | | name | code | | name | code |
|---|---|---|---|---|---|---|---|
| `KEY_0` .. `KEY_9` | 48 .. 57 | | `KEY_MINUS` | 189 | | `KEY_VOLUMEUP` | 447 |
| `KEY_VOLUMEDOWN` | 448 | | `KEY_MUTE` | 449 | | `KEY_CHANNELUP` | 427 |
| `KEY_CHANNELDOWN` | 428 | | `KEY_PREVIOUS` | 412 | | `KEY_NEXT` | 417 |
| `KEY_PAUSE` | 19 | | `KEY_RECORD` | 416 | | `KEY_PLAY` | 415 |
| `KEY_STOP` | 413 | | `KEY_INFO` | 457 | | `KEY_LEFT` | 37 |
| `KEY_RIGHT` | 39 | | `KEY_UP` | 38 | | `KEY_DOWN` | 40 |
| `KEY_ENTER` | 13 | | `KEY_BACK` | 0 (sic) | | `KEY_RED` | 403 |
| `KEY_GREEN` | 404 | | `KEY_YELLOW` | 405 | | `KEY_BLUE` | 406 |
| `KEY_MENU` | 18 | | `KEY_ESC` | 27 | | `KEY_CTRL` | 17 |
| `KEY_SHIFT` | 16 | | `KEY_COMMAND` | 91 | | `KEY_-` | 189 |
| `KEY_=` | 187 | | `KEY_F1` | 112 | | `KEY_F4` | 115 |
| `KEY_F5` | 116 | | `KEY_F6` | 117 | | `KEY_F7` | 118 |
| `KEY_F12` | 123 | | `KEY_C` | 67 | | `KEY_F` | 70 |
| `KEY_I` | 73 | | `KEY_K` | 75 | | `KEY_P` | 80 |
| `KEY_R` | 82 | | `KEY_T` | 84 | | `KEY_U` | 85 |
| `KEY_W` | 87 | | `KEY_LEFT_MIDBRACKET` | 219 | | `KEY_RIGHT_MIDBRACKET` | 221 |

Half of this table is the simulator's own host-keyboard shortcut list; it is not a TV key table. `KEY_BACK` = 0 disagrees
with the 10009 actually dispatched. Do not copy this table; use the next one.

#### 3.5.3 Real-device style table: `webapis.appcommon` (OBSERVED `M:webapis/appcommon`)

Default keys (always available, not part of `getSpecialSupportedKeys()`):

| name | keyName | keyCode |
|---|---|---|
| `ArrowLeft` | `Left` | 37 |
| `ArrowUp` | `Up` | 38 |
| `ArrowRight` | `Right` | 39 |
| `ArrowDown` | `Down` | 40 |
| `Enter` | `Return` | 13 |
| `Back` | `XF86Back` | 10009 |

Special keys (name -> keyCode; X keysym shown where it was recorded):

| name | code | | name | code | | name | code |
|---|---|---|---|---|---|---|---|
| `0` .. `9` | 48 .. 57 | | `Minus` (`XF86Minus`) | 189 | | `VolumeUp` (`XF86AudioRaiseVolume`) | 447 |
| `VolumeDown` (`XF86AudioLowerVolume`) | 448 | | `VolumeMute` (`XF86AudioMute`) | 449 | | `ChannelUp` (`XF86RaiseChannel`) | 427 |
| `ChannelDown` (`XF86LowerChannel`) | 428 | | `PreviousChannel` | 10190 | | `ChannelList` | 10073 |
| `ColorF0Red` | 403 | | `ColorF1Green` | 404 | | `ColorF2Yellow` | 405 |
| `ColorF3Blue` | 406 | | `MediaRewind` | 412 | | `MediaFastForward` | 417 |
| `MediaPlay` | 415 | | `MediaPause` | 19 | | `MediaStop` | 413 |
| `MediaRecord` | 416 | | `MediaPlayPause` | 10252 | | `MediaTrackPrevious` | 10232 |
| `MediaTrackNext` | 10233 | | `Menu` | 10133 | | `Tools` (`XF86Tools`) | 10135 |
| `Info` (`XF86Info`) | 457 | | `Exit` (`XF86Exit`) | 10182 | | `Search` (`XF86Search`) | 10225 |
| `Guide` (`XF86Guide`) | 458 | | `Source` (`XF86Source`) | 10072 | | `PictureSize` | 10140 |
| `E-Manual` (`XF86EManual`) | 10146 | | `MTS` | 10195 | | `3D` (`XF863D`) | 10199 |
| `Soccer` | 10228 | | `Caption` | 10221 | | `Teletext` | 10200 |
| `Extra` | 10253 | | `Power` (`XF86PowerOff`) | 409 | | `SmartHub` (`XF86Home`) | 10071 |
| `PMODE` | 10141 | | `SMODE` | 10197 | | `More` | 10148 |
| `Sleep` | 10150 | | `BTPairing` | 10161 | | `BTPairingGuide` | 10523 |
| `BTVoice` | 10224 | | `BTFarVoice` | 10538 | | `Color` | 10385 |
| `Alarm` | 10418 | | `MultiView` | 10505 | | `AccessibilityShortcut` | 10364 |
| `LearnRemote` | 10588 | | `QuickAccess` | 10591 | | `STBPower` | 10487 |
| `CCOnOff` | 10616 | | `VoiceGuide` | 10093 | | `CCDivision` | 10097 |
| `SignLanguageZoom` | 10103 | | `SignLanguageZoomPlus` | 10121 | | `SignLanguageZoomMinus` | 10122 |
| `CCPreset` | 10123 | | `CCPosition` | 10132 | | `CCSize` | 10136 |
| `CCColor` | 10395 | | `VGBackground` | 10251 | | `CurrentTime` | 10254 |
| `VoiceGender` | 10255 | | `VoicePitch` | 10256 | | `VoiceSpeed` | 10362 |
| `UserGuideAccessibility` | 10363 | | `HighContrast` | 10584 | | `Enlarge` | 10585 |
| `VisualImpaired` | 10601 | | `RotatePanel` | 10569 | | `TVPlus` | 10568 |
| `Ambient` | 10530 | | `AmbientLong` | 10535 | | `HDMI` | 10143 |
| `TV` | 10153 | | `PanelDown` | 10157 | | `PanelEnter` | 10171 |
| `PanelUp` | 10173 | | `PanelExit` | 10181 | | `PanelPlus` | 10223 |
| `PanelMinus` | 10227 | | `PanelPower` | 10531 | | `PanelSource` | 10532 |
| `PanelMenu` | 10533 | | `Netflix` | 10234 | | `Amazon` | 10229 |
| `WebBrowser` (`XF86WWW`) | 10158 | | `Hulu` (`XF86LaunchApp1`) | 10507 | | `RakutenTV` (`XF86LaunchApp2`) | 10508 |
| `YouTube` | 10537 | | `Disney` | 10634 | | `Globo` | 10510 |
| `Zee5` | 10509 | | `Tving` | 10632 | | `Hotstar` | 10633 |
| `Kinopoisk` | 10635 | | `SweetTV` | 10605 | | `Vtvgo` | 10667 |
| `FptPlay` | 10668 | | `AIMenu` | 10669 | | `RussiaCP1` .. `RussiaCP3` | 10511 .. 10513 |
| `VietnamCP` | 10591 | | `MenaCP` | 10592 | | `PlayBackGame` | 10571 |
| `GamepadHomekey` | 10572 | | `ARKVolume` | 10593 | | `AndroidMenu` | 10595 |
| `HotelMovies` | 10494 | | `HotelLanguage` | 10495 | | `HotelTVGuide` | 10496 |
| `Content` (`XF86HotelAppsGuest`) | 10497 | | `HotelRoomControl` | 10522 | | `HotelSolution` | 10489 |
| `NoiseReduction` | 10519 | | `Help` | 10520 | | `NR` | 10521 |
| `MBRMenu` | 10237 | | `MBRBDPopup` | 10185 | | `LFDPowerOff` | 10120 |
| `DiscretPowerOff` | 10360 | | `DiscretPowerOn` | 10361 | | `LFDSet` | 10245 |
| `LFDUnset` | 10166 | | `LFDScreenLock` | 10147 | | `Focus` | 10490 |
| `SysMenu` | 10133 | | | | | | |

Notes: `QuickAccess` and `VietnamCP` share 10591, `Menu` and `SysMenu` share 10133 (as recorded). `webapis.appcommon` also has
a "generate key" table of Linux input codes (`VolumeUp` 76, `VolumeDown` 75, `VolumeMute` 74, `ChannelUp` 96, `ChannelDown`
95, `ArrowLeft` 105, `ArrowUp` 104, `ArrowRight` 106, `ArrowDown` 108, `Enter` 28, `Back` 158, `GamepadHomekey` 102,
`MediaTrackPrevious` 165, `MediaRewind` 168 (keyCode 10176), `MediaTrackNext` 163, `MediaFastForward` 164 (keyCode 10216),
`Search` 217, `Exit` 174, `Source` 292, `MultiView` 193, `SmartHub` 139, `ARKVolume` 248, `PlayBackGame` 244, `More` 177);
`generateKey(name)` only validates against it and synthesises nothing.

This is the table to use for the emulator's `REMOTE_KEYS` (names are the documented `tizen.tvinputdevice` key names).

#### 3.5.4 Automation key map (OBSERVED `R:tvKey2AppKey`, used by the protobuf "ECS" channel)

Linux input code -> remote constant: POWER 116, digits `1`..`0` 2..11, MINUS 12, PREVCHANNEL 182, VOLUMEUP 68, VOLUMEDOWN 67,
MUTE 66, CHANNELUP 88, CHANNELDOWN 87, PREVIOUS 165, NEXT 163, PAUSE 201, RECORD 167, PLAY 200, STOP 166, SOURCE 64,
SEARCH 217, CHANNELS 65, TOOLS 139, INFO 118, EXIT 174, LEFT 105, RIGHT 106, UP 103, DOWN 108, ENTER 28, BACK 1, RED 59,
GREEN 60, YELLOW 61, BLUE 62, MENU 125, PROGINFO 130, HOME 63, SOCCER_MODE 220, MORE 140.

## 4. Lifecycle and window

### 4.1 Boot and frame setup (OBSERVED `R:bootstrap`, `app.nw/index.html`, `app.nw/package.json`)

1. NW.js opens `index.html` (frameless, transparent window, max 2100 x 1950, single instance), which only checks that the
   browser is Chrome and redirects to `ripple.html`.
2. `ripple.html` hosts the device chrome and `<iframe id="document">`. The iframe initially loads
   `file://<cwd>/FirstScreen/index.html` (simulator home screen), or the last saved URL after a simulator reload.
3. On each iframe load the simulator: links the API objects (doc 05 section 0.3); removes Node's `require` from the frame;
   injects a `<link>` to `<cwd>/font/style.css`; replaces every `<object type="application/avplayer">` with a black `<div>`
   of the same id, size and position; installs a `MutationObserver` that applies the saved TV volume / mute to any
   `<video>` / `<audio>` added later; saves the current URL; initialises the touch-event emulator, the hardware-key
   emulator, the visibility shim, the device-motion emulator and the resizer.
4. Apps are loaded from `file://<cwd>/appLauncher/app/<package>/<content src>` (so the page origin is `file://`), or from a
   local static server for NaCl apps.

### 4.2 Resolution, viewport and zoom (OBSERVED `R:devices`, `R:devices/tizentv`, `R:resizer`, `R:ui`)

| Item | Value |
|---|---|
| Device "Tizen TV (1920X1080)" (id `tizentv`, default) | screen 1920 x 1080, viewport 1920 x 1080, ppi 316 |
| Device "Tizen TV (3840X1080)" (id `tizentv3840`) | screen 3840 x 1080, viewport 2520 x 1080 (ultra-wide signage) |
| 1280 x 720 mode | **None.** No 720p device, no handling of a 1280-wide viewport beyond the generic meta-viewport rule below. |
| `<meta name="viewport" content="width=..., height=...">` in the app | When present, its width / height replace the logical viewport size; the viewport container is then scaled by `screen width / viewport width` to fill the 1920-wide panel. So a page declaring `width=1280` is laid out at 1280 CSS px and magnified 1.5x. |
| Simulator zoom ("scale factor") | 0.25, 0.5 (default), 0.75, 1.0; pure CSS `transform: scale()` on the device layout; fullscreen computes its own factor from the window size. Does not change the app's CSS pixel viewport. |
| `window.devicePixelRatio` | Not overridden (INFERRED: host value). |
| Orientation | `landscape` (default) or `portrait`; rotating applies a CSS rotate and dispatches a DOM `orientationchange` event on the app window (and calls `window.onorientationchange`). `window.orientation` is set to 0 / 90. |

`--resolution=` CLI argument defaults to `"1920X1080"` and, per `<sim>/README.md`, only feeds an informational display; the
effective choice is the persisted "device resolution" setting (`1920*1080` or `3840*1080`).

### 4.3 Visibility (OBSERVED `R:documentEventListener`)

- After `DOMContentLoaded` the simulator wraps `document.addEventListener` so that listeners for `visibilitychange` are stored
  in its own list. It defines `document.hidden`, `document.visibilityState` (`"visible"` / `"hidden"`) and constants
  `PAGE_HIDDEN`, `PAGE_VISIBLE`, `PAGE_PREVIEW`.
- The **only** trigger is the simulator's "Lock Screen" setting: toggling it shows a lock overlay, flips `hidden` /
  `visibilityState`, and calls the stored listeners **with no event argument**.
- `Application.hide()`, `exit()`, Home, Exit and source switching do **not** fire `visibilitychange`.
- INFERRED gaps versus a real TV: listeners registered before `DOMContentLoaded`, on `window`, or through
  `document.onvisibilitychange` are not intercepted; `event.target` is unavailable.

### 4.4 Suspend / resume, exit, multitasking

- OBSERVED: no suspend / resume / pause / resume-from-background event exists anywhere in the platform modules. The words only
  appear as `webapis.avplay.suspend()` / `restore()` methods (doc 05 section 4.2).
- OBSERVED: `tizen.application.getCurrentApplication().exit()` and `.hide()` both navigate the iframe back to the launcher,
  after closing AVPlay when its state is not `NONE`. The app document is simply unloaded.
- OBSERVED (`R:devices`): an internal "HardwareKeyDefault" event with value 0 calls `history.back()` in the app window.
- INFERRED: there is no model of "app in background then resumed"; relaunching always reloads the page from scratch.

### 4.5 Launch, app control, deep link

- Launch = set `iframe.contentWindow.location` to the start page (launcher click, install of an html app, or HTTP API).
- No launch arguments are passed: `getRequestedAppControl()` always reports an empty operation with no data (doc 05 section
  3.1). No `PAYLOAD`, no Smart Hub preview deep link (`webapis.preview` is an empty stub, doc 05 section 4.17).
- `tizen.application.launch` / `launchAppControl` show a simulator dialog and call the success callback; they do not start
  the other app.

### 4.6 External control surfaces (useful as prior art for the emulator's own control channel)

CLI arguments (OBSERVED `R:system_event`, `R:utils.parseArgs`, `<sim>/README.md`): `--platform=` (default `tizentv`),
`--tizentvversion=` (default `2.0`), `--resolution=` (default `1920X1080`), `--file=<path to html>` (install and open),
`--app=`, `--close`, `--reset` (wipe persisted settings and installed apps, reload), `--disableInspector`,
`--remote-debugging-port=N`. A second invocation forwards its arguments to the running single instance.

Local HTTP API (OBSERVED `R:apiServer`; Express, JSON): binds `localhost:38888` by default (`API_SERVER_PORT`,
`API_SERVER_HOST` environment variables; on `EADDRINUSE` it retries on port + 1). CORS allowed for `http://localhost:*` and
`http://127.0.0.1:*`. Every response is `{ success, message?, data?, error?, timestamp }`.

| Method and path | Body | Effect |
|---|---|---|
| `GET /`, `/hello`, `/status`, `/api/info`, `/simulator/info` | - | Information. |
| `POST /remote/press` | `{ key, duration? = 100, remoteType? = "basic" }` | Key down, then key up after `duration` ms. |
| `POST /remote/down`, `/remote/up` | `{ key }` | Single edge. |
| `POST /remote/stop` | - | Cancel auto-repeat. |
| `GET /remote/keys`, `/remote/info` | - | Lists the 44 basic-remote key names (section 3.5.1) with codes. |
| `POST /app/install` | wgt / html path | Install (30 s timeout). |
| `POST /app/uninstall`, `GET /app/list`, `GET /app/status/:appId` | - | Package management. |
| `POST /app/launch` | `{ appId }` (= package id) | Reads `content@src` (default `index.html`) and navigates the iframe. |
| `POST /display/orientation`, `/display/scale`, `/display/resolution` (`"1920*1080"` or `"3840*1080"`), `GET /display/fullscreen`, `/display/info` | - | Display settings. |
| `POST /system/ontop`, `/system/minimize`, `/system/close` | - | Window control. |
| `POST /devtools/open`, `/devtools/close` | - | Inspector. |
| `POST /remotecontrol/change`, `/remotecontrol/show`, `GET /remotecontrol/info` | - | Remote model and visibility. |

Other channels (OBSERVED, not analysed in depth): a protobuf "ECS" server (`R:protobufServer`, schemas
`app.nw/protoMessage/ecs.proto`, `ecs_ids.proto`) used by Samsung's automation, and a static server for NaCl apps
(`app.nw/childnacl.js`, port in `naclport.txt`).

## 5. Simulator settings and defaults (candidate `DeviceProfile` defaults)

All OBSERVED in `M:spec/device`, persisted by `R:deviceSettings` under keys `"<Group>.<name>"`, unless another module is cited.

### 5.1 Product identity

| Setting | Default | Options offered |
|---|---|---|
| Firmware | `T-HKPAKUC-0000.0` | `T-HKPAKUC-0000.0`, `T-HKPAKUC-0000.1` |
| Model | `UKS9000` | `UH8000`, `UJU6000`, `UKS9000`, `UKS9500` |
| ModelCode | `16_JAZZM_UHD` | - |
| SmartTVServerType | `development` | `oprating` (sic), `developing`, `development` |
| SmartTVServerVersion | `T-INFOLINK2015-1000` | also `T-INFOLINK` |
| TunerEpop | `dummy value ` (trailing space) | - |
| LocalSet | `US` | `NONE`, `US`, `KOR`, `SD_MEXICO`, `SD_CANADA`, `CARRIBE` |
| No Glass 3D Support | off | - |
| TTV Support | off | - |
| UHDAModel | off | - |
| WallModel | off | - |
| PSID | `dummy value` | - |
| DUID (hard-coded, not a setting) | `SDKHUWUR7SQ24` in `webapis.productinfo`; `"device unique ID"` in `tizen.systeminfo` | `M:webapis/productinfo`, `M:systeminfo` |
| UDN / reservation ids | `8be65cf0-1130-11e4-b89f-334b2d3fb6f2` / `f10565d0-1131-11e4-a100-2f7cff7a9797` | `app.nw/udn.json`, `app.nw/reservationState.json` |

There is **no** model-year setting, no "Tizen platform version" setting, and no screen-size setting.

### 5.2 System, network, misc

| Group / setting | Default | Options |
|---|---|---|
| System / audioMode | `PCM` | `PCM`, `DOLBY`, `DTS`, `AAC` |
| System / 3DMode | `off` | `OFF`, `TOP_BOTTOM`, `SIDE_BY_SIDE`, `LINE_BY_LINE`, `VERTICAL_STRIPE`, `FRANE_SEQUENCE` (sic), `CHECKED_BD` (sic), `FROM_2D_TO_3D` |
| Network Setting / networkType | `Wired` | `Wired`, `Wireless` |
| Network Status / MAC | `00:00:00:00:00:00` | free text |
| Network Status / IP, Subnet, Gateway, DNS | `0.0.0.0` each | free text |
| Config / vibratingMode | true | - |
| Config / lockScreen | false | drives `document.hidden` (section 4.3) |
| Locale (`tizen.systeminfo` LOCALE) | `eng_USA` | `eng_USA`, `eng_CAN`, `deu_DEU`, `jpn_JPN`, `zho_CHN`, `UNKNOWN` |
| TV volume | 60 when never set (`R:bootstrap`); applied to media elements as 0.6 | TV-menu overlay, `[` / `]` |
| TV mute | false | - |
| Input source | TV 1 | TV 1, HDMI 1, HDMI 2 |
| Remote model | Basic Device (0) | section 3.5.1 |
| Scale factor | 0.5 | 0.25, 0.5, 0.75, 1 |
| Device resolution | `1920*1080` | `1920*1080`, `3840*1080` |
| Orientation | `landscape` | `landscape`, `portrait` |
| Always on top | `no` | - |
| Fullscreen | `no` | - |
| Virtual filesystem root | `<HOME>/root` | persisted path |

There is no "network connected / disconnected" switch for `webapis.network`, no language / country setting beyond LOCALE, no
time-zone setting.

### 5.3 Caption settings (OBSERVED `M:spec/tvinfo`, read by `tizen.tvinfo` and `webapis.tvinfo`)

| Key | Default |
|---|---|
| `CAPTION_ONOFF_KEY` | `CAPTION_OFF` |
| `CAPTION_MODE_KEY` | `CAPTION_MODE_DEFAULT` |
| `CAPTION_FONT_SIZE_KEY` | `CAPTION_SIZE_DEFAULT` |
| `CAPTION_FONT_STYLE_KEY` | `CAPTION_FONT_DEFAULT` |
| `CAPTION_FONT_COLOR_KEY` | `CAPTION_COLOR_DEFAULT` |
| `CAPTION_FONT_OPACITY_KEY` | `CAPTION_OPACITY_SOLID` |
| `CAPTION_BG_COLOR_KEY` | `CAPTION_COLOR_DEFAULT` |
| `CAPTION_BG_OPACITY_KEY` | `CAPTION_OPACITY_SOLID` |
| `CAPTION_EDGE_TYPE_KEY` | `CAPTION_EDGE_NONE` |
| `CAPTION_EDGE_COLOR_KEY` | `CAPTION_COLOR_DEFAULT` |
| `CAPTION_WINDOW_COLOR_KEY` | `CAPTION_COLOR_DEFAULT` |
| `CAPTION_WINDOW_OPACITY_KEY` | `CAPTION_OPACITY_SOLID` |

### 5.4 Suggested `DeviceProfile` defaults (INFERRED)

Take 5.1 (model `UKS9000`, model code `16_JAZZM_UHD`, firmware `T-HKPAKUC-0000.0`, DUID `SDKHUWUR7SQ24`, local set `US`),
1920 x 1080 logical resolution, volume 60, mute false, network type wired; replace the all-zero IP / MAC with plausible
values because apps commonly treat `0.0.0.0` as "offline". Add what the simulator lacks: model year, platform version,
language / country, time zone, network connected flag.

## 6. Media

### 6.1 AVPlay rendering (OBSERVED `M:webapis/avplay`; API contract in doc 05 section 4.2)

- AVPlay is simulated with an **HTML5 `<video id="samsung_tizen_web_videoplayer">`** created inside the app document on
  `open()`: reused if it exists; otherwise it replaces the placeholder that stands in for an
  `<object type="application/avplayer">`, or is appended to `<body>`. An element with id `stub` is hidden.
- The video element lives in the app's own DOM, in normal stacking order. It is **not** a hardware layer behind the page:
  no transparent "hole" is needed to see it. INFERRED divergence: on a real TV the video plane is behind the web layer and
  the app must leave a transparent region.
- `setDisplayRect(x, y, w, h)`: `position: absolute`; `left = x px`, `top = y px` (not scaled); `width = w / 1920 x
  viewport width`, `height = h / 1080 x viewport height`, using the persisted viewport dimensions. So coordinates are
  interpreted on a 1920 x 1080 grid for size but not for position (inconsistent when the viewport is not 1920 wide).
- Events, state machine, time values and listener callbacks are derived from the `<video>` element's own events.

### 6.2 Stream type selection (OBSERVED `M:webapis/avplay.open`)

| URL contains | Path |
|---|---|
| `ism` | Smooth Streaming through `M:webapis/smoothstreamPlayer`: a dash.js-style `MediaPlayer` (MSE) attached to the first `<video>` of the document. |
| `m3u8` | `new (require("hls"))()`, then `loadSource(url)` and `attachMedia(video)` (hls.js-style API). **OBSERVED: no `hls` module exists in `app.nw/node_modules`**, so INFERRED: this path throws at `require` in this build, unless NW.js resolves it elsewhere. |
| anything else (mp4, webm, mpd, ...) | `video.src = url`; whatever Chromium plays natively. No DASH player: an `.mpd` URL is handed to the `<video>` element and INFERRED to fail. |

Matching is by substring anywhere in the URL (not by extension or MIME type).

DRM (OBSERVED): `setDrm` exists as a method; no Widevine / PlayReady / EME code exists in the bundle (0 occurrences of
`widevine`). INFERRED: protected content cannot play.

### 6.3 The `hls/` folder (OBSERVED `<sim>/hls/`, `M:hlsplayer`, `M:hlsservice`)

`<sim>/hls/` is a bundled Node runtime (`bin/node`, `bin/start.js`, `bin/node_modules/hlsserver`, `include`, `lib`, `share`,
`README.md`, `LICENSE`, `ChangeLog`). The legacy modules `M:hlsplayer` / `M:hlsservice` spawn `hls/bin/node hls/bin/start.js`,
which serves an MPEG-TS player page on `localhost:3000`; that page is embedded in a zero-size iframe and driven by
`postMessage` (`"Pause"`, `"Resume"`). These modules are loaded but `avplay.open` no longer calls them (INFERRED: superseded
by the `require("hls")` path). `app.nw/vfs/hls/` (one `icon.png`) is the seed of a virtual-filesystem folder with the same
name and is unrelated to streaming.

### 6.4 The `npsef` plugin (OBSERVED `<sim>/plugins/`)

- Files: `npsef.plugin` (macOS bundle, Mach-O x86_64, bundle id `samsung.npsef`, built with the macOS 10.7 SDK, copyright
  2014), `npsef.dll`, `npsef.so`, `npsef64.so`, plus MSVC 2010 debug runtime DLLs.
- `Info.plist` registers MIME type `application/sef-plugin`, description "Samsung Sef Plugin": an **NPAPI** browser plugin for
  the pre-Tizen Samsung Smart TV "SEF" plugin interface (`<object type="application/sef-plugin">`).
- INFERRED: dead weight. NPAPI was removed from Chromium long before version 137, there is no arm64 slice, and nothing in
  `ripple.js` instantiates an `application/sef-plugin` object. Its internals were not disassembled.
- `--enable-nacl` and the NaCl static server are similarly legacy (NaCl / PNaCl apps).

### 6.5 Other media behaviour

- Global TV volume / mute is applied to every `<video>` / `<audio>` element of the app, including ones added later
  (`R:bootstrap` observer, `M:audiocontrol`).
- `tizen.tv.window.show()` positions a placeholder rectangle in the simulator chrome (offset +68, +25 px); no broadcast
  picture is rendered.
- `app.nw/avPlay/wsIntro.mp4` is a bundled sample clip; `app.nw/beep.wav` a UI sound.

## 7. NW.js / Chromium version and user agent

| Item | Value | Evidence |
|---|---|---|
| Simulator version | `Version:10.0.6` | `<sim>/sec-tv-simulator.version` |
| App manifest | name `tizen tv web simulator`, version `1.0 beta`, main `index.html` | `app.nw/package.json` |
| Chromium | 137.0.7151.69 | `nwjs Framework` `Info.plist` `CFBundleShortVersionString`; bundle id `io.nwjs.nwjs`; min macOS 11.0 |
| NW.js | 0.100.1 ("upgrade NW.js to v0.100.1 @2025/10") | `<sim>/README.md`; pairing with Chromium 137 is INFERRED consistent |
| Samsung's own note | "TV 2025 Chromium is v130", about NW.js 0.93 | `<sim>/README.md` |
| Chromium flags | `--disable-devtools --enable-file-cookies --allow-file-access-from-files --disable-web-security --enable-nacl --no-first-run --no-sandbox --allow-nacl-socket-api=localhost` | `app.nw/package.json` `chromium-args` |
| Node dependencies | `adm-zip`, `express`, `jsdom`, `protobufjs`, `xml2js`, `fileutil`, `jWorkflow` | `app.nw/package.json` |

User agent:

- Network-level and default `navigator.userAgent` (OBSERVED `app.nw/package.json` `user-agent`):
  `Mozilla/5.0 (SMART-TV; Linux; Tizen) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36 Tizen`
  (no Tizen version number; claims Chrome 55 while running Chromium 137).
- The app frame's `navigator` is a wrapper (OBSERVED `M:navigator`): `userAgent` returns the current simulated device's UA
  unless that equals the sentinel `"default"` (`R:constants` `COMMON.USER_AGENT_DEFAULT`), in which case the real one above
  is returned. The built-in device definitions carry a mobile-era string,
  `Mozilla/5.0 (Linux; Tizen 2.2;sdk) AppleWebKit/538.1 (KHTML, like Gecko)Version/2.2 Mobile Safari/538.1`
  (`R:devices/tizentv`). Which of the two an app sees depends on persisted state (UNKNOWN 3).
- Other wrapper fields: `appName` `""`, `platform` `"Linux"`, `vendor` `"Apple Computer, Inc."`,
  `appVersion` `"5.0 (Linux; Tizen 2.2) AppleWebKit/538.1 (KHTML, like Gecko)Version/2.2 Mobile Safari/538.1"`.
- `tizen.websetting.setUserAgentString(ua)` changes the simulated device UA at runtime.

Implication (INFERRED): the simulator does not emulate an old TV engine at all. Apps run on Chromium 137 with a UA that
claims Chrome 55, with web security disabled and from a `file://` origin. An emulator that pins an old Chromium (for
example 69) is strictly more faithful to old TVs than Samsung's own simulator.

## 8. UNKNOWNS

1. **Nothing was executed.** All behaviour is read from code; timing (1 ms + 100 ms keydown delay, 300 ms repeat), event
   targets and failure modes are unverified at runtime.
2. **REA analysis incomplete.** The REA JavaScript analysis of `ripple.js` hit its 300 s provider deadline; only small files
   were parsed by it. Findings come from splitting the bundle into AMD modules and reading them, without a call graph.
3. **Which user agent an app really sees** (`package.json` UA or the mobile-era device UA) depends on whether the persisted
   device UA equals `"default"`; the initial persisted value was not determined.
4. **Whether `require("hls")` resolves at runtime.** No `hls` package is in `app.nw/node_modules`; a resolution path outside
   that folder was not ruled out.
5. **`npsef` plugin internals** and the SEF command set were not analysed (binary not disassembled; judged dead).
6. **Protobuf ECS protocol** (`ecs.proto`, `ecs_ids.proto`, `R:protobufServer`, `R:extern_service`) was not analysed: ports,
   message set and who connects are unknown.
7. **HTTP API request details** for `/app/install`, `/app/uninstall`, `/display/*`, `/remotecontrol/*` (exact body field
   names) were not transcribed; only `/remote/*`, `/app/launch` and `/display/resolution` were read in full.
8. **Persistence backend** (where `tizentv-` / `tinyhippos-` prefixed settings are stored, most likely localStorage of the
   NW.js profile) was not confirmed.
9. **Effect of `tizen:setting` attributes**: the only consumer found is the rotation shortcut (section 2.3). For
   `hwkey-event` and `background-support` no consumer was found, but an exhaustive search of all 284 modules for indirect
   use was not done. How the stored value maps from `screen-orientation="auto"` to the compared string `auto-rotation` was
   not traced.
10. **Real-device behaviour.** Every comparison with a physical TV in this document is INFERRED from public documentation.
    The simulator itself gives no evidence for: default vs registered key delivery, `visibilitychange` on hide / resume,
    deep-link `PAYLOAD`, privilege enforcement of TV APIs, 1280 x 720 app scaling, the video-plane "hole" model.
11. **Smart Control 2016 / signage / hotel remote layouts** beyond the button lists were not mapped (touchpad gestures,
    pointer mode).
