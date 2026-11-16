# SDB bridge compatibility

Implemented the real Tizen CLI install/run/uninstall lifecycle against a fake HostApi. Ordered capability experiments identified the secure TV command branch as the closest working match to the recovered TV image. Device identity and wire replies now follow doc 08; native SDB transport/filesystem behavior is retained. Real CLI output and limitations are recorded below. No SDK files, git history, or sibling packages were changed.

## Ordered capability experiments

1. **Generic candidate:** `secure_protocol:disabled`, `product_version:unknown`, `appcmd_support:disabled`, Samsung vendor. Install/run fail with `Cannot invoke "org.tizen.ncli.subcommands.tv.ITVSdbCmd.setPlatformCapabilityInstance(org.tizen.sdblib.PlatformCapability)" because the return value of "org.tizen.ncli.subcommands.tv.TVSdbCmdSelector.getTVSdbCmdObj()" is null`. This avoids `sdbPluginVer` but does not fall back to generic commands for this vendor. Evidence: `/tmp/sdb-path1.log`.
2. **Appcmd candidate:** enabled appcmd, nonsecure, product 4.0. All three real CLI commands exit 0 and invoke install/launch/uninstall, with uninstall receiving `TestPkg123`. `appcmd:appinstallpath:`, install, packageinfo, runapp and uninstall are implemented. Evidence: `/tmp/sdb-path2.log`.
3. **Secure TV candidate (selected default):** secure enabled, product 4.0, plugin `3.8.12_TV_EM_REL`, appcmd disabled. Install uses `0 vd_appinstall`, run uses `0 execute`. Uninstall surprisingly uses **bare** `appuninstall TestPkg123`. The first trial returned CLI exit 0 for an unknown command without uninstalling anything; adding the bare alias produced the required HostApi effect and pkgcmd success marker. Evidence: `/tmp/sdb-path3.log`, `/tmp/sdb-path3-fixed.log`.

Exit status alone is insufficient evidence for this CLI's uninstall. The integration check now requires lifecycle effects, correct distinct app/package IDs, output success markers and the bytes read by HostApi matching the original pushed WGT.

## Compatibility decisions

- Ordered capability keys match doc 08; framing is little-endian length including the terminating NUL. Host profile supplies model/platform version. Vendor is Samsung to select the TV flow; real image vendor remains unknown. Plugin suffix is the documented inference.
- Capability deviations: `syncwinsz_support` and `appid2pid_support` are disabled because these services are not implemented. Device model derives from HostApi. The fake secure command protocol does not implement authentication/encryption; encryption remains disabled.
- `sysinfo:` is exactly five NUL-padded 64-byte strings (320 bytes), without length prefix. `root:on` denies; `root:off` replies empty; unknown root options receive the documented text. `tzplatformenv:` uses numeric status prefixes, and `boot:` returns `1`.
- `sdk_toolpath` is `/home/owner/share/tmp/sdk_tools`. The real Java CLI appends `/tmp` before pushing. DeviceFiles confines all aliases under `<home>/tmp`; this path becomes `<home>/tmp/sdk_tools/tmp/fixture.wgt`. `pkgcmd -a` and WAS list paths consistently report `/home/owner/apps_rw`.
- Shell dispatch separates WAS progress/results, app_launcher launch output, and pkgcmd callback lines. The pkgcmd callback shape remains inferred in doc 08, but is accepted by the real CLI. The fake launcher reports a synthetic PID of 1.
- Supported plugin aliases cover install/uninstall/run/terminate/list/probes/cleanup. Unknown verbs remain rejected. Secure `list_showcontrol` is an observed Java request and maps to the confined listing implementation. Bare `appinstall`/`appuninstall` are accepted for the real Java generic secure branch.
- The appcmd implementation is retained from the successful second experiment, although the default capability does not advertise it.
- Filesystem traversal/symlink rejection, atomic upload staging, Latin1 Java SEND names, UTF-8 native names, packet checksums, negotiated fragmentation and ACK flow control remain unchanged. Filesystem TOCTOU against external mutation is not eliminated.
- The test owns a foreground `sdb fork-server server`, skips if port 26099 is already occupied, and only kills its own server. Runtime never executes a host shell. CLI uses the required four JAVA_TOOL_OPTIONS opens and writes logs only in tizen-studio-data.

