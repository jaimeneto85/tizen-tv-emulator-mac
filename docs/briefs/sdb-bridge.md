# Brief: `packages/sdb-bridge` (`@tvemu/sdb-bridge`)

Read `docs/briefs/COMMON.md` first, then the two behavioural specs this package implements:
`docs/re/01-sdb-protocol.md` and `docs/re/02-tizen-cli-install-run-flow.md`.

Goal: Samsung's unmodified `sdb` and `tizen` command-line tools must see this emulator as a
running TV emulator device and be able to install, launch, and uninstall a web app on it.

Exports (all named):

- `createSdbBridge(options: { host: HostApi; port?: number; home: string; serialName?: string; log?: (line: string) => void }): SdbBridge`
- `SdbBridge`: `start(): Promise<{ port: number }>`, `stop(): Promise<void>`.

Behaviour:

- Listen on TCP `127.0.0.1:<port>` (default `SDB_DEFAULT_PORT` = 26101) and implement the device
  side of the transport exactly as specified in `01-sdb-protocol.md`: packet header, checksum,
  handshake and banner, stream open/ready/write/close with correct local/remote ids, max payload
  and fragmentation. Follow the "how the server discovers us" section so `sdb devices` lists the
  device without a manual `sdb connect`, including any UDP behaviour the spec requires.
- Services (see spec section 4): `capability:` (answer with the recommended identity from
  `02-...` section 7, filled from `host.deviceInfo()`), `shell:` (with and without a command),
  `sync:` (STAT/SEND/RECV/LIST/DATA/DONE/QUIT; files land under `<home>/tmp/` mapped from the
  device paths the CLI uses, never outside `<home>`), `appcmd:` if the spec's recommended branch
  uses it, and a polite failure for everything else.
- Shell command emulation: implement a small dispatcher for every device command the CLI flow in
  `02-...` sends for install, run, uninstall and its probes, each mapped to `HostApi`:
  install → `host.installWgt(<pushed file>)`, run → `host.launch(appId)`, kill/terminate →
  `host.terminate`, uninstall → `host.uninstall`, list → `host.listApps`. Print exactly the
  success/failure strings the CLI parses (documented in the spec). Unknown commands print
  `sh: <cmd>: command not found` and exit 127 semantics as the spec describes.
  Also support a few useful extras for humans: `ls`, `cat`, `rm`, `mkdir -p`, `echo`, `uname -a`,
  `getprop`-style queries if the spec lists them — all confined to `<home>/tmp`.
- Never execute anything on the host machine. The "shell" is an emulation, not a real shell.

Tests (Vitest):

- Unit: packet encode/decode, checksum, fragmentation, sync protocol, each shell command with a
  fake `HostApi`.
- Integration with the REAL Samsung client (skip automatically when the binary is missing):
  `~/tizen-studio/tools/sdb` is an x86_64 Mach-O that runs under Rosetta. Start the
  bridge on a free port from the range the server scans (or use `sdb connect 127.0.0.1:<port>`),
  then assert: `sdb devices` lists the device with type `emulator`/`device` as the spec predicts;
  `sdb -s <serial> shell echo hi`; `sdb -s <serial> push <local> <remote>` lands the file under
  `<home>/tmp`; `sdb -s <serial> capability`. Kill the sdb server you started when done
  (`sdb kill-server`). If port 26099 (sdb server) is already in use by someone else, do not kill it:
  report and skip.
- If you can, also drive the real Tizen CLI end to end against a fake HostApi:
  `JAVA_TOOL_OPTIONS="--add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.lang.reflect=ALL-UNNAMED" ~/tizen-studio/tools/ide/bin/tizen install -n <fixture.wgt> -s <serial>`
  and `tizen run -p <appId> -s <serial>`. Report the real output. Do not modify anything under
  `~/tizen-studio`.

Report honestly which of the real-client checks passed, failed, or were skipped, with output.
Record every deviation from the spec you had to make in `docs/notes/sdb-bridge.md`.
