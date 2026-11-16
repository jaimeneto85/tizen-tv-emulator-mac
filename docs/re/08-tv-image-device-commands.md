# 08 - Tizen 10 TV emulator image: sdbd services and device-side commands

Behavioural spec recovered by **static** inspection of the Samsung TV emulator disk image
(`tv-samsung-10.0-x86_64/emulimg-10.0.x86_64`, see doc 07 for image layout and method). Nothing from the image was executed.
Clean-room: names, formats, constants and defaults only; no vendor function bodies, no vendor files.

- Tags: **OBSERVED** = read from the named file / symbol / string. **INFERRED** = deduced, not directly read.
- Binaries inspected: `/usr/sbin/sdbd` (built from `sdbd-3.0.50`, has symbols), `/usr/lib64/libsdbd_plugin.so` (Samsung TV plugin),
  `/usr/bin/wascmd`, `/usr/bin/app_launcher`, `/usr/bin/pkgcmd`, `/usr/bin/wgt-backend`, `/etc/tizen-platform.conf`, systemd units.
- Method: `strings`, ELF table decoding with stdlib Python, `objdump` disassembly, and REA/Hopper pseudocode for seven sdbd/plugin functions (sessions closed).

## 4. Device commands

### 4.1 How the host's commands reach them (OBSERVED: command table in `libsdbd_plugin.so`)

The host does not run arbitrary shell on a TV image. `shell:` requests of the form `0 <verb> [args]` are looked up in a fixed table and rewritten to a real command line. Each row: verb, command template, argument count, flags. In a debug build an unmatched command is passed through unchanged (OBSERVED branch in `_convert_shell_cmd`); in a non-debug build it is replaced by a fixed fallback whose text was not decoded (INFERRED: rejected). See 4.6. The `vd_applist` row is INFERRED.

| Verb | Rewritten to | Args |
|---|---|---|
| `vd_appinstall` | `/usr/bin/wascmd -i %s -p %s` | 2 (app id, package path) |
| `vd_appuninstall` | `/usr/bin/wascmd -u %s` | 1 |
| `was_execute` | `/usr/bin/wascmd -r %s` | 1 |
| `was_kill` | `/usr/bin/wascmd -t %s` | 1 |
| `vd_applist` | (handled in-plugin: `wascmd -l` equivalent) | 0 |
| `appinstall` | `/usr/bin/pkgcmd -i -t %s -p /home/owner/share/tmp/sdk_tools/%s -q -G` | 2 (pkg type, file name) |
| `appuninstall` | `/usr/bin/pkgcmd -u -n %s` | 1 |
| `runcheck` | `/usr/bin/pkgcmd -C -n %s` | 1 |
| `kill` | `/usr/bin/pkgcmd -k -n %s` | 1 |
| `getappinstallpath` | `/usr/bin/pkgcmd -a` | 0 |
| `execute` | `/usr/bin/app_launcher --start %s` | 1 |
| `debug` | `/usr/bin/app_launcher --start %s --web-debug` | 1 |
| `execute_log` | `/usr/bin/app_launcher -v -s %s` | 1 |
| `launchercheck` | `/bin/ls /usr/bin/app_launcher` | 0 |
| `getduid`, `getduidgadget` | `/usr/bin/buxton2ctl get system db/comss/hwduid \| awk '{print $5}'` | 0 |
| `mkdir` | `/bin/mkdir -p /tmp /home/owner/share/tmp/sdk_tools/tmp` | 0 |
| `rmfile` | `/bin/rm -f` of `/home/owner/share/tmp/sdk_tools/tmp/*.wgt`, `.../sdk_tools/*.tpk`, `*.wgt`, `*.rpm` | 0-1 |
| `getvmname` | `/bin/cat /proc/cmdline \| /bin/grep 'vm_name' \| /usr/bin/wc -l` | 0 |
| `uname` | `/bin/uname -m` | 0 |
| `getsize` | `/usr/bin/du -bs %s 2> /dev/null` | 1 |
| `getdate` | (in table; template not decoded) | |
| `clock_gettime` | `/bin/cat /proc/uptime` | 0 |
| `get_user_home` | `/usr/bin/id -un` | 0 |
| `setRWIAppID` | `/usr/bin/buxton2ctl set-string system db/rwi/inspected_appid %s` | 1 |
| `showlog_level` | `/usr/bin/dlogutil -v %s ConsoleMessage:*` | 1 |
| `showlog_service` | `/usr/bin/logger-mgr --filter ConsoleMessage %s;/usr/bin/dlogutil -v time ConsoleMessage %s` | 2 |
| `memoryMonitor` | `/usr/sbin/sdbd_webapp_memory.sh -q %s -p %s -f` | 2 |
| `capture_emulator` | `/usr/bin/emuld_capture %s` (D-Bus `org.tizen.emuld.capture.Capture` / `RequestCapture`) | 1 |
| `naclDebugOn` / `naclDebugOff` | `/usr/bin/buxton2ctl set-bool system db/nacl/debug 1` / `0` | 0 |
| `tpkviewerlaunch` | `/usr/bin/launch_app com.samsung.tv.built-in-app-info-viewer vs_debug on` | 0 |
| `enableboost` / `disableboost` | `/usr/bin/dotnet-run-ni.sh --vsboost` / `--vsclean` | 0 |
| `hyperuart_vddebugmenu`, `hyperuart_getdtvlogd` | vendor debug helpers | 0 |
| `vs_sdkinstall`, `vs_sdkversion`, `vs_sdkremove`, `vs_debug_new`, `vs_sdklink`, `vs_sdkgcdump`, `vs_sdktrace`, `vs_sdklogremove`, `vs_sdkdump`, `vs_sdkstack`, `vs_profiler_log_remove`, `showlog_em`, `profiler_trace_start/stop/show`, `profiler_port_check` | .NET / Visual Studio tooling, templates built by callbacks | n/a |

