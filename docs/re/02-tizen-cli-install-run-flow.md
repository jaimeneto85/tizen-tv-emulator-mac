# 02 - Tizen CLI install / run / uninstall flow as seen by the device

Clean-room notes from static analysis (javap on bytecode, constants and call order only). Tags: **OBSERVED** / **INFERRED**.

Sources (`~/tizen-studio/tools/ide/lib-ncli/`):

- `CLI` = `tizen-new-cli.jar` (package `org.tizen.ncli`, entry `org.tizen.ncli.ide.shell.Main`)
- `SDBLIB` = `org.tizen.common.sdblib_2.0.0.202505130743.jar`
- `COMMON` = `org.tizen.common_2.0.0.202505130743.jar`
- `SDB` = native `~/tizen-studio/tools/sdb` (for `sdb install`)

## 1. How the CLI reaches the device

- sdblib talks to the sdb **server** on 127.0.0.1:26099 (env `SDB_SERVER_PORT`), starting it with `sdb start-server` when
  needed. It does not link the native client. OBSERVED (SDBLIB `SmartDevelopmentBridge`).
- Device list comes from `host:track-devices` (`serial\tstate\tname` lines). OBSERVED (SDBLIB `DeviceMonitor`).
- Every command opens `host:transport:<serial>` and then one device service. Shell commands are `shell:<cmd>`; output is read
  until the stream closes; default timeout 60000 ms (config key `default.sdb.timeout`). OBSERVED (CLI `TargetUtil.returnExecuteCommand`).
- `-s <serial>` matches the serial; `-t <name>` matches the device **name** column. OBSERVED (CLI `TargetUtil`).
- A device is treated as an emulator when its serial starts with `emulator-`. OBSERVED (SDBLIB `Device`).
- There is a second server flavour ("tims", port 27099, classes `org.tizen.sdb.*`); the classic path is the `*ForPrev`
  methods. Only the classic path is described here. OBSERVED (existence), not analysed further.

## 2. Probes issued when a device appears

OBSERVED (SDBLIB `Device`, `PlatformCapability`, `PlatformInfo`), order INFERRED:

| Request | Expected answer |
|---|---|
| service `capability:` | capability blob (doc 01 section 4.1) |
| service `sysinfo:` | `model_name`, `platform_name`, `platform_version`, `profile_name` |
| service `boot:` | `1` when booted |
| `shell:uname -m` (secure: `shell:0 uname`) | architecture text, e.g. `x86_64` / `i686` |
| `shell:cat /proc/cmdline \| grep 'vm_name' \| wc -l` (secure: `0 getvmname`) | `1` => emulator |
| `shell:whoami` | user name |
| `shell:/usr/bin/pkgcmd -a` (secure: `0 getappinstallpath`) | must contain a line matching `^Tizen Application Installation Path: (.*)` |
| `shell:/usr/bin/profile_command getversion` | version text (native `sdb` also issues it) |
| service `root:on` / `root:off` | any text without `Permission denied` |
| service `tzplatformenv:<VAR>` | path |

"secure" means capability `secure_protocol` == `enabled`; then every shell command is rewritten to the `0 <verb>` form.
**Report `secure_protocol:disabled`** to keep plain commands. INFERRED recommendation.

## 3. `tizen install -n <file.wgt> [-s serial | -t name]`

OBSERVED (CLI `InstallCLICommand.call` / `installPackage` / `getTVInstallCmd`). Three branches, evaluated in this order:

### Branch A - appcmd (capability `appcmd_support` == `enabled`)

1. Query destination with service `appcmd:appinstallpath:` -> package dir (reply uses the appcmd envelope below).
2. Push the file with the sync protocol into that dir.
3. Open service `appcmd:install:<typeName>:<remote package path>:<extra>` (fields joined with `:`; third field is an
   optional path such as a TEP file, empty for web apps - field order OBSERVED as type, then two more colon-separated values).
