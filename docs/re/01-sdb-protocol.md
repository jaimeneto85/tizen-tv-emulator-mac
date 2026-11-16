# 01 - SDB wire protocol (behavioural spec for a fake emulator endpoint)

Clean-room notes. Static analysis only; nothing here is copied code. Every claim is tagged
**OBSERVED** (with source) or **INFERRED**.

Sources:

- `SDB` = `~/tizen-studio/tools/sdb` (Mach-O x86_64, sha256 `05db410d...`, symbols present,
  banner "Smart Development Bridge version 4.2.36"). Addresses are virtual addresses in that file.
- `SDBLIB` = `org.tizen.common.sdblib_2.0.0.202505130743.jar` (Java client used by the `tizen` CLI).
- `QEMU` = `emulator-x86_64` of `tv-samsung-emulator-qemu-x86_2.8.0.38` (strings + symbol-level disassembly).

sdb is a fork of Android adb. One binary is both the CLI client and the host server (daemon).
The piece we must implement is the **device side** ("sdbd"), reachable over TCP on localhost.

## 1. Topology and ports

| Port | Proto | Who listens | Purpose | Tag |
|---|---|---|---|---|
| 26099 | TCP 127.0.0.1 | sdb host server | smart-socket requests from clients (`sdb` CLI, Tizen CLI/sdblib). Override: env `SDB_SERVER_PORT` | OBSERVED (SDB `_sdb_main` 0x1000012c0, constant 0x65f3; SDBLIB `SDB_DEFAULT_PORT`) |
| 26097 | TCP 127.0.0.1 | sdb host server | "qemu" listener: emulator pushes `host:sync:<serial>:<d>` state notifications | OBSERVED (SDB constant 0x65f1; QEMU string `%04xhost:sync:%s:%01d`) |
| 26101, 26111, ... 26241 | TCP 127.0.0.1 | **emulator (us)** | device transport. sdb server tries to connect to each of these 15 ports at start-up (step 10) | OBSERVED (SDB `local_init` -> `_local_connect`) |
| N+2 (26103 for N=26101) | UDP 127.0.0.1 | emulator ("sdb noti server") | sdb server sends datagrams after connecting a local transport | OBSERVED (SDB `notify_qemu`/`notify_sensord`; QEMU "bind port[127.0.0.1:%d/udp] for sdb noti server") |

Naming rule: a local transport connected on port N gets serial **`emulator-<N>`** (e.g. `emulator-26101`).
OBSERVED (SDB `_local_connect` 0x100004b60). Maximum 15 local transports ("Too many emulators"). OBSERVED.

### 1.1 How the server discovers us

Three independent ways, any one is sufficient:

1. **Boot scan** - when the sdb server starts it connects to 127.0.0.1:26101..26241 step 10. OBSERVED.
   If our endpoint is already listening, it is picked up with no further action.
2. **Announce** - a client sends the host request `host:emulator:<port>[:<name>]` to 26099; the server then
   connects to 127.0.0.1:`<port>` ("new emulator is in"). OBSERVED (SDB host service table).
   INFERRED: this is what a booting emulator does so an already-running server learns about it; our runtime
   should send it after it starts listening (and should start the server first with `sdb start-server` if 26099 is closed).
3. **Manual** - `sdb connect <host>[:<port>]` (default port 26101, format `%s:26101`), serial becomes `host:port`.
   Timeout env `SDB_CONNECT_TIMEOUT`. OBSERVED. Note: serial is then NOT `emulator-*`, so the Tizen CLI
   will not classify it as an emulator by serial prefix (see doc 02).

### 1.2 UDP notifications sent by the server to port N+2

After registering the transport, the server sends, best effort (errors ignored):

- `"5\n<serial>\n"` (notify_qemu) - the real emulator records the serial of the sdb client ("Added new sdb client ... serial").
- `"2\n"` (notify_sensord) - legacy.

OBSERVED (SDB). A fake emulator may ignore both, or not bind the UDP port at all. INFERRED (send failures are not fatal:
the transport is registered before the datagram is sent).