Additional OBSERVED facts
- Other plugin string templates: `/usr/bin/wascmd -i %s -p /home/owner/share/tmp/sdk_tools/%s -G` (debug-mode install with a *file name relative to the SDK tools dir*), `/usr/bin/app_launcher -l`, secure log verb `0 app_log`.
- Root-flagged rows are prefixed with `echo IsRootCmd > /dev/null;` before execution.
- A status suffix can be appended to the rewritten command: `;echo cmd_ret:$?`; the success marker the host looks for is the literal line `cmd_ret:0`.
- WAS readiness: the plugin waits for `/run/was_ready` (vconf `memory/was/was_ready`) and prints `Waiting for ready to work...`, `Work is queuing. Don't stop the process.`, or `Process is not ready, exited.`

### 4.2 Paths (OBSERVED `/etc/tizen-platform.conf` unless noted)

| Purpose | Path |
|---|---|
| SDK push / tmp dir (`TZ_SDK_TOOLS`, also `sdk_toolpath` capability) | `/home/owner/share/tmp/sdk_tools` (physically `/opt/usr/home/owner/share/tmp/sdk_tools`), sub-dir `tmp/` created by `mkdir` |
| SDK user / home | `TZ_SDK_USER_NAME=owner`, `TZ_SDK_HOME=/home/owner`; sdbd sets `HOME=/home/owner` |
| Global RW apps (`TZ_SYS_RW_APP`) | `/opt/usr/apps` |
| Read-only preloaded apps (`TZ_SYS_RO_APP`) | `/usr/apps` |
| Per-user apps (`TZ_USER_APP`) | `${HOME}/apps_rw` -> `/home/owner/apps_rw` (physically `/opt/usr/home/owner/apps_rw`) |
| Web content inside a package | `<pkg root>/res/wgt/` (`config.xml` at `res/wgt/config.xml`), shared: `<pkg root>/shared/res` (strings in `wgt-backend`) |
| Package manifests | `TZ_SYS_RW_PACKAGES=/opt/share/packages`, `TZ_SYS_RO_PACKAGES=/usr/share/packages` |
| Debug port constant | `TZ_SYS_DEBUG_PORT=9222` |
| Emulator shared dir | `/tmp/.emulator/apps` (plugin string) |
| sdbd log dir | `/home/owner/share/sdbdlog`; capability `log_path` reports `/tmp` |

`pkgcmd -a` prints exactly one line: `Tizen Application Installation Path: %s` (OBSERVED format). Value **INFERRED** `/opt/usr/apps` when run with the global flag/root and `/opt/usr/home/owner/apps_rw` (shown as `/home/owner/apps_rw`) for the `owner` user - the host tools only use it to build the app's on-device path, so either answer must be consistent with where the fake device says the app lives.

### 4.3 `wascmd` (OBSERVED strings in `/usr/bin/wascmd` and the embedded copy in the plugin)

