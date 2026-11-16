# 04 - Emulator Manager, VM model, port map and ECS/ECP control channel

Clean-room notes from static analysis. Tags: **OBSERVED** (source) / **INFERRED**.

Sources:

- `EMLIB` = `emulator-manager_2.6.60/data/tools/emulator/bin/em-lib.jar` (package `org.tizen.emulator.manager`)
- `EMCLI` = `.../em-cli.jar` (package `org.tizen.emulator.manager.console`)
- `EMPLUG` = `tv-samsung-emulator-manager-resources_10.0.0/.../plugins/em-plugin-tv-samsung.jar`
- `ECPPLUG` = `tv-samsung-emulator-control-panel-devices_10.0.1/.../plugins/ecp-plugin-tv-samsung-10.0.jar` + `.xml`
- `QEMU` = `tv-samsung-emulator-qemu-x86_2.8.0.38/.../emulator/bin/emulator-x86_64` (sha256 `e6858168...`; strings, symbols,
  and disassembly of `_init_sdb_and_vm_base_port`, `_get_vm_base_port`, `_get_vm_spice_port`), plus `emulator.sh`
- `SDB` = native sdb (see doc 01)

## 1. Port map of one emulator instance

Base port search (QEMU `_init_sdb_and_vm_base_port`, OBSERVED): the emulator tries candidates starting at base **26100**,
step **10**, staying below 26200 (so bases 26100, 26110, ... 26190 = at most 10 instances; beyond that it aborts with
"It seems too many emulator instances are running on this machine"). A candidate is accepted when a TCP listen socket can be
bound on **base+3**; message "TCP port %u is aleady occupied" otherwise.

| Port | Proto | Direction | Meaning | Tag |
|---|---|---|---|---|
| base+0 (26100) | - | - | the "VM base port"; identity of the instance; also the SysV shm key sdb reads for the VM path | OBSERVED (QEMU "Emulator base port is %u"; SDB shmget key = port-1) |
| base+1 (26101) | TCP | host -> guest 26101 | user-net host forward to the guest's sdbd. This is the port the sdb server connects to; serial `emulator-<base+1>` | OBSERVED (hostfwd add, guest constant 0x65f5) |
| base+2 (26102) | TCP | host -> guest 26102 | second host forward (guest 0x65f6); purpose not confirmed (historically gdbserver/emuld) | OBSERVED (forward) / INFERRED (purpose) |
| base+3 (26103) | TCP | listener in emulator | the socket kept as the instance lock; used by ECS as its listening socket (`ecs.c` asserts the base socket is valid) | OBSERVED (bind) / INFERRED (it is the ECS port) |
| base+3 (26103) | UDP 127.0.0.1 | listener in emulator | "sdb noti server": receives the datagrams sdb sends to (sdb port + 2) | OBSERVED (QEMU string + SDB sender) |
| 26099 | TCP | sdb server | client requests | doc 01 |
| 26097 | TCP | sdb server | emulator -> server `host:sync:<serial>:<d>` | doc 01 |

Other facts (OBSERVED, QEMU strings):

- The kernel command line receives `sdb_port=<n>`, `vm_resolution=<w>x<h>`, plus `vm_name=...`, `host_ip=...`, proxy settings.
  This is why the Tizen CLI probes `/proc/cmdline` for `vm_name` (doc 02).
- `get_vm_spice_port` also returns base+3 (spice is not used in normal runs).
- Device serial inside the emulator = `emulator-<base+1>`; the emulator itself shells out to the SDK's sdb:
  `sdb -s emulator-%d get-state`, `... capability` (looks for `secure_protocol`), `... root on|off`, `... shell id -un`,
  `... shell 0 get_user_home`, `... push ...` (for add-on packages from `emulator-images/add-ons` into
  `/opt/usr/apps/tmp/sdk_tools/` or `/tmp/.emulator/apps/`), `... shell "mount -o remount,rw /"`.
- Emulator Manager's own free-port probe (EMLIB `PortHelper.getPortNo`): for base in 26100..26190 step 10, try to bind a TCP
  server socket on **base+1**; first success wins; -1 if none. OBSERVED.

Implication for a replacement: listen on 127.0.0.1:26101 (sdb transport). Binding 26103/TCP as well makes Samsung's own
emulator skip base 26100 and avoids two instances fighting over `emulator-26101`. INFERRED.

## 2. Emulator Manager data model

