# tizen-tv-emulator-mac (`tvemu`)

A clean-room, open-source Samsung Tizen TV web-app emulator for macOS, including Apple Silicon.

`tvemu` runs Tizen web applications (`.wgt`) on Chromium driven over the Chrome DevTools Protocol, with `@tvemu/tizen-api` injected before app scripts, a remote control web UI, CLI control, and an optional SDB-compatible TCP bridge on port `26101`.

## Why the Official Emulator Does Not Run on Apple Silicon

Samsung's official Tizen TV Emulator is an x86_64 QEMU virtual machine image that relies on hardware x86 virtualization. Apple Silicon (`arm64`) Macs do not provide x86 hardware virtualization, so the official emulator refuses to start on M-series Macs.

Instead of booting the Tizen OS in an x86 VM, `tvemu` runs Tizen web apps inside pinned Chromium builds (`mac-arm64` natively for newer milestones, or `mac-x64` under Rosetta 2 for older milestones such as Chromium 69) with `window.tizen` and `window.webapis` injected before page scripts.

## Requirements

- macOS on Apple Silicon (`arm64`) or Intel (`x64`), with Rosetta 2 enabled for milestones 69–85
- Node.js >= 22
- `pnpm`

## Install & Build

```bash
pnpm install
pnpm -r run build
```

Invoke the CLI via `pnpm tvemu <command>` or `node packages/host/dist/cli.js <command>`.

## Quick Start

1. Check your environment, Rosetta 2, port `26101`, `sdb`, and engine availability:

```bash
pnpm tvemu doctor
pnpm tvemu profiles
pnpm tvemu engine list
```

2. Obtain an exact Chromium engine (for example, Chromium 69 for `tizen-5.5`):

```bash
pnpm tvemu engine install 69
```

3. Install and run a `.wgt` package:

```bash
pnpm tvemu run path/to/app.wgt
```

4. Send keys, take screenshots, and stop:

```bash
pnpm tvemu key Enter
pnpm tvemu key Back
pnpm tvemu screenshot screen.png
pnpm tvemu stop
```

State (installed apps, downloaded engines, Chromium user-data directories, profile override JSONs, and `run.json`) lives in `~/.tvemu` by default. Set `TVEMU_HOME` to override it.

## Exact vs Approximate Engines

`tvemu` resolves the Chromium binary for a profile's target milestone in this order:

1. `TVEMU_CHROMIUM_<milestone>` (explicit executable path)
2. `<home>/engines/<milestone>/` (installed via `tvemu engine install <milestone>`)
3. `TVEMU_ENGINE_SEARCH_PATHS` (colon-separated directories scanned for `Chromium.app` matching the milestone in `Info.plist`)
4. Playwright cache (`~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/`)

An engine is **exact** when its `Info.plist` major milestone matches the profile's `chromiumMilestone`. When no exact build is found and a Playwright cache build is available, `tvemu` falls back to that cached Chromium (for example, Chromium 153) and makes the approximation explicit everywhere:

- `tvemu profiles` and `tvemu doctor` print `exact` or `APPROXIMATE (Chromium <real> instead of M<wanted>)`.
- `tvemu start` and `tvemu run` print a `WARNING:` line and send a `warn` entry to the remote UI console log panel.
- Passing `--strict-engine` to `tvemu start` or `tvemu run` refuses approximate engines and exits with an error telling you how to install the exact milestone.

When `--profile` is omitted, `tvemu` selects:

1. `tizen-5.5` (2020 / M69) if an **exact** M69 engine resolves;
2. Otherwise the newest profile whose **exact** engine resolves;
3. Otherwise (unless `--strict-engine` is set) the newest profile with an approximate engine.

### Getting Exact Engines

- Run `pnpm tvemu engine install <milestone>` to download and extract the Chromium snapshot from the registry into `<home>/engines/<milestone>/`.
- Or set `TVEMU_CHROMIUM_<milestone>=/path/to/Chromium.app/Contents/MacOS/Chromium`.
- Or set `TVEMU_ENGINE_SEARCH_PATHS=/dir/containing/Chromium.app`.

M69, M76, M85 and M130 have a verified SHA-256 in the registry; M94, M108 and M120 point to snapshot revisions probed via HTTP HEAD (`verified: false`, `sha256: null`).

## D-Pad & Remote Key Testing Workflow