Usage banner: `WAS Command Version: 1.0`. getopt string of the plugin copy: `i:u:r:t:lp:G`.

| Invocation | Meaning |
|---|---|
| `wascmd -i <app_id> -p <package path> [-G]` | install (`-G` debug mode; `-d <install_dir>` also documented in an example: `wascmd -i 111299001912 -d install_dir`) |
| `wascmd -u <app_id>` | uninstall |
| `wascmd -r <app_id>` | launch |
| `wascmd -t <app_id>` | terminate |
| `wascmd -l [-k <app_id>]` | list apps / one app |
| `wascmd -c <code> [-k <appid or runtitle>]` | service codes 104, 105, 108, 109, 111, 114, 115, 117, 118, 124-127, 200, 201, 300-302 (only in the standalone binary) |
| `wascmd -all` | all apps |

Progress / result lines (printf formats, one per line):

| Phase | Format |
|---|---|
| install | `app_id[%s] install start` -> `app_id[%s] downloading[%d]` -> `app_id[%s] download completed` -> `app_id[%s] installing[%d]` (percent) -> `app_id[%s] install completed` |
| install errors | `app_id[%s] download canceled`, `app_id[%s] download failed[%d]`, `app_id[%s] install failed[%d]` (binary) or `app_id[%s] install failed[%d, %d], reason: %s : %s` (plugin copy) |
| launch | `app_id[%s] launch start` -> `app_id[%s] launched` (binary also has `app_id[%s] showed`); error `app_id[%s] launch failed[%d]`; already running: `app_id[%s] resumed` / `app_id[%s] resume failed[%d]` |
| terminate | `terminate app %s` (plugin echo), `app_id[%s] terminated`; error text `terminate app failed` |
| uninstall | `app_id[%s] uninstall start` -> `app_id[%s] uninstalling[%d]` -> `app_id[%s] uninstall completed`; errors `app_id[%s] uninstall failed[%d]` (plugin) / `app_id[%s] uninstall failed` (binary), `can not uninstall app`, `uninstall app failed` |
| misc | `package_path %s`, `uninstall %s`, `get app list...`, `unknown command %s`, `unknown command %d`, `was get app info failed`, `launch app failed`, `get app list failed`, trailer `spend time for wascmd is [%d]ms` |

List output (`-l`): per app one block of lines shaped `--------------<field name padded to 38 chars>=%s-------------`, i.e. for the first field
`--------------app_id                                =%s-------------`. Field order OBSERVED at least: `app_id`, `app_index`, `app_title`, `app_installed_path`, `app_panel_icon_path`, `app_version`, `install_date`, `app_tizen_id`, `app_package_name`, `app_widget_category`, `app_runtitle`, `type`, `app_size`, `use_count`, ... then a summary `apps count: %d` (plugin copy) or `All apps count: %d` / `WAS apps count: %d` / `BuiltIn apps count: %d` (binary).

`<app_id>` for wascmd is the WAS id; for SDK-installed apps it is the Tizen application id from config.xml (`<package>.<name>`) - INFERRED from the host flow in doc 02; the example id in the usage text is the numeric store id `111299001912`.

### 4.4 `app_launcher` (OBSERVED strings, GOption based)

Options: `-s/--start <appid>`, `-k/--kill`, `-t/--terminate`, `-r/--is-running`, `-S/--status`, `-l/--list` ("Show installed application list"), `-d/--debug` ("Activate debug mode"), `-w/--web-debug` ("Activate web debug mode, Use only for webapps"), `-f/--fast-start` (deprecated), `-q/--direct-start`, `-v` (used by `execute_log`). Long names OBSERVED; short letters for is-running/status/direct-start INFERRED from the open-source tool.

| Situation | Output format |
|---|---|
| normal launch | `... successfully launched pid = %d with debug %d` |
| launch with `--web-debug` | `... successfully launched pid = %s with debug 1 port: %s` (port = inspector port chosen by WRT) |
| failure | `... launch failed` |
| app unknown | `The app with ID: %s is not available for the user %d` |
| is-running | `result: running` / `result: not running`; `result: App isn't running` |
| kill / terminate | ` Kill appId: %s (%d)` / ` Terminate appId: %s (%d)` |
| list | header `Application List for user %u`, column titles ` Name ` / ` AppID `, rows `'%s'` then ` '%s'`; running list uses ` appId (PID)` and rows `  %s (%d)` |