OBSERVED (EMLIB `FilePathResources`, `InternalFindSDKPath`, `VMProperty`, `LaunchConfig`, `HelperClass`):

- SDK location comes from `sdk.info` (keys `TIZEN_SDK_INSTALLED_PATH`, `TIZEN_SDK_DATA_PATH`, `JDK_PATH`), default
  `~/tizen-studio` and its data dir.
- Path segments used: `<sdk>/platforms/tizen-<ver>/<profile>/emulator-images`, `.../emulator-resources/{skins,template,plugins,devices}`,
  `<sdk>/platforms/tizen-<ver>/common/emulator/{bin,data/{bios,kernel},etc,images}`, `<sdk>/tools/emulator/bin`,
  `<sdk-data>/emulator/vms/<vmname>/`, `<sdk-data>/emulator/{sdcard,swap}`, logs dir. (Composition INFERRED from the segment list.)
- Per-VM files: `vm_config.xml` (JAXB `EmulatorConfiguration`), `vm_launch.conf` (sections `[[VARIABLES]]`, `[[SKIN_OPTIONS]]`,
  `[[QEMU_OPTIONS]]`), `logs/emulator.log`, `logs/emulator.klog`, `emulator-connect.log`, disk image `emulimg-<vmname>.<arch>`
  (QEMU: "vm_name and image_file_name is not matched"), `swap.img`, a `.lock` file while running.
- VM name rules: non-empty, max length enforced, characters `A-Za-z0-9-_` only, unique, some reserved names. OBSERVED.
- Default MAC `52:54:00:12:34:56` (randomised per VM), default DNS/host `10.0.2.2` (QEMU user-net), guest static IP option
  `ip=<addr>::<gw>:<mask>::eth0:none:<dns>`. OBSERVED.

### 2.1 Launch

- `VMLauncher` runs `<...>/emulator/bin/emulator.sh` (`emulator.cmd` on Windows) with `--conf <vm_launch.conf>`, optional `-j <java path>`,
  optional acceleration flag (`-enable-hax`, `-enable-whpx`), then `--` and extra QEMU args. OBSERVED.
- `emulator.sh` sets `VIGS_SYNC_READ_PIXELS=1` and execs `emulator-x86_64 "$@"`; with no args it falls back to
  `$HOME/.emulator_default.conf`. OBSERVED.
- Binary usage: `emulator-x86_64 {-c|--conf} conf_file [--<key> <value>]... [{-q|--qemu} <QEMU_ARGS>...]`. Conf variables include
  `vm_name`, `skin_path`, `vms_path`, `image_ver`, `platform_version`, `host_ip`. OBSERVED.
- Running detection: `/bin/ps -ef | grep emulator-x86` and matching the VM name in the command line, plus the lock file monitor. OBSERVED.
- Bridged networking uses `emulator-sdb-connect.sh` with the guest IP (then sdb reaches the device via `sdb connect`). OBSERVED (names only).

### 2.2 `em-cli` commands

OBSERVED (EMCLI classes + `climessages.properties`): `list-vm [-d] [-c] [-p <platform>] [-P <profile>]`,
`list-platform [-P profile]`, `list-template [-P ...]`, `create -n <name> [-p <platform>] [-t <template>] [-c|-a <image path>]`,
`modify -n <name> [-t <template>] [-f <shared dir>]`, `launch -n <name> [-p <emulator-path>] [-- qemu args]`,
`delete -n <name>`, `delete-all`, `reset -n <name>`, `detail [-n <name>]`, `create-baseimage`, plus `remote-*` variants.
Empty list message: "VM list is empty". Platform ids look like `tv-samsung-10.0` / `mobile-2.4`, templates like `HD1080-TV`.

A replacement does not need em-cli unless we want Tizen Studio's Emulator Manager window to list it; the `tizen`/`sdb` CLIs
only see the sdb transport. INFERRED.

## 3. ECS / ECP control channel (high level)

ECS = Emulator Control Server inside the emulator process; ECP = Emulator Control Panel (JavaFX app, started from the skin menu with
`vm_name=`, `platform_version=`, `profile=`, `base_port=` or legacy `vmname=`/`base.port=`). OBSERVED (QEMU strings).

### 3.1 Messages

Protobuf (protobuf-c in QEMU, `org.tizen.ecp.msg.genmsg.ecs.Ecs` in Java), package `ECS`. OBSERVED (QEMU descriptor names):

