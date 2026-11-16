# 03 - Remote control key tables, skins and device templates

Clean-room notes. Only names, numbers and structure are recorded; no image or XML file was copied.
Tags: **OBSERVED** (source) / **INFERRED**.

Sources (all under the extracted SDK reference folder):

- `SKIN` = `tv-samsung-emulator-resources_10.0.0/data/platforms/tizen-10.0/tv-samsung/emulator-resources/skins/`
  (`tv-1920x1080/`, `tv-3840x1080/`, `common/`; files `info.ini`, `layout.xml` v2.4, controller layout XMLs)
- `EMRES` = `tv-samsung-emulator-manager-resources_10.0.0/.../emulator-resources/` (`devices/`, `template/`, `tuner-template/`)
- `EMPLUG` = `em-plugin-tv-samsung.jar` (launch option builders)
- `QEMU` = `emulator-x86_64` (strings/symbols)

## 1. How a remote key reaches the guest

- The skin controller XML declares each button as: name, keycode, optional long-press keycode, tooltip and a rectangle
  (left, top, width, height) over a controller image. OBSERVED (SKIN controller XMLs; QEMU symbols `XmlLayoutParser::parseKeycode`,
  `HardwareKey`, `HWKeyButton`, `KeycodeType`, `hasLongPressKeycode`).
- Press/release of a button calls the hardware-key path (`maru_hwkey_event`) which feeds the paravirtual device
  `virtio-maru-hwkey-pci`. OBSERVED (QEMU symbols; EMPLUG `SDefaultOption` adds `-device virtio-maru-hwkey-pci`).
- The numeric codes are **Linux input-event style key codes** (e.g. 103 UP, 108 DOWN, 105 LEFT, 106 RIGHT, 28 ENTER, 116 POWER)
  with Samsung-specific assignments for TV functions. INFERRED from the values.
- A long press is a distinct code (e.g. RETURN long press = 174 = EXIT). OBSERVED.
- Host keyboard shortcuts can be bound to hardware keys (`KeyboardShortcut::registerHwKeyShortcuts`). OBSERVED (symbol only; bindings not extracted).
- The control panel can also inject keys through ECS category `input` ("input keycode data"). OBSERVED (QEMU strings), see doc 04.

For our runtime the code is only an identifier: map `KEY_*` name -> DOM `keydown`/`keyup` with the Tizen TV web key code.

## 2. Controller layouts

Three controllers ship; priority decides the default (1 = default). Layouts are identical for the 1920 and 3840 skins;
`common/` only carries Basic (US). OBSERVED (SKIN).

### 2.1 Smart Control 2016 (priority 1, default)

| Name | Code | Long press |
|---|---|---|
| KEY_POWER | 116 | |
| KEY_KEYPAD | 140 | |
| KEY_EXTRA | 377 | |
| KEY_UP | 103 | 103 |
| KEY_LEFT | 105 | 105 |
| KEY_OK | 28 | 28 |
| KEY_RIGHT | 106 | 106 |
| KEY_DOWN | 108 | 108 |
| KEY_RETURN | 1 | 174 (Exit) |
| KEY_HOME | 63 | |
| KEY_PLAY_PAUSE | 244 | |
| KEY_VOL_UP | 68 | |
| KEY_MUTE | 66 | |
| KEY_VOL_DOWN | 67 | |
| KEY_CH_UP | 88 | |
| KEY_GUIDE | 130 | |
| KEY_CH_DOWN | 87 | |

### 2.2 Smart Control 2015 (priority 2)

| Name | Code | Long press / note |
|---|---|---|
| KEY_POWER | 116 | |
| KEY_KEYPAD | 140 | "Menu/123" |
| KEY_POINTER | -999 | not supported |
| KEY_VOL_UP | 68 | |
| KEY_VOL_DOWN | 67 | |
| KEY_CH_UP | 88 | |
| KEY_CH_DOWN | 87 | |
| KEY_UP | 103 | 103 |
| KEY_LEFT | 105 | 105 |
| KEY_OK | 28 | 28 |
| KEY_RIGHT | 106 | 106 |
| KEY_DOWN | 108 | 108 |
| KEY_HOME | 63 | |
| KEY_RETURN | 1 | 174 (Exit) |
| KEY_PLAY_PAUSE | 244 | |
| KEY_EXTRA | 245 | |
| KEY_MUTE | 66 | |

