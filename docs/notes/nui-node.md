# Node side of the .NET (`.tpk`) support

- `packages/tpk` reads and extracts `.tpk` archives; `packages/wgt` stores them next to web apps
  with `kind: 'tpk'` after checking that the main UI application is .NET, has an app id, and that
  its `exec` is a file inside `bin/`.
- `packages/host/src/nui-runtime.ts` owns one runtime session: a loopback TCP listener, the
  `dotnet Tvemu.NuiHost.dll` child, and the relay between the child and the renderer page.
  Only the first connection that presents the session token is accepted; any other connection is
  dropped. Every way a session ends (app exit, socket close, crash, `terminate`, host stop) goes
  through the same shutdown: SIGTERM, then SIGKILL after a short grace period.
- `launch` and `terminate` are serialized by the host, so overlapping requests from the CLI, the
  remote UI and the sdb bridge cannot leave two runtimes alive.
- `packages/nui-renderer` is a display only: scene operations become absolutely positioned DOM
  nodes. Natural sizes are measured in layout space (CSS transforms excluded) and re-measured
  when the other dimension or the visibility changes.

Not verified: video playback through the `player` messages with real media, and the rendering of
anything beyond what the test fixtures and two real applications exercise.