## Exact successful real CLI output

The following is captured from `/tmp/sdb-path3-fixed.log`. Each invocation exited **0**. Each stderr contained only:

```text
Picked up JAVA_TOOL_OPTIONS: --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED
```

```text
$ ~/tizen-studio/tools/ide/bin/tizen install -n /var/folders/3n/crkhglwn0hd18xp1nprp6g980000gn/T/sdb-real-jNAy27/fixture.wgt -s emulator-26101
exit: 0
stdout:
Transferring the package...
Transferred the package: /private/var/folders/3n/crkhglwn0hd18xp1nprp6g980000gn/T/sdb-real-jNAy27/fixture.wgt -> /home/owner/share/tmp/sdk_tools/tmp
Installing the package...
--------------------
Platform log view
--------------------
app_id[TestPkg123.Test] install start
app_id[TestPkg123.Test] install completed
Installed the package: Id(TestPkg123.Test)
Tizen application is successfully installed.
Total time: 00:00:00.224

stderr:
Picked up JAVA_TOOL_OPTIONS: --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED


$ ~/tizen-studio/tools/ide/bin/tizen run -p TestPkg123.Test -s emulator-26101
exit: 0
stdout:
[Name]: Test
[Type]: wgt
[appId]: TestPkg123.Test
Launching the Tizen application...
--------------------
Platform log view
--------------------
... successfully launched pid = 1 with debug 0
Tizen application is successfully launched.

stderr:
Picked up JAVA_TOOL_OPTIONS: --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED


$ ~/tizen-studio/tools/ide/bin/tizen uninstall -p TestPkg123 -s emulator-26101
exit: 0
stdout:
--------------------
Platform log view
--------------------
__return_cb req_id[1] pkg_type[wgt] pkgid[TestPkg123] key[end] val[ok]
Total time: 00:00:00.236

stderr:
Picked up JAVA_TOOL_OPTIONS: --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED


HostApi events:
install:/var/folders/3n/crkhglwn0hd18xp1nprp6g980000gn/T/sdb-real-jNAy27/tmp/sdk_tools/tmp/fixture.wgt
launch:TestPkg123.Test
uninstall:TestPkg123
```

## Final verification and limits

`pnpm --filter @tvemu/sdb-bridge run build` exited 0 (`tsc -p tsconfig.json`). `pnpm --filter @tvemu/sdb-bridge run test` exited 0:

```text
Test Files  3 passed (3)
     Tests  16 passed (16)
```

Final strengthened run: `/tmp/sdb-final-tests.log`; complete real client transcript: `/var/folders/3n/crkhglwn0hd18xp1nprp6g980000gn/T/sdb-real-U6JnwV/real-output.txt`. Native discovery/device state, echo, push bytes and capability checks pass. Real CLI install/run/uninstall all exit 0; fake HostApi state and uploaded WGT bytes are asserted. Transport tests also exercise exact capability framing/order, binary sysinfo, root and tzplatformenv service replies. Web debugging is explicitly rejected; running-state queries do not launch apps and status suffix errors return `cmd_ret:1`.

Still not verified/supported: real Chromium launch, real signature validation/WGT installation (HostApi is fake), real TV firmware execution, authentication/encryption, TCP inspector forwarding, terminal resizing, full interactive shell or every plugin command. Listing emulation is limited and does not reproduce full `ls -lF` metadata. Debug ports cannot be returned by the current HostApi contract. Generic unknown-product Samsung CLI path still fails as described above. No claim is made that CLI exit 0 universally signals operation success. Coverage collection was attempted but unavailable because `@vitest/coverage-v8` is not installed; no dependency files were changed.

Final review corrected the short `app_launcher -w` debug alias to reject without launching. Build passed again and targeted unit/transport tests passed (15 tests); the preceding full run's 16 tests includes the real lifecycle. Read-only QA also noted an existing transport limitation: incoming writes are acknowledged before queued processing, so an uncooperative local client can queue unbounded work. Hostile-client stress and concurrent upload races are not verified.