Note: KEY_EXTRA differs between 2015 (245) and 2016 (377). OBSERVED.

### 2.3 Basic (US) (priority 5)

| Name | Code | Name | Code |
|---|---|---|---|
| KEY_POWER | 116 | KEY_SOURCE | 64 |
| KEY_1 | 2 | KEY_2 | 3 |
| KEY_3 | 4 | KEY_4 | 5 |
| KEY_5 | 6 | KEY_6 | 7 |
| KEY_7 | 8 | KEY_8 | 9 |
| KEY_9 | 10 | KEY_0 | 11 |
| KEY_MINUS | 12 | KEY_PRECH | 182 |
| KEY_VOL_UP | 68 | KEY_VOL_DOWN | 67 |
| KEY_MUTE | 66 | KEY_CH_LIST | 65 |
| KEY_CH_UP | 88 | KEY_CH_DOWN | 87 |
| KEY_MENU | 125 | KEY_HOME | 63 (Smart Hub) |
| KEY_GUIDE | 130 | KEY_TOOLS | 127 |
| KEY_INFO | 188 | KEY_RETURN | 1 (Back) |
| KEY_EXIT | 174 | KEY_OK | 28 |
| KEY_UP | 103 | KEY_DOWN | 108 |
| KEY_LEFT | 105 | KEY_RIGHT | 106 |
| KEY_RED | 59 (A) | KEY_GREEN | 60 (B) |
| KEY_YELLOW | 61 (C) | KEY_CYAN | 62 (D) |
| KEY_CAPTION | 213 (CC) | KEY_MTS | 187 |
| KEY_PICTURE_SIZE | 132 | KEY_KEYPAD | 140 |
| KEY_SEARCH | 217 | KEY_3D | 191 |
| KEY_REWIND | 168 | KEY_PAUSE | 201 |
| KEY_FF | 208 | KEY_REC | 167 |
| KEY_PLAY | 200 | KEY_STOP | 166 |

KEY_MINUS carries the tooltip "Plus 100" in the source layout. OBSERVED.

### 2.4 Suggested mapping to web key events (NOT from these artifacts)

The emulator artifacts do not contain the guest-side translation to web key codes (that lives in the guest image).
The values below are the publicly documented Samsung TV web key codes, listed from memory as a starting point -
**INFERRED, verify against Samsung's public "Remote Control" key code page before relying on them**:

| Key | Web keyCode | Key | Web keyCode |
|---|---|---|---|
| LEFT/UP/RIGHT/DOWN | 37/38/39/40 | OK (Enter) | 13 |
| RETURN (Back) | 10009 | EXIT | 10182 |
| 0-9 | 48-57 | MINUS | 189 |
| VOL_UP / VOL_DOWN / MUTE | 447 / 448 / 449 | CH_UP / CH_DOWN | 427 / 428 |
| RED / GREEN / YELLOW / BLUE | 403 / 404 / 405 / 406 | PLAY_PAUSE | 10252 |
| PLAY / PAUSE / STOP | 415 / 19 / 413 | REWIND / FF / REC | 412 / 417 / 416 |
| INFO | 457 | GUIDE | 458 |
| TOOLS | 10135 | MENU | 18 |
| SOURCE | 10072 | CH_LIST | 10073 |
| PRECH | 10190 | CAPTION | 10221 |
| EXTRA | 10253 | SEARCH | 10225 |
| PICTURE_SIZE | 10140 | MTS | 10195 |
| 3D | 10199 | | |

Platform rule (public behaviour, INFERRED here): only arrows, Enter and Back are delivered by default; all other keys
must be registered with `tizen.tvinputdevice.registerKey(name)`. HOME and POWER never reach the app.