The host parses the web-debug line for `port: <n>` and then forwards that TCP port (doc 02); the fake device must print the line in exactly this shape.

### 4.5 `pkgcmd` (OBSERVED strings)

Banner `Package Manager Tool Version: %s`; `Usage: pkgcmd [options]`. Options: `-i/--install`, `-u/--uninstall`, `-r/--reinstall`, `-w/--mount-install`, `--clear-all`, `--clear-cache`, `-g/--getsize`, `-T/--getsize-type`, `-x/--getsizeinfo`, `-l/--list`, `-s/--show`, `-a/--app-path`, `-C/--check`, `-k/--kill`, `-d/--descriptor`, `-p/--package-path`, `-n/--package-name`, `-t/--package-type`, `-T/--move-type`, `--global`, `--uid`, `-e/--tep-path`, `-M/--tep-move`, `-G/--debug-mode`, `-D/--deactivate`, `-A/--activate`, `-S/--skip-optimization`, `-R/--reg-updateinfo`, `-U/--unreg-updateinfo`, `-E/--uninstall-res`, `-q` (quiet).

| Situation | Output format |
|---|---|
| `-a` | `Tizen Application Installation Path: %s` |
| `-C -n <pkgid>` | `Pkgid: %s is Running` / `Pkgid: %s is Not Running` |
| `-k -n <pkgid>` | `Pkgid: %s is Running` then kill; errors `Failed to get appinfo[%s]` |
| `-s` / `-l` rows | `pkg_type [%s]`, `pkgid [%s]`, `name [%s]`, `version [%s]`, `storage [%s]` |
| install progress | open-source format `__return_cb req_id[%d] pkg_type[%s] pkgid[%s] key[%s] val[%s]` (INFERRED - the literal was not found by the grep used; treat as unverified for this build) |
| failure | `processing result : %s [%d] failed` with reason texts such as `Signature error`, `Check certificate error`, `Manifest error`, `Privilege error`, `Parsing error`, `Unzip error`, `Icon error`, `Configuration error`, `Application directory error`, `Register application error`, `Security error`, `General error`, `Undefined Error`; `package is not installed` |
| trailer | `spend time for pkgcmd is [%d]ms` |

Installer back end: `/etc/package-manager/backend/wgt -> /usr/bin/wgt-backend` (+ `libvd-wgt-installer.so` for the TV steps). Signature level messages: `Check config.xml| - Current certificate signature level = %s||`.

### 4.6 Build mode seen by the plugin

OBSERVED: the plugin's `is_debug()` logs `BUILD_MODE defiend` then `BUILD_MODE is not debug` and returns false, although `/etc/prd_info.ini` says `BuildType=debug`. Consequences (INFERRED from the capability switch, 5.2): `intershell_support` and `rootonoff_support` are reported `disabled`, raw `shell:` commands are filtered through the verb table, and `sdb root on` answers `Permission denied`.

## 5. sdbd

### 5.1 Start-up and transport (OBSERVED)

- Unit `/usr/lib/systemd/system/sdbd.service`: `User=sdk`, `Group=sdk`, `Type=notify`, `EnvironmentFile=-/run/sdbd-env`, `ExecStart=/usr/sbin/sdbd $SDBD_CMDLINE`, pid file `/tmp/.sdbd.pid`.
- `/usr/lib/systemd/system-generators/sdbd-env-generator` builds, from `/proc/cmdline`:
  `SDBD_CMDLINE="--emulator=<vm_name>:<sdb_port> --connect-to=10.0.2.2:26099 --sensors=10.0.2.2:<sdb_port + 3>"`.