### 1.3 Device name shown in `sdb devices`

Priority: (a) name passed in `host:emulator:<port>:<name>`; (b) device name token from the CNXN banner (section 3);
(c) SysV shared memory segment with key `port-1` (26100) holding a path containing `/vms/<vmname>/`; fallback `<unknown>`.
OBSERVED (SDB `_local_connect`). Recommendation: provide the name through (a) and (b); do not bother with shm.

### 1.4 Suspend notification (26097)

Smart-socket framed text `host:sync:<serial>:<c>` where `<c>` is one digit. `0` and non-`0` toggle the transport's
"suspended" state. OBSERVED (format); exact polarity INFERRED. Optional for us.

## 2. Client <-> server smart-socket protocol (port 26099)

Only relevant if we want to talk to the server ourselves (announce, debugging). The device side never sees it.

- Request: 4 ASCII hex digits (payload length) + payload, e.g. `000Chost:version`. OBSERVED (SDB, SDBLIB `%04X`).
- Reply: `OKAY` or `FAIL` + `<4 hex len><message>`. Query-style services reply `OKAY<4 hex len><data>`.
- Host services: `host:version` (returns `major.minor.patch`), `host:kill`, `host:devices`, `host:track-devices`,
  `host:emulator:<port>[:<name>]`, `host:connect:<host>[:<port>]`, `host:disconnect:<..>`, `host:remote_emul`,
  `host:serial-match:<..>`, `host:get-serialno`, `host:get-state`, `host:get-remote-id:%d:%d`,
  `host:forward:...`, `host:killforward:...`, `host:forward-remove:...`, `host:forward-remove-all`, `host:forward-list`,
  `host:encryption:on|off|status`, `host:extcmd:...`. Prefixes `host-serial:<serial>:...`, `host-usb:`, `host-local:`, `host-any:`. OBSERVED.
- Selecting a device: `host:transport:<serial>` (also `transport-any`, `transport-usb`, `transport-local`), then on the same
  socket send the device service string (`shell:...`, `sync:` ...); after `OKAY` the socket is a raw byte pipe to that service. OBSERVED.
- `host:devices` / `host:track-devices` payload lines: `<serial>\t<state>\t<name>\n`. OBSERVED (SDBLIB DeviceMonitor).
  `sdb devices` prints header `List of devices attached` and rows formatted `%-20s %-10s %s`. OBSERVED.
- State names: `offline`, `bootloader`, `device`, `host`, `recovery`, `sideload`, `no permissions`, `locked`,
  `unknown`, `suspended`, `unauthorized`. OBSERVED.
- Error texts: `device offline (x)`, `device locked`, `unknown host service`. OBSERVED.

## 3. Transport protocol (server <-> device, the part we implement)

### 3.1 Packet

24-byte little-endian header followed by payload. OBSERVED (SDB transport thread; buffer of 0x40030 bytes).

| Offset | Field | Notes |
|---|---|---|
| 0 | command | u32 magic, see table |
| 4 | arg0 | u32 |
| 8 | arg1 | u32 |
| 12 | data_length | u32, <= 0x40000 (256 KiB) |
| 16 | data_check | u32, sum of payload bytes (unsigned) |
| 20 | magic | u32, `command XOR 0xFFFFFFFF` |

| Command | Value (LE u32) | ASCII | Tag |
|---|---|---|---|
| CNXN | 0x4e584e43 | "CNXN" | OBSERVED |
| AUTH | 0x48545541 | "AUTH" | OBSERVED |
| OPEN | 0x4e45504f | "OPEN" | OBSERVED |
| OKAY | 0x59414b4f | "OKAY" | OBSERVED |
| WRTE | 0x45545257 | "WRTE" | OBSERVED |
| CLSE | 0x45534c43 | "CLSE" | OBSERVED |
| STAT | 0x54415453 | "STAT" | OBSERVED (Tizen specific: lock state) |
| ENCR | 0x40682018 | n/a | OBSERVED (Tizen specific: encryption negotiation) |