## 3. Skin and window behaviour

OBSERVED (SKIN `info.ini`, `layout.xml`):

- Skins: `TV 1920X1080` (1920x1080) and `TV 3840X1080` (3840x1080), manager priority 1.
- Forms (rotations): Landscape (0, display offset 12,12 inside the bezel), Portrait (270), Reverse Portrait (180), Reverse Landscape (90).
- Context menu entries and shortcuts: Detailed Info Ctrl+Shift+F1; Always on Top Ctrl+Shift+T; Move Ctrl+Shift+M;
  Scale Ctrl+Shift+= / Ctrl+Shift+- with factors 100, 75, 50, 25 (default 50); Controller Ctrl+Shift+K; Screen Shot Ctrl+Shift+F12;
  Force Reboot Ctrl+Shift+Del; Control Panel Ctrl+Shift+P; Close Ctrl+Shift+F4.
- Button rectangles for every key exist in the controller XMLs but are tied to Samsung's bitmap art; they were intentionally not transcribed.

## 4. Device templates

OBSERVED (EMRES `devices/HD1080-TV.xml`, `HD3840-TV.xml`):

| Template | Resolution | Type | Profile | Version | Screen | Skin shape | RAM | CPUs |
|---|---|---|---|---|---|---|---|---|
| HD1080 TV | 1920x1080 | standard | tv | 1.0 | 32 inch | square | 512 MB | 4 |
| HD3840 TV | 3840x1080 | standard | tv | 1.0 | 32 inch | square | 512 MB | 4 |

VM template defaults (EMRES `template/x86-standard.xml`): resolution 1920x1080, density 254 dpi, CPU 4, RAM 1024 MiB,
max touch points 10, hwVirtualization on, hwGLAcceleration on, GL version `v2.0_v3.0`, logging NONE, display mode qtEnable on,
network NAT (`netConnectType`), `useDHCP` off, proxy mode auto, tuner system ATSC / country USA / table `tuner_default.cfg`. OBSERVED.

UI option templates: RAM 512/768/1024; resolutions 1920x1080@254, 1080x1920, 2560x1080; input device Touch; network NAT or Bridge. OBSERVED.

Tuner table template (`tuner-template/tuner_default_template.cfg`): one row per RF channel, format
`<antenna> <Stop|Play> <Air|Cable> <modulation> <channel> <frequency Hz>`; default rows are Air 8VSB channels 2..13
(57000000 .. 213000000 Hz). OBSERVED. Only relevant if we ever emulate `tizen.tvchannel`/tuner.

## 5. Guest hardware list used for a TV VM (context only)

OBSERVED (EMPLUG option builders; QEMU device names): machine `maru-x86-machine`; devices `virtio-maru-esm-pci`,
`virtio-maru-hwkey-pci`, `virtio-maru-evdi-pci`, `virtio-maru-motor-pci`, `virtio-maru-keyboard-pci`,
`virtio-maru-touchscreen-pci,max_point=N` or `virtio-maru-tablet-pci`, `maru-external-input-pci`, `maru-virtual-tuner`
(`system=`, `country=`, `table=`, `stillimg=`), `maru-tuner-decoder`, `maru-dtv-audio`, `maru-brightness`, `maru-camera`,
`maru_brill_codec`, graphics `vigs` (`backend=gl|sw`, `wsi=`) and `yagl`; network `virtio` NIC in user (NAT) or tap mode;
other virtio-maru devices present in the binary: sensor, nfc, jack, power, vmodem, rotary.
None of this needs to be reproduced by an own-runtime emulator.

## UNKNOWNS

- Guest-side translation from these codes to web `keyCode`/`key` values (lives in the guest image, not analysed).
  Section 2.4 comes from public documentation recalled from memory and must be verified.
- Which host keyboard keys Samsung binds to remote keys by default.
- Long-press timing threshold.
- Button geometry was deliberately not captured.