- Socket unit `sdbd_tcp.socket`: `ListenStream=26101` (guest side). The host maps `<sdb_port>+1` -> guest 26101 (INFERRED from doc 04's port scheme; guest port OBSERVED).
- On start sdbd connects to the host sdb server (`10.0.2.2:26099`) and announces itself with `host:emulator:%d:%s` (port, vm name); the alternative for network devices is `host:connect:%s:%d`.
- Connection banner template `%s::%s::%d` (INFERRED fields: `device::<device name>::<flag>`; the capability-style banner is assembled in `send_device_status` / `parse_banner`).
- Services recognised (string table): `shell:`, `eshell:`, `sync:`, `root:`, `reverse:`, `forward:`, `sysinfo:`, `capability:`, `boot:`, `shellconf:`, `syncwinsz:`, `tzplatformenv:`, `grantfile:`, `appcmd:`, `extcmd:`.

### 5.2 `capability:` (OBSERVED via `get_capability` / `init_capabilities` in sdbd and `get_plugin_capability` in the plugin)

Framing: **2-byte little-endian length N**, then N bytes of text, then the stream is closed. N = text length + 1. The text is a sequence of `key:value\n` lines (format `%s:%s` + newline) in the fixed order below, followed by the plugin's "extra" lines.

| # | Key | Value on this image | How obtained |
|---|---|---|---|
| 1 | `secure_protocol` | `enabled` | plugin id 10000, constant (OBSERVED) |
| 2 | `intershell_support` | `disabled` | plugin id 10001: `enabled` only in debug build (value INFERRED, see 4.6) |
| 3 | `filesync_support` | `pushpull` | plugin id 10002, constant (OBSERVED) |
| 4 | `usbproto_support` | `disabled` | plugin id 10003, constant (OBSERVED) |
| 5 | `sockproto_support` | `enabled` | plugin id 10004, constant (OBSERVED) |
| 6 | `syncwinsz_support` | `enabled` | sdbd constant (OBSERVED) |
| 7 | `sdbd_rootperm` | `disabled` | sdbd constant (OBSERVED) |
| 8 | `rootonoff_support` | `disabled` | plugin id 10005: `enabled` only in debug build (value INFERRED) |
| 9 | `encryption_support` | `disabled` | plugin id 10012, constant (OBSERVED) |
| 10 | `zone_support` | `disabled` | system-info `tizen.org/feature/container` = false (OBSERVED input, INFERRED text) |
| 11 | `multiuser_support` | `enabled` | `enabled` when the default user is `owner` (OBSERVED rule + conf) |
| 12 | `cpu_arch` | `x86_64` | `http://tizen.org/feature/platform.core.cpu.arch` (special case: `armv8` on a 32-bit userland is reported as `armv7l`) |
| 13 | `core_abi` | `x86_64` | `http://tizen.org/feature/platform.core.abi` |
| 14 | `sdk_toolpath` | `/home/owner/share/tmp/sdk_tools` | `TZ_SDK_TOOLS` |
| 15 | `profile_name` | `tv` | `http://tizen.org/feature/profile` |
| 16 | `vendor_name` | not determined (`unknown` if the lookup fails) | `http://tizen.org/system/manufacturer` - not in model-config.xml |
| 17 | `can_launch` | `tv-samsung` | plugin id 10006, constant (OBSERVED) |
| 18 | `device_name` | `Tizen` | vconf `db/setting/device_name`, re-read on every request |
| 19 | `platform_version` | `10.0` | `http://tizen.org/feature/platform.version` |
| 20 | `product_version` | `4.0` | plugin id 10008, format `%d.%d` with 4, 0 (OBSERVED) |
| 21 | `sdbd_version` | `2.2.31` | sdbd constant, format `%d.%d.%d` with 2, 2, 31 (OBSERVED) |
| 22 | `sdbd_plugin_version` | `3.8.12` + suffixes | plugin id 10007: `%d.%d.%d` (3, 8, 12) then tags from the set `_TV`, `_EM`, `_DBG`, `_REL`; exact concatenation INFERRED `3.8.12_TV_EM_REL` |
| 23 | `sdbd_cap_version` | `1.0` | sdbd constant (OBSERVED) |
| 24 | `log_enable` | `disabled` | plugin id 10009 (OBSERVED) |
| 25 | `log_path` | `/tmp` | plugin id 10010 (OBSERVED) |
| 26 | `appcmd_support` | `disabled` | plugin id 10011 (OBSERVED) |
| 27 | `appid2pid_support` | `enabled` | `/usr/bin/appid2pid` exists and is executable (OBSERVED file 0755; INFERRED text) |
| 28 | `pkgcmd_debugmode` | `enabled` | plugin id 10013 is not handled by the plugin; sdbd falls back to `enabled` (OBSERVED) |
| 29 | `netcoredbg_support` | `disabled` | `enabled` only if `/usr/share/aul/dotnet.debugger` contains `NETCOREDBG`; file absent (INFERRED text) |
| 30 | `architecture` | `64` | pointer size of the sdbd build (OBSERVED) |
| extra | `platform_build_version` | `10.0` | plugin extra capability line `platform_build_version:10.0\n` (OBSERVED) |

Fallback rule (OBSERVED): when a plugin lookup fails, boolean-style keys become `disabled` and string-style keys become `unknown`.

Note: `appcmd_support:disabled` means the host must use the `shell:0 <verb>` path of 4.1, not `appcmd:`.

### 5.3 `sysinfo:` (OBSERVED `get_platforminfo`)

Reply: a fixed **320-byte (0x140) binary record**, no length prefix, then close. Five consecutive 64-byte NUL-padded C strings:

| Offset | Field | Value on this image |
|---|---|---|
| 0 | platform info version | `2.2.0` (constant) |
| 64 | model name | `Emulator` (`http://tizen.org/system/model_name`) |
| 128 | platform name | `Tizen` (`http://tizen.org/system/platform.name`) |
| 192 | platform version | `10.0` - queried with key `tizen.org/feature/platform.version` (no `http://` prefix) |
| 256 | profile name | `tv` - queried with key `tizen.org/feature/profile` |

Any failing lookup yields the string `unknown`. Whether the prefix-less keys resolve in this system-info build was not verified, so offsets 192/256 may be `unknown` on the real guest (UNKNOWN 3).

### 5.4 `root:` (OBSERVED `rootshell_service`)

Argument is the text after `root:`. Reply is plain text, no framing, then close.

| Request | Condition | Reply |
|---|---|---|
| `root:on` | `rootonoff_support` is `enabled` | `Switched to 'root' account mode\n` |
| `root:on` | otherwise (this image) | `Permission denied\n` (the first 16 bytes `Permission denie` are OBSERVED; tail INFERRED) |
| `root:on` | already root | nothing |
| `root:off` | currently root | `Switched to 'sdk user' account mode\n` |
| `root:off` | not root | nothing |
| anything else | | `Unknown command option : %s\n` |

### 5.5 `tzplatformenv:` (OBSERVED `get_tzplatform_env`)

Argument is a tizen-platform variable name (e.g. `TZ_SDK_TOOLS`). Reply is plain text, no framing, then close:

- success: `0` immediately followed by the value (format `%d%s`), e.g. `0/home/owner/share/tmp/sdk_tools`;
- variable known but empty/unavailable: `1`;
- unknown variable name: `2`.

### 5.6 `boot:` (OBSERVED `get_boot`)

Polls an internal "booting done" flag (set from a D-Bus signal) up to 10 times with a short sleep. Reply: the single character `1` when boot is complete, otherwise an empty reply; then close.

### 5.7 `appcmd:` (OBSERVED names; reported unsupported by capability)

Verbs: `install`, `uninstall`, `appinfo`, `packageinfo`, `packagelist`, `appinstallpath`, `runapp`, `rununittestapp`, `killapp`, `debugwebapp`, `debugnativeapp`. Result framing strings: `appcmd_returnstr`, `appcmd_exitcode`, `%s:%s:%s:%d:%d`, `%s:%d`. Not needed for a TV fake device because `appcmd_support:disabled`.

## UNKNOWNS

1. `vendor_name` value (manufacturer key is not in model-config.xml; comes from another system-info plugin or resolves to `unknown`).
2. Exact `sdbd_plugin_version` suffix composition and whether `is_debug()` can be true on this image at run time (it is compiled to false).
3. Whether `sysinfo:` platform version / profile resolve or return `unknown` (prefix-less keys).
4. `pkgcmd -a` actual value for user `owner` vs. global, and the literal install-progress line format in this build.
5. Final on-device directory of an SDK-installed TV web app (`/opt/usr/apps/<pkgid>` vs `/opt/usr/home/owner/apps_rw/<pkgid>`): decided at run time by WAS/pkgmgr, not readable statically.
6. Complete `wascmd -l` field list after `use_count`, and the numeric error codes inside `install failed[%d]` / `launch failed[%d]`.
7. `getdate` and `vd_applist` rewritten forms; templates of the `vs_*` verbs.
8. Banner fields of `%s::%s::%d` and the auth/secure-protocol handshake behind `secure_protocol:enabled` (see doc 01).
9. `shellconf:`, `grantfile:`, `extcmd:`, `eshell:` request/reply formats (names only).
10. Behaviour of `app_launcher --web-debug` port selection (WRT picks the inspector port and returns `{port}`; allocation rule not traced).