The host validates magic and (INFERRED, as in adb) the checksum; always fill both correctly.

### 3.2 Handshake

1. TCP accept. Host sends `CNXN(arg0 = 0x00100000 version, arg1 = 0x40000 max payload, data = "host::\0")`. OBSERVED.
2. Device replies `CNXN(arg0 = version, arg1 = max payload, data = banner)`. Host uses `min()` of both sides for each. OBSERVED.
3. Banner parsing on the host (OBSERVED):
   - Text before the first `:` selects the state: `device` -> online, `bootloader`, `recovery`, `sideload`; anything else -> host/offline.
   - If the banner contains `ro.product.model`, it is split on `;` and the model value becomes the device name (adb style).
   - Otherwise it is split on `::` into three tokens `<state>::<device_name>::<locked>`. Token 2 becomes the device name
     unless it is `unknown`. Token 3 equal to `1` marks the device `locked`.
   - **Recommended banner: `device::<VMName>::0`** (NUL terminated). INFERRED from the parser.
4. No AUTH: a device that never sends `AUTH` is online immediately. `AUTH(arg0=1)` from the device triggers host-side
   signing and the `unauthorized` state - do not send it. OBSERVED.
5. `STAT(arg0=1)` from the device at any time -> locked; other values -> online. OBSERVED. Not needed.
6. `ENCR` (sub-steps 0..5: hello/ack/off/status/fail) is only used when the user runs `sdb encryption on`, and the Java side
   only cares when capability `secure_protocol` is `enabled`. Not needed if we report it `disabled`. OBSERVED/INFERRED.

### 3.3 Streams (identical to adb)

- `OPEN(arg0 = host local id, arg1 = 0, data = "<service>\0")`.
- Device accepts with `OKAY(arg0 = device local id, arg1 = host local id)` or refuses with `CLSE(arg0 = 0, arg1 = host local id)`.
- Data: `WRTE(arg0 = sender id, arg1 = receiver id, payload)`; each WRTE must be acknowledged by the peer with
  `OKAY(arg0 = own id, arg1 = peer id)` before the next WRTE is sent on that stream.
- Close: `CLSE(arg0 = own id, arg1 = peer id)` from either side. A shell service signals completion by closing.

OBSERVED (SDB packet handler), semantics INFERRED equal to adb where not individually traced.

## 4. Device services

Service strings the host side can open (OBSERVED in SDB strings/handlers and SDBLIB constants):

| Service | Used by | Behaviour expected from the device |
|---|---|---|
| `shell:` | `sdb shell` | interactive pty shell |
| `shell:<command>` | everything | run command, stream stdout+stderr as raw bytes, then close |
| `eshell:<rows>:<cols>` | `sdb shell` when supported | interactive shell with window size |
| `shellconf:syncwinsz:%d:%d:%d` | `sdb shell` | window-size update (only if capability `syncwinsz_support` enabled) |
| `sync:` | `sdb push/pull`, sdblib SyncService | file sync sub-protocol (section 5). SDB also uses `sync:pull` for pulls |
| `capability:` | both | capability blob (section 4.1) |
| `root:on` / `root:off` | `sdb root`, sdblib | text reply; a reply containing `Permission denied` means failure |
| `sysinfo:` | sdblib PlatformInfo | `key:value` text with `model_name`, `platform_name`, `platform_version`, `profile_name` |
| `boot:` | sdblib | reply `1` when boot completed |
| `tzplatformenv:<VAR>` | sdblib | value of a tizen platform path variable |
| `appcmd:<verb>:<args...>` | sdblib ApplicationCmdService | see doc 02 |
| `tcp:<port>` | port forward target | connect to device-local TCP port (needed for Web Inspector forwarding) |
| `grantfile:%d`, `encryption:`, `cs:` (crash report), `reverse:...` | rarely | may be refused with CLSE |

### 4.1 `capability:` reply

Wire format: 2-byte little-endian length (max 4095), followed by that many bytes of text made of `key:value\n` lines.
OBSERVED (SDB capability reader; SDBLIB PlatformCapability parser).