4. Reply is line oriented:
   - `appcmd_exitcode:<int>` - `0` = success.
   - `appcmd_returnstr:<text>` - result string.
   - any other line is forwarded to the user. The CLI additionally scans lines for a trailing `[ok]` token and `pkgid[...]`.

Other appcmd verbs (OBSERVED, SDBLIB `ApplicationCmdService`): `uninstall:<pkgid>`, `packageinfo:<pkgid>`
(returnstr split on `:` -> main app id, type, removable int, running int), `runapp:<appid>`, `killapp:<appid>`,
`debugwebapp:<appid>`, `debugnativeapp:...`, `rununittestapp:...`.

### Branch B - Samsung TV command table (no appcmd, vendor is a TV vendor)

Condition `isSTV`: capability `vendor_name` is in the vendor list, default `Samsung`, `HKC`, `ATMACA`, `TEMPO`
(can be extended by an IDE plugin). OBSERVED (CLI `TVSdbCmdSelector`). Applies to `.wgt` (and `.tpk` when secure).

1. Remote dir `dirPKG` = `<app install path>` + temp suffix (COMMON `TizenPlatformConstants.getAppTmpDirectory`: the path parsed
   from `pkgcmd -a`, plus `/tmp`). Related constants seen: `/home/developer/sdk_tools`, `/opt/usr/apps/tmp/sdk_tools`,
   `/opt/usr/apps/tmp/`. When capability `multiuser_support` is enabled and `sdk_toolpath` is set, tools dir = `sdk_toolpath`.
   OBSERVED (constants and call order); exact concatenation INFERRED.
2. Sync push `<file>` -> `dirPKG/<file>`. Console: "Transferring the package..." / "Transferred the package: <src> -> <dst>". OBSERVED (message keys), wording INFERRED.
3. The app id is read on the **host** from the package's `config.xml` (`tizen:application id`). OBSERVED.
4. Shell command = `TV_INSTALL_COMMAND` formatted with (appId, `dirPKG/<file>`), from the table in section 6.
5. Success criterion: **some output line contains `install completed`**; the id is extracted from `app_id[...]` on that output.
   Everything received is echoed under a `Platform log view` banner. OBSERVED.

### Branch C - generic Tizen

- secure: `appinstall <type> <path>`; otherwise `/usr/bin/pkgcmd -q -i -t <type> -p "<path>"` (variants append ` -G`;
  ` -G` is appended when the appcmd protocol version is `0.1`). OBSERVED.
- Success: a line whose last bracket token is `[ok]`; package id from `pkgid[...]`. OBSERVED.
  INFERRED example of a satisfying line: `__return_cb pkgid[AbCdEf1234] key[end] val[ok]`.

After install the temp file is removed with `shell:rm -f <path>` (secure `0 rmfile`). OBSERVED (SDBLIB SyncService delete).

### Native `sdb install <file>` (for completeness)

OBSERVED (SDB): tmp dir from capability `sdk_toolpath` (fallback: `shell:/usr/bin/pkgcmd -a | head -1 | awk '{print $5}'` + `/tmp/`),
push, then `shell:/usr/bin/pkgcmd -i -t <wgt|tpk|rpm|rpk> -p "<path>" -q` (optionally `-G`, `-S`), secure variant
`shell:0 appinstall <type> <path>`; cleanup `shell:/bin/rm -f "<path>"`; uninstall `shell:/usr/bin/pkgcmd -u -n <pkgid> -q`.
It prints pkgcmd output verbatim.

## 4. `tizen run -p <pkgid> [-s serial]`

OBSERVED (CLI `RunCLICommand.call` / `runApp`):

