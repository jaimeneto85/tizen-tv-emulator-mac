# Brief: .NET NUI runtime (`dotnet/`)

Goal: an UNMODIFIED Samsung TV `.tpk` of type `dotnet` / `dotnet-nui` must run on macOS (arm64,
.NET SDK 9.0.300, runtime 9.0.5 only) inside tvemu. You own everything under `dotnet/` and
`docs/notes/nui-runtime.md`. Do not edit anything else. Other agents are building the Node side
(`packages/*`) against `docs/nui/protocol.md` at the same time; that file is the contract, do not
change it (record change requests in your notes file).

Read first: `docs/nui/protocol.md`, `docs/nui/reference-app-api.md`, `docs/briefs/COMMON.md`
(rules about comments, credentials, no git writes apply; the TypeScript rules do not).

## Approach

1. **Shim assemblies** with the real simple names (`Tizen.NUI`, `Tizen.Applications.Common`,
   `Tizen.Applications.Preference`, `Tizen.Log`, `Tizen.Multimedia`, `Tizen.Multimedia.MediaPlayer`,
   `Tizen.System.MediaKey`, plus `Tizen`, `Tizen.System.Information`, `Tizen.NUI.Components` if you
   get to them), written from scratch in C#, exposing the same namespaces, type shapes (class vs
   struct, base types, nested types), member signatures and enum numeric values as the real API,
   so that an app compiled against the real reference assemblies binds to them at run time.
2. **`Tvemu.NuiHost`** (net9.0 console): `Tvemu.NuiHost --app-dir <extracted tpk> --exec <App.dll>
   [--data-dir <dir>]`. It loads the app assembly from `<app-dir>/bin` in a custom
   `AssemblyLoadContext` that resolves `Tizen*` to the shims, framework assemblies to the default
   context, and everything else to the app's `bin`, then invokes the assembly entry point (it is
   usually a private static `Main`). The app targets net6.0 or netstandard2.0-era facades
   (`System.Runtime 4.2.1.0`); both must load on the 9.0 runtime.
3. The shim keeps the scene and speaks the protocol to the Node host (`TVEMU_NUI_ENDPOINT`,
   `TVEMU_NUI_TOKEN`). Without those variables it runs in **standalone mode**: every outgoing
   message is printed to stdout as NDJSON and incoming messages are read from stdin. This is how
   you test without Node.
4. `Application.Run` owns the single UI thread: it processes host messages, `Tizen.NUI.Timer`
   ticks, posted callbacks, then flushes one `frame`. Nothing in the scene may be touched off it.

## Fidelity rules

The API is open source: TizenFX (github.com/Samsung/TizenFX, Apache-2.0) and DALi
(github.com/dalihub). You have network access; READ those sources to learn real behaviour, and
cite file paths in `docs/notes/nui-runtime.md` for every behaviour you rely on. Do not copy their
implementation (ours is a different architecture anyway); signatures and enum values are facts
you must match exactly. Reference assemblies are also on this machine for automated comparison:
`~/.nuget/packages/tizen.net.api11/11.0.0.18033/ref/net6.0/*.dll` and
`~/.nuget/packages/tizen.net.api5/5.0.0.14629/ref/netstandard2.0/*.dll` (do not copy them into the
repo, do not reference them from the shipped projects; tests may read them when present).

Behaviours that MUST be right because apps depend on them (research each, do not guess):

- Key event routing order and consumption: `Window.KeyEvent`, the focused view's `View.KeyEvent`
  (bool return = consumed), bubbling to parents, and what `FocusManager` does on arrow keys when
  the view did or did not consume the event (`Left/Right/Up/DownFocusableView`,
  `SetFocusFinderRootView`, default algorithm, `FocusGroup`, focus indicator).
- `Key.KeyPressedName` / `KeyCode` values on a Samsung TV for every `RemoteKey` in
  `packages/protocol/src/index.ts` (X keysym names: `Left`, `Return`, `XF86Back`, ...). Tables in
  `docs/re/06-websimulator-keys-lifecycle-config.md` §3.5 and `docs/re/07-tv-image-web-runtime.md`
  list keysyms for web key names. Mark any name you could not confirm as UNVERIFIED in the notes.
- `Tizen.System.MediaKey.Event` semantics (which keys, reservation).
- Default `PivotPoint`/`ParentOrigin`/`PositionUsesPivotPoint` of a NUI `View` and therefore the
  origin of `Scale`; default size of a `View`/`TextLabel` without explicit size; `Size2D` vs
  `Size`, `Position2D` vs `Position`; `Opacity`; draw order of siblings; `Show/Hide`.
- `TextLabel.PointSize` to pixels on a TV (font DPI). Make the DPI a profile-driven setting
  (`welcome.profile` may carry `nuiDpi`; default from your research) and mark it UNVERIFIED if you
  cannot find the TV value.
- `ImageView` loading: `ResourceUrl`, `ResourceReady`, `LoadingStatus`, `SynchronousLoading`,
  the `Image` property map path (`Visual.Property.Type`, `ImageVisualProperty.URL`).
- Borders: `BorderlineWidth/Color/Offset`, `CornerRadius`, and the property-map path
  (`Visual.Type.Border`, `BorderVisualProperty`), `ClearBackground`.