Keys read by SDBLIB `PlatformCapability` (OBSERVED, complete list of its constants): `secure_protocol`, `rootcmd_support`,
`zone_support`, `multiuser_support`, `cpu_arch`, `profile_name`, `vendor_name`, `device_name`, `can_launch`, `platform_version`,
`product_version`, `sdbd_version`, `sdbd_plugin_version`, `rootonoff_support`, `sdbd_rootperm`, `sdk_toolpath`,
`pkgcmd_debugmode`, `appcmd_support`, `duid`, `appid2pid_support`, `shell_support`.
Additional keys read by the native `sdb` client (OBSERVED, SDB strings): `syncwinsz_support`, `encryption_support`.
Values are `enabled` / `disabled` / `unknown` or free text. Unknown keys are ignored by both parsers (INFERRED: map lookup).

`sdb capability` prints the blob verbatim; the real emulator itself shells out to `sdb -s emulator-<port> capability` and looks for `secure_protocol`. OBSERVED (QEMU strings).

Which values matter is decided in doc 02 (they select the install/run code path).

## 5. File sync sub-protocol (inside a `sync:` stream)

All integers little-endian u32. Requests are `<4-char id><u32 length>` followed by `length` bytes. OBSERVED (SDB sync client, SDBLIB SyncService/FileEntry*Stream; constants `SYNC_DATA_MAX = 65536`, `REMOTE_PATH_MAX_LENGTH = 1024`).

| Request | Payload | Device reply |
|---|---|---|
| `STAT` | remote path | 16 bytes: `STAT`, mode, size, mtime. mode 0 = does not exist |
| `LIST` | remote dir | repeated `DENT`, mode, size, mtime, namelen + name (name <= 256); terminated by `DONE` + 16 zero bytes |
| `SEND` | `<remote path>,<mode decimal>` | none yet; host then sends `DATA`+len+bytes chunks (<= 64 KiB each), then `DONE`+mtime; device answers `OKAY`+0 or `FAIL`+len+message |
| `RECV` | remote path | `DATA`+len+bytes ... then `DONE`+0, or `FAIL`+len+message |
| `QUIT` | length 0 | none; stream closes |

Notes:

- The push flow from both clients is: `STAT` the destination (to learn whether it is a directory), then `SEND`. OBSERVED.
- If the destination is a directory the client appends the local basename itself. OBSERVED (SDB).
- SDBLIB encodes paths as ISO-8859-1 for `SEND`. OBSERVED.
- `sdb push` prints progress / "pushed" summary lines produced by the client, not the device. OBSERVED.

## 6. Minimal behaviour for `sdb devices`, `sdb shell`, `sdb push`

1. Listen on 127.0.0.1:26101 (or the next free 261x1). Optionally announce with `host:emulator:26101:<VMName>`.
2. Answer CNXN with banner `device::<VMName>::0`, version 0x00100000, max payload 0x40000.
3. Implement OPEN/OKAY/WRTE/CLSE with per-stream flow control.
4. Implement `shell:<cmd>`, `shell:`, `sync:`, `capability:`, `sysinfo:`, `boot:`, `root:on|off`, `tcp:<port>`.
5. Ignore/accept UDP on 26103.

## UNKNOWNS

- Whether the host verifies `data_check` for every packet in this build (assumed yes, as adb of that era).
- Exact reply text of `root:on` / `root:off` on a real TV emulator (only the failure marker `Permission denied` is known).
- Exact reply format of `tzplatformenv:` and `sysinfo:` framing (plain text vs length-prefixed) - not traced; SDBLIB
  parses `sysinfo:` like the capability blob (INFERRED from the shared parser, not confirmed).
- Polarity of the `host:sync:<serial>:<digit>` suspend flag.
- `eshell:` / `shellconf:` exact pty framing (only needed for a polished interactive `sdb shell`).
- ENCR negotiation details (deliberately not analysed).
- Nothing here was verified against a live sdb server; all of it is static analysis.