- If appcmd is available: `packageinfo` -> `killapp` -> `runapp`; success from `appcmd_exitcode`.
- Otherwise it first collects metadata with three shell commands (results may be empty on TV):
  - `/usr/bin/pkginfo --pkg <pkgid> | grep -i '^Label[ \t]*:'`
  - `/usr/bin/pkginfo --pkg <pkgid> | grep -i '^mainappid[ \t]*:'`
  - `/usr/bin/pkginfo --pkg <pkgid> | grep -i '^Type[ \t]*:'`
  For non-TV devices a missing label/type aborts with "cannot find app name". For TV (`isSTV` and the argument looks like an
  app id, i.e. `isAppID`) the check is skipped.
- TV launch: `TV_RUN_LAUNCH_COMMAND` formatted with the **value passed to `-p`** (so for TV it is the full app id
  `<pkgid>.<name>`); success when an output line contains **`launched`**.
- Non-TV web app: `/usr/bin/wrt-launcher --s <pkgid>.<name> --t 60000` -> expects `result: launched`; with app_launcher
  (platform version not matching `[12]\..*`): `/usr/bin/app_launcher -s <id>` -> expects `... successfully launched`.
- Native: kill with `/usr/bin/pkgcmd -k -n <id>`, then `/usr/bin/launch_app <id>` or `app_launcher -s`, expects `... successfully launched`.
- Output echoed under `Platform log view`. Final message key `RUN_SUCCESS_PACKAGE` / `RUN_FAIL_PACKAGE`.

## 5. `tizen uninstall -p <pkgid>`

OBSERVED (CLI `UninstallCLICommand`):

- appcmd available: `appcmd:uninstall:<pkgid>`.
- Removable check: `/usr/bin/pkginfo --pkg <pkgid> | grep -i Removable`, expects text containing `Removable: 1` (or `0`).
- TV: app id lookup through `TV_APPLIST_COMMAND`, output lines parsed with the regex
  `(app_id|app_tizen_id|tizen_id)(.*)=(.*)`; then `TV_UNINSTALL_COMMAND`. Invalid id -> message
  "Package ID is not valid. Please check the package ID again."
- Generic: `/usr/bin/pkgcmd -q -u -n <pkgid>`; secure `appuninstall <pkgid>`.
- Output echoed under `Platform log view`; exact success substring for TV uninstall not isolated (see UNKNOWNS).

## 6. TV command tables

Class selected at runtime: `org.tizen.ncli.subcommands.tv.` + (`SecureCmdVer` if `secure_protocol` enabled else `NonSecureCmdVer`)
+ capability `product_version` with `.` replaced by `_`; suffix `_device` when `sdbd_plugin_version` >= 3.4 and
`platform_version` starts with `4.0` and `cpu_arch` contains `armv7`. Only these classes exist: `1_0`, `2_0`, `2_1`, `3_0`,
`4_0`, `4_0_device`. **Any other `product_version` yields no command.** OBSERVED.

Non-secure (later versions inherit earlier values unless listed):

| Key | 1.0 / 2.0 / 2.1 | 3.0 | 4.0 | 4.0 device (arm) |
|---|---|---|---|---|
| TV_APPLIST_COMMAND | `/usr/bin/wascmd -l` | same | same | `/usr/bin/app_launcher -l` |
| TV_INSTALL_COMMAND | `/usr/bin/wascmd -i %s -p %s` | same | same | `/usr/bin/pkgcmd -i -t %s -p %s -q -G` |
| TV_UNINSTALL_COMMAND | `/usr/bin/wascmd -u %s` | same | same | `/usr/bin/pkgcmd -u -n %s` |
| TV_RUN_LAUNCH_COMMAND | `/usr/bin/wascmd -r %s` | same | `/usr/bin/app_launcher --start %s` | same as 4.0 |
| TV debug launch | `/usr/bin/wrt-launcher --start %s --debug` | `/usr/bin/app_launcher --start %s --web-debug` | same as 3.0 | same |