- `TextField`: `Text`, `TextChanged`, placeholder, `HiddenInputSettings`, `InputMethodSettings`,
  `GetInputMethodContext().Activate()/Deactivate()` -> `ime` op; text typed by the user arrives as
  a `text` message and must raise `TextChanged`.
- `Tizen.Multimedia.Player` state machine and exceptions (Idle/Ready/Playing/Paused, what throws
  in which state), `PrepareAsync` (both overloads), `SetPlayPositionAsync`, `StreamInfo`,
  `PlaybackCompleted`, `ErrorOccurred`, `Display(Window)` (underlay semantics: is the video
  behind the window and does the app need a transparent background?). Map to protocol `player`
  messages; keep position/duration/state cached from host events so getters are synchronous.
- `Preference` persisted as a JSON file under the data dir. `Application.Current.DirectoryInfo`
  (`Resource`, `SharedResource`, `Data`, `Cache`, ...) mapped to the extracted package
  (`res/`, `shared/res/`) and the data dir. Lifecycle: `OnCreate`, `OnResume` after create,
  `OnPause`/`OnResume` on `lifecycle` messages, `OnTerminate` on `terminate` or `Exit()`.
- Dispose semantics (`Dispose()`, `Dispose(DisposeTypes)`, `DisposeRecursively`), `BaseHandle`
  equality operators with null.

## Scope

- **Tier 1 (mandatory):** every `M`/`T`/`BASE` line of `docs/nui/reference-app-api.md`, plus the
  obvious siblings an app author would reach for next: getters for every setter, `Remove`,
  `Children`/`GetChildAt`/`ChildCount`, `Show/Hide/Visibility`, `Size`/`Position`/`SizeWidth`/
  `SizeHeight`/`PositionX`/`PositionY`, `Name`, `Parent`, `TextLabel` alignment/ellipsis/font
  properties and `PixelSize`, `Window.Size`/`WindowSize`/`GetDefaultLayer`, `Layer`,
  `Animation` (`AnimateTo` on position/size/opacity/scale with duration; implement by ticking on
  the UI loop and emitting `set` ops; `Finished`), `Timer.Interval`, all `Tizen.Log` levels,
  the full `Preference` API, `Tizen.System.Information.TryGetValue` for common keys.
- **Tier 2 (only if Tier 1 is complete and tested):** `View.Layout` with `LinearLayout`,
  `GridLayout`, `FlexLayout`, `AbsoluteLayout` computed in C# using `measure` messages for text;
  `ScrollableBase`; `Tizen.NUI.Components` basics.
- Anything not implemented must fail loudly and helpfully, never silently: see the inspector.

## Tools you must also deliver

- `Tvemu.NuiHost inspect <App.dll or app dir> [--json]`: reads the app's metadata
  (`System.Reflection.Metadata`, no extra NuGet packages) and lists every referenced `Tizen*`
  type/member as `supported` / `missing`, by resolving it against the built shim assemblies
  (exact signature match). Exit code 0 when nothing is missing, 2 otherwise. The Node host runs
  this before launching an app.
- A conformance test: for every public member the shims expose, when the reference assemblies
  above exist on the machine, assert the real API has that member with the identical signature,
  and identical enum values/base types (skip with a clear message when the files are absent).
- A sample app in `dotnet/samples/HelloTv` (compiled against the shims) used by tests: a focusable
  grid, a text field, an image, a timer, Back to exit.
- Tests WITHOUT third-party NuGet packages (the user's global NuGet.Config has a private feed that
  breaks restore; add a local `dotnet/NuGet.Config` with `<clear/>` + nuget.org and depend only on
  what is already in the SDK). A console test runner project that exits non-zero on failure is
  fine. Cover: loader binding, key routing, focus movement, timer, frame batching, preference
  round trip, player state machine with scripted host events, lifecycle, inspector, conformance.
- `dotnet build dotnet/Tvemu.sln -c Release` must produce `dotnet/artifacts/nui-host/` containing
  `Tvemu.NuiHost.dll` and all shim assemblies (that folder is what the Node host launches with
  `dotnet <path>/Tvemu.NuiHost.dll`). `dotnet/artifacts`, `bin`, `obj` are git-ignored via a
  `dotnet/.gitignore`.

## Acceptance (run these for real and report the output)

Two real packages, extracted, are on this machine (do NOT copy them into the repo):
`<extracted-packages>/tpk-net6` (Tizen.NET 11 build) and `<extracted-packages>/tpk-legacy` (Tizen.NET 5 build).

1. `inspect` reports zero missing members for the app assembly of both.
2. Standalone run of each: the app starts, `ready` is emitted, frames describe a login screen
   (a field for e-mail, a field for password, buttons). Its `res/account.json` points to
   `https://example.invalid`, so network calls fail; the app must show its own error state, not
   crash the runtime.
3. Feeding `key` messages on stdin moves focus between the fields/buttons (`focus` ops change),
   `text` messages change field text, and Back on the root screen leads to the app's exit dialog
   or exit.
4. All your tests green.

Write `docs/notes/nui-runtime.md`: architecture, coverage table (type/member: implemented / stub /
missing), every researched behaviour with its source citation, and everything UNVERIFIED.