- Envelope `Master` with `type` (enum `Master_Type`) and one optional sub-message per type:
  `CHECKVERSION_REQ/ANS`, `KEEPALIVE_REQ/ANS`, `INJECTOR_REQ/ANS/NTF`, `DEVICE_REQ/ANS/NTF`, `MONITOR_REQ/ANS/NTF`,
  `NFC_REQ/NTF`, `EVENTCAST_REQ/ANS/NTF`.
- Field names seen: `version_str`, `errcode`, `time_str`, `category`, `length`, `group`, `action`, `data`, `errstr`, `errmsg`.
- Injector/Device requests are addressed by `(category string, group int, action int, data bytes)`.
- Monitor requests carry a QEMU monitor command wrapped in JSON (`JsonUtil.encodeMonitorString`); replies are JSON.
- Framing: a fixed-size length header precedes each serialized `Master` ("insufficient header size", "payload size").
  INFERRED 4-byte length; byte order not confirmed.
- A second protobuf package `eventcast` (HandShakeReq/Ans, EmulatorState, AppState, StartReq/Ans, SetEventStatus, EventMsg,
  EventTerminate, SetSensorStatus, SensorData, SensorMsg, Resolution, DisplayMsg, TouchMaxCount, TouchData, HWKeyMsg with
  HWKeyType MENU/HOME/BACK/POWER/VOLUME_UP/VOLUME_DOWN) serves the remote "event cast" feature. OBSERVED (names only).

### 3.2 What the TV control panel can inject

OBSERVED (ECPPLUG descriptor XML, `*Constants` classes and call sites of `MessageSender`):

| Panel (CLI command) | Channel | Category | group / action constants | Purpose |
|---|---|---|---|---|
| AppServer (`appserver`) | Injector | `AppServer` | status: group 15, action 124; set: group 200, action 0/1/2 = Operating / Development / Developing | choose which Samsung app-server environment the TV uses |
| Network (`network`) | Device + Monitor | `Network` | status group 0 action 123; port-forward group 0 action 0 with data | link up/down via monitor `set_link virtio-net-pci.0 on|off`, `get_link ...`, `info network`, `info usernet`; add TCP/UDP port forwards |
| VirtualUSB / HDS (`hds`) | Device | `hds` | status group 15 action 99; group 100 action 1 = mount, 2 = umount | host directory sharing, guest mount under `/mnt/host` |
| Menu (`menu`) | Injector | `menu` | group 240; actions 231/232 get/set language, 233/234 caption mode, 235/236 TTS (voice guide), 237/238 device name, 239 set clock; status 230 | TV settings. Payload tokens separated by `&!:` / `&!;`, results `sucs`/`fail` |
| Rotator (`rotator`) | Device | `rotator` | group 250, actions 251 / 252 | rotate screen (portrait TV models) |
| MemoryProfiler (`memoryprofiler`) | Injector | `mempro` | start/stop | guest memory profiling |
| Tuner (pane exists in jar, not in the 10.0 XML) | Device | `tuner` (ntf type `TUNER_DTV`) | group 0 with data | tuner table: add/remove/list/new/load/save-as, still image on/off; systems ATSC/DVB, countries KOR/USA, modulations 8VSB/QAM64/QAM256 |

Other ECS device categories handled by the emulator binary (OBSERVED, QEMU strings): `input` (key codes), `TGesture` (touch gesture),
`vminfo`, `sdcard`, `sensor`, `nfc`, `guest`, `suspend`, `boot`, `package` (add-on install via sdb push).
ECS also notifies ECP of `guest` connection state, boot completion, and suspend/lock state.

### 3.3 Relevance for a replacement

None of ECS is required for `sdb`/`tizen` workflows. If parity with the control panel is ever wanted, the useful subset is:
menu (language, caption, TTS, device name, clock), network link up/down, key input. INFERRED.

## UNKNOWNS

- ECS protobuf field numbers and the exact length-prefix format (the ECP core jar with the generated classes is not in the
  reference set; QEMU descriptors were not decoded).
- Purpose of the base+2 forward to guest port 26102.
- Exact value passed as kernel `sdb_port=` (base or base+1).
- `vm_config.xml` / `vm_launch.conf` full schema (only names and sections recorded).
- How Tizen Studio / VS Code extensions decide an emulator is "running" beyond `ps` + lock file, and whether they require
  a matching VM folder under `<sdk-data>/emulator/vms/`.
- Whether Samsung's emulator, when started alongside ours, handles a busy base+1 gracefully (it only probes base+3).
- No binary was executed; all behaviour is from static inspection.