Secure: applist `0 applist` (2.1+: `0 vd_applist`), install `0 vd_appinstall %s %s`, uninstall `0 vd_appuninstall %s`,
run `0 execute %s` (2.0/2.1: `0 was_execute %s`), debug `0 debug %s`; 4.0 device: `0 appinstall %s %s`, `0 appuninstall %s`.

## 7. Recommended identity for the fake device (INFERRED design guidance)

To hit Branch B with the fewest moving parts:

```
secure_protocol:disabled
appcmd_support:disabled
vendor_name:Samsung
profile_name:tv
cpu_arch:x86
platform_version:<e.g. 10.0>
product_version:4.0
sdbd_rootperm:disabled
rootonoff_support:disabled
multiuser_support:disabled
can_launch:tv-samsung
```

Then the runtime's shell must answer:

| Command | Minimal answer |
|---|---|
| `/usr/bin/pkgcmd -a` | `Tizen Application Installation Path: /home/owner/share` (any absolute dir we map) |
| `/usr/bin/wascmd -i <appid> -p <path>` | install the pushed .wgt, print a line containing `app_id[<appid>]` and `install completed` |
| `/usr/bin/wascmd -u <appid>` | uninstall |
| `/usr/bin/wascmd -l` | lines containing `app_id = <id>` style pairs (regex above) |
| `/usr/bin/app_launcher --start <appid>` | launch, print a line containing `launched` (real devices print `... successfully launched pid = N with debug 0`) |
| `/usr/bin/app_launcher --start <appid> --web-debug` | launch in debug; real devices print `... successfully launched pid = N with debug 1 port: <P>`; the tooling then forwards `tcp:<P>` (INFERRED from public behaviour, not traced in this jar) |
| `rm -f <path>` | delete |
| `pkginfo --pkg ...` pipelines | may print nothing |

Alternative: enable `appcmd_support` and implement the appcmd envelope - cleaner, but more surface and less certain.

## UNKNOWNS

- The capability blob a real Tizen 10 TV emulator returns (cannot be read without booting it); the recommended set is
  designed from the parser, not copied from a device.
- Whether newer Tizen Studio / VS Code extension builds bypass this jar and use different commands (only this jar was read).
- Exact success-detection substring for TV uninstall and the exact text real `wascmd` prints.
- Exact third field of `appcmd:install:` and the reply envelope of `appcmd:appinstallpath:`.
- `tizen install` also runs local signature/packaging checks before talking to the device; those were not analysed.
- Debug launch flow (`tizen run` has no debug flag; debug is driven by the IDE) - port negotiation not traced.
- None of this was executed; no Samsung binary was run.

## ADDENDUM (2026-11-15) - non-secure TV branch crashes in this CLI build

OBSERVED (bytecode of `org.tizen.ncli.subcommands.tv.TVSdbCmdSelector` in `tools/ide/lib-ncli/tizen-new-cli.jar`,
and a live run against our fake device): the field `sdbPluginVer` is assigned only inside `getSecureCmdClassName()`
(from capability `sdbd_plugin_version`, first 3 characters). `getNonSecureCmdClassName()` reads that field without
assigning it, so with `secure_protocol` != `enabled` and a usable `product_version` the CLI always throws
`NullPointerException: this.sdbPluginVer is null`. Section 7's recommended identity (`secure_protocol:disabled`,
`product_version:4.0`) therefore cannot work with this CLI.

`getNonSecureCmdClassName()` returns null (no TV command class, no crash) when `product_version` is null, empty or
`unknown`. INFERRED: the CLI then falls through to Branch C (generic Tizen: `pkgcmd`, `app_launcher`).

Paths that avoid the crash, to be validated live in this order:
1. `product_version:unknown` with `secure_protocol:disabled`, `appcmd_support:disabled` -> expect Branch C.
2. `appcmd_support:enabled` -> Branch A.
3. `secure_protocol:enabled` with `sdbd_plugin_version` set -> secure TV command class (sets `sdbPluginVer`).