1. Start an app with `pnpm tvemu run path/to/app.wgt` (add `--headless --no-remote` for CI/scripted runs).
2. By default, only `ArrowLeft` (37), `ArrowUp` (38), `ArrowRight` (39), `ArrowDown` (40), `Enter` (13), and `Back` (10009) are delivered to the page.
3. Other remote keys (such as `MediaPlayPause` (10252), color keys, or digits) are blocked by `@tvemu/tizen-api`'s capture-phase filter until the app calls `tizen.tvinputdevice.registerKey(name)`. Registered keys are reported to the host over the page bridge and undimmed in the remote UI.
4. Drive navigation from the remote UI window or CLI:
   - `pnpm tvemu key ArrowDown`
   - `pnpm tvemu key Enter`
   - `pnpm tvemu key MediaPlayPause`
   - `pnpm tvemu key ArrowRight --action down` (repeats after 500 ms every 100 ms until `--action up`)
   - `pnpm tvemu key Back` (apps calling `tizen.application.getCurrentApplication().exit()` return the host to the idle screen)
5. Capture the viewport at any point with `pnpm tvemu screenshot out.png` and stop with `pnpm tvemu stop`.

## Supported Profiles

| Profile Name | Model Year | Tizen Version | Chromium Milestone | Registry Arch | Resolution |
|---|---|---|---|---|---|
| `tizen-5.5` | 2020 | 5.5 | M69 (verified) | `mac-x64` (Rosetta 2) | 1920x1080 |
| `tizen-6.0` | 2021 | 6.0 | M76 (verified) | `mac-x64` (Rosetta 2) | 1920x1080 |
| `tizen-6.5` | 2022 | 6.5 | M85 (verified) | `mac-x64` (Rosetta 2) | 1920x1080 |
| `tizen-7.0` | 2023 | 7.0 | M94 | `mac-arm64` | 1920x1080 |
| `tizen-8.0` | 2024 | 8.0 | M108 | `mac-arm64` | 1920x1080 |
| `tizen-9.0` | 2025 | 9.0 | M120 | `mac-arm64` | 1920x1080 |
| `tizen-10.0` | 2026 | 10.0 | M130 (verified) | `mac-arm64` | 1920x1080 |

Every profile uses the TV user-agent format without a `Chrome/` token:

```text
Mozilla/5.0 (SMART-TV; LINUX; Tizen <ver>) AppleWebKit/537.36 (KHTML, like Gecko) <chromium version>/<ver> TV Safari/537.36
```

Default device identity fields are generic non-Samsung placeholders shaped after the emulator image (`model: "Emulator"`, `modelCode: "E-EMUL2020"`..`"E-EMUL2026"`, `firmware: "E-EMUL20WWC-0000.00"`..`"E-EMUL26WWC-0000.00"`, 12-character uppercase base32 `duid`, `locale: "en_US"`, `country: "US"`). Any `DeviceProfile` field can be overridden per profile in `<home>/profiles/<name>.json` or per invocation with `--set key=value`.

## CLI Reference

| Command | Description |
|---|---|
| `tvemu start [--profile <name>] [--scale <n>] [--headless] [--no-sdb] [--no-remote] [--strict-engine] [--set <key=value>]` | Start the emulator host in the foreground and open the remote UI window (unless `--no-remote` or `--headless`). |
| `tvemu install <file.wgt\|file.tpk>` | Install a `.wgt` or `.NET .tpk` package into the app store (detected by content; works offline or against a running instance). |
| `tvemu run <appId\|packageId\|file.wgt\|file.tpk> [--profile <name>] [--scale <n>] [--headless] [--no-sdb] [--no-remote] [--strict-engine] [--set <key=value>]` | Start the emulator if not already running, install the package if given a file, and launch the app. |
| `tvemu uninstall <packageId>` | Uninstall an app by package ID. |
| `tvemu list` | List installed apps with package kind (`wgt` or `tpk`). |
| `tvemu inspect <file.tpk\|installed id>` | Run the .NET NUI API inspector against a `.tpk` or installed `.tpk` app and report supported/missing members. |
| `tvemu profiles` | List device profiles with exact vs approximate engine status. |
| `tvemu doctor` | Check Node.js, architecture, Rosetta 2, `<home>`, port `26101`, Samsung `sdb`, `dotnet`, NUI runtime build status, and every profile's engine resolution. |
| `tvemu engine list` | List supported Chromium milestones and availability. |
| `tvemu engine install <milestone>` | Download and extract the pinned Chromium snapshot for `<milestone>`. |
| `tvemu key <name> [--action press\|down\|up]` | Send a remote key event to the running emulator. |
| `tvemu screenshot <out.png>` | Capture a PNG screenshot of the running app page. |
| `tvemu stop` | Stop the running emulator instance cleanly. |

## .NET NUI Apps (`.tpk`)

`tvemu` supports `.NET` Tizen TV packages (`.tpk` with `dotnet` / `dotnet-nui` / `dotnet-inhouse` application types) alongside `.wgt` web apps:

- **How it works:** When launching a `tpk` app, the host resolves `Tvemu.NuiHost.dll` (via `TVEMU_NUI_HOST` or `<repo>/dotnet/artifacts/nui-host/Tvemu.NuiHost.dll`), opens `/nui/` (`@tvemu/nui-renderer`) in Chromium, starts a localhost NDJSON TCP endpoint (`TVEMU_NUI_ENDPOINT` / `TVEMU_NUI_TOKEN`), and spawns the .NET runtime (`TVEMU_NUI_COMMAND`, defaulting to `dotnet`). Scene operations (`frame`) and media commands (`player`) are applied to a fixed `1920x1080` DOM stage with a `<video>` underlay, and keyboard/text/image/measure/player events flow back over the page bridge.
- **Building the .NET runtime:** Requires .NET 9 (`dotnet build dotnet/Tvemu.sln -c Release`) when the `dotnet/` runtime sources are present. `tvemu doctor` reports both `dotnet` and whether `Tvemu.NuiHost.dll` is built.
- **API Inspector:** Run `pnpm tvemu inspect <file.tpk|installed id>` (or let `tvemu run` run it automatically before launch) to inspect referenced `Tizen.*` members. Missing members are logged as warnings; launch still proceeds.
- **Limitations:**
  - **No Tizen OS:** System daemons, Linux services, and hardware platform APIs outside the shims are not present.
  - **API subset:** the runtime re-implements part of `Tizen.NUI`, `Tizen.Applications`, `Tizen.Multimedia`, `Tizen.System` and `Tizen.Log` (see `dotnet/coverage.md`). `View.Layout` layouts, `ScrollableBase` and `Tizen.NUI.Components` are not implemented yet; `tvemu inspect` lists every member an app needs that is missing.
- **`inspect` checks signatures, not behaviour.** A member reported as supported can still reject some arguments at run time (for example a `Display` with `uiSync`, a non-URI media source, or a background visual other than color/border).
- **Disposing a view does not dispose its children.** They are detached and stay usable, as on a TV; their renderer nodes live until the app disposes them.
  - **Unverified against hardware:** font DPI (96 by default, `nuiDpi` in the profile), native key codes and video playback were not compared with a physical TV.
  - **Native C/C++ `.tpk` unsupported:** `capp` / `c++app` packages require the Tizen OS and are rejected at install time.
  - **DOM approximation of DALi:** `@tvemu/nui-renderer` approximates DALi views, text, borders, images, and fields using HTML/CSS inside Chromium; subtle visual differences can occur.
  - **Fonts differ:** TV system fonts are not bundled; Chromium uses available macOS/system fonts unless the app loads its own.
  - **DRM absent:** Hardware-backed TV DRM pipelines are not implemented; video playback uses HTML5 `<video>` (and `window.Hls` if present for non-native HLS).

## Using with Samsung `sdb` and `tizen` Tools

When `@tvemu/sdb-bridge` is available and `--no-sdb` is not set, `tvemu` listens on `127.0.0.1:26101`:

```bash
sdb connect 127.0.0.1:26101
sdb devices
tizen install -n app.wgt -s emulator-26101
tizen run -p <appId> -s emulator-26101
```

If port `26101` is already occupied or `@tvemu/sdb-bridge` fails to load, `tvemu` logs a warning and continues running without the SDB bridge.

## Limitations

- **No Tizen OS:** Only the web runtime inside Chromium and the .NET NUI bridge are emulated; Tizen system daemons, kernel modules, and Linux services are not present.
- **No Native C/C++ `.tpk` Apps:** Native (`capp`/`c++app`) `.tpk` packages cannot run; only `.wgt` web packages and `.NET` `.tpk` packages are supported.
- **DRM & Hardware Media / AVPlay Limits:** Hardware-backed TV DRM pipelines and Samsung proprietary AVPlay hardware decoders are not present; media playback is limited to codecs supported by the selected Chromium build.
- **API Coverage:** Only the subset of `tizen.*` and `webapis.*` APIs implemented by `@tvemu/tizen-api` is available.
- **Approximate Engine Fidelity:** Running a profile on an approximate Playwright Chromium build instead of its exact milestone does not reproduce older CSS/JS engine quirks (such as Chromium 69 layout behavior).

## Legal

This project is an independent, clean-room implementation and is **not affiliated with, endorsed by, or sponsored by Samsung Electronics Co., Ltd.** No Samsung proprietary code, firmware, SDK binaries, or artwork/assets are included or redistributed.

Tizen is a registered trademark of The Linux Foundation.

## License

MIT
