# NUI runtime implementation notes

The managed NUI host loads unmodified Tizen application assemblies and implements the referenced platform surface in independent shims. It resolves platform references to the shims and uses a single UI loop to emit the shared NDJSON scene protocol. This allows applications built against Tizen.NET API 5 and API 11 to run without Samsung binaries in the shipped runtime.

## Architecture

`Tvemu.NuiHost` is a net9 executable. Its isolated application load context redirects `Tizen*` references to the default-context shims, resolves framework facades through .NET 9, and resolves application dependencies from the package's `bin`. It invokes private entry points, including asynchronous entry points. Inspection uses `System.Reflection.Metadata` without executing application code, compares exact member signatures and generic substitutions, and follows base types across assembly boundaries. Framework facade identities are normalized; external platform type identities and class/value-type signature encodings are retained.

`Tvemu.Runtime` owns transport, the UI thread, posted work, timers, and per-turn frame batches. Standalone input/output is NDJSON. TCP mode authenticates with the token, validates version 1, caches profile/window/locale, and returns code 3 on transport failure. Input lines and serialized output are bounded to 8 MiB. Console and Trace output become protocol logs. Opt-in `TVEMU_NUI_DIAGNOSTICS=1` also reports first-chance exceptions, including exceptions handled by the application, for diagnosing application-side failures. The synchronization context posts asynchronous continuations and marshals synchronous worker callbacks back to the UI loop.

`Application.Run` sets Current; NUIApplication runs create, ready, resume, then dispatch until exit. View trees remain managed objects; creation, property changes, ordering, reparenting, destruction, and focus become scene operations. Border overlays are private scene nodes so centered/outside borders can be represented without changing the protocol. Natural measurements update cached geometry without turning natural dimensions into explicit sizes. Timers and animations advance on the UI thread. Player events cache state/position/duration and complete asynchronous preparations/seeks on that same thread.

Preferences use typed JSON and atomic replacement beneath the data directory. No package files are rewritten. All projects use SDK assemblies only; local NuGet configuration removes the private feed. Build output is `dotnet/artifacts/nui-host/`.

## Coverage table

The detailed type/member table is [dotnet/coverage.md](../../dotnet/coverage.md). It lists every exposed type and member, plus loud restricted implementations and missing Tier 2 APIs. Signature existence does not imply hardware-equivalent behavior; the limitations below remain material.

| Surface | Status | Behavior |
|---|---|---|
| Required `reference-app-api.md` members | implemented | Both real-package metadata inspections exercise this binary surface. |
| Application/CoreApplication/DirectoryInfo | implemented | Current, lifecycle, exit, package/data/cache/shared paths, UI posting. |
| Preference | implemented | Four supported value types, keys, remove/remove-all, persistence, change contexts. |
| Tizen.Log / Console / Trace | implemented | Protocol logs; all Log levels. |
| View/Container/Window/Layer | implemented | Scene hierarchy, geometry, opacity, visibility, parent/pivot, borders, radius, disposal. |
| TextLabel/TextField/InputMethod | implemented | Text, colors, sizes, font maps, alignment, placeholders, masking, text notifications, IME operations. |
| ImageView | implemented with restrictions | Renderer acknowledgements, URL/map path, local synchronous header loading; unsupported sync formats/HTTP fail loudly. |
| FocusManager/Key/MediaKey | implemented with limits | Consumed-event bubbling, explicit neighbors, optional spatial algorithm, focus-root/group registration, key maps; hardware reservations not reproduced. |
| Timer/Animation | implemented | UI-loop ticks, intervals, duration interpolation, Finished; position/size/opacity/scale AnimateTo. |
| Player/MediaUriSource/Display/StreamInfo | implemented | State guards, media commands, acknowledgements, cancellation, cached synchronous getters, underlay display. |
| Information | implemented | Common TV/profile/network/screen keys; unknown keys return false. |
| Layouts/ScrollableBase/NUI.Components | missing | Tier 2 omitted. |

## Researched behaviors and sources

Source reading was for interface and behavioral facts, not implementation reuse. Signatures, inheritance, type shapes, method parameters, enum constants, and field flags are compared against installed Tizen.NET API11 `11.0.0.18033` and API5 `5.0.0.14629` metadata. The conformance test treats these as a union because the shim must support both generations. TizenFX links below use API11; DALi links use upstream master and are not a firmware-specific guarantee.

- **Key routing and consumption:** DALi [key-event-processor.cpp](https://github.com/dalihub/dali-core/blob/master/dali/internal/event/events/key-event-processor.cpp) emits interception, generated input, then the unconsumed key signal. [keyinput-focus-manager-impl.cpp](https://github.com/dalihub/dali-toolkit/blob/master/dali-toolkit/internal/focus-manager/keyinput-focus-manager-impl.cpp) routes the focused control then ancestors until consumed. TizenFX [WindowEvent.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Window/WindowEvent.cs) connects Window.KeyEvent to the unconsumed signal. Accordingly focused view and parents run before Window, and a consumed event does not navigate.
- **Focus:** [keyboard-focus-manager-impl.cpp](https://github.com/dalihub/dali-toolkit/blob/master/dali-toolkit/internal/focus-manager/keyboard-focus-manager-impl.cpp) uses explicit directional neighbors before optional default searching, stores root/group state, defaults the default algorithm off, and manages indicator state. [focus-finder.cpp](https://github.com/dalihub/dali-toolkit/blob/master/dali-toolkit/devel-api/focus-manager/focus-finder.cpp) defines directional rectangle candidates, beam precedence, reverse-child traversal, opacity threshold 0.01, and weighted distance `13*major²+minor²`. The managed algorithm expresses those rules using normalized directional coordinates. TizenFX [FocusManager.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Input/FocusManager.cs) exposes enable/root/group APIs. Focus is cleared when its containing subtree detaches, before disposal callbacks can access destroyed decorations. Focus transitions use a revision guard so reentrant focus callbacks cannot publish stale focus operations; targets are revalidated after callbacks.
- **TV key names:** all 52 protocol RemoteKey names are mapped from [docs/re/07-tv-image-web-runtime.md](../re/07-tv-image-web-runtime.md) section 3.3. Native TV mappings take precedence over conflicting web-simulator mappings in [docs/re/06-websimulator-keys-lifecycle-config.md](../re/06-websimulator-keys-lifecycle-config.md). Digits map to themselves; examples include Back→XF86Back, Tools→XF86SimpleMenu, Guide→XF86ChannelGuide, MediaPlayPause→XF86PlayBack. Native key-code numbers are unverified; see below.
- **Media keys:** TizenFX [MediaKey.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.System.MediaKey/Tizen.System/MediaKey.cs) reserves on first subscription and releases on last. The implementation provides process-local event subscription and maps supported media keys, with reference-matched KeyValue/KeyStatus enums.
- **Geometry/defaults:** [View.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/BaseComponents/View.cs) initializes PositionUsesPivotPoint=false, documents ParentOrigin top-left `(0,0,0.5)`, PivotPoint center `(0.5,0.5,0.5)`, zero natural size for plain views, and geometry/property conversions. Size2D/Position2D truncate managed float caches; Size/Position preserve them. Scale uses the center pivot. Parent positions and parent-origin offsets are converted to protocol top-left coordinates. Child insertion follows paint order; remove keeps objects alive. Show/Hide update visibility. [Container.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Common/Container.cs) documents recursive disposal and parenting. [BaseHandle.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Common/BaseHandle.cs) defines disposal and null-safe equality; managed handles use object identity.
- **Fonts/text:** [TextLabel.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/BaseComponents/TextLabel.cs) defines point/pixel sizes, font maps, alignment, line spacing, ellipsis, and natural text layout. DALi [font-client-plugin-impl.cpp](https://github.com/dalihub/dali-adaptor/blob/master/dali/internal/text/text-abstraction/plugin/font-client-plugin-impl.cpp) uses 72 points/inch and vertical DPI. Runtime pixels=`points*nuiDpi/72`; profile `nuiDpi` overrides the 96 fallback. Samsung TV DPI itself is unverified.
- **Images:** [ImageView.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/BaseComponents/ImageView.cs) defines Preparing/Ready/Failed and ResourceReady; SynchronousLoading applies to the next load. ResourceUrl and Image property maps both route to loading. Async completion comes from renderer image messages. Local synchronous image dimensions are extracted from PNG/JPEG/GIF/BMP headers. URL canonicalization checks every symlink component against the install directory.
- **Visual property maps and borders:** TizenFX [VisualConstants.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Visuals/VisualConstants.cs), DALi [property-index-ranges.h](https://github.com/dalihub/dali-core/blob/master/dali/public-api/object/property-index-ranges.h), [toolkit-property-index-ranges.h](https://github.com/dalihub/dali-toolkit/blob/master/dali-toolkit/public-api/toolkit-property-index-ranges.h), and [image-visual-properties.h](https://github.com/dalihub/dali-toolkit/blob/master/dali-toolkit/public-api/visuals/image-visual-properties.h) establish visual base 60000000 and type-specific start 60000101, including URL/color/size/synchronous indexes. View.cs documents BorderlineOffset -1 inside, 0 centered, 1 outside. An internal border child has expanded/contracted bounds to preserve these placements; ClearBackground clears color and border.
- **Text input:** [TextField.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/BaseComponents/TextField.cs) and [InputMethod.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Input/InputMethod.cs) define TextChanged, placeholder colors, hidden-input maps and panel layout values. User text messages update Text and notify subscribers; activation/deactivation emits ime. MaxLength truncates incoming user text.
- **Player:** [Player.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Multimedia.MediaPlayer/Player/Player.cs), [Player.Properties.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Multimedia.MediaPlayer/Player/Player.Properties.cs), [PlayerEnums.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Multimedia.MediaPlayer/Player/PlayerEnums.cs), and [StreamInfo.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Multimedia.MediaPlayer/Player/StreamInfo.cs) define state validity, preparation, cancellation, seek guards, volume/rate ranges and cached duration. Acknowledgements are accepted only in their expected requested states; stale playing/paused notifications cannot undo Stop/Pause or change Preparing, and rejected notifications cannot overwrite cached position/duration. [Display.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Multimedia/Common/Display.cs) explicitly requires transparent Window background for video underlay.
- **Application and preference:** [Application.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Applications.Common/Tizen.Applications/Application.cs), [CoreApplication.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Applications.Common/Tizen.Applications/CoreApplication.cs), [DirectoryInfo.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Applications.Common/Tizen.Applications/DirectoryInfo.cs), and [Preference.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.Applications.Preference/Tizen.Applications/Preference.cs) establish Current during Run, lifecycle hooks, paths, supported preference bool/int/double/string types, missing-key exceptions, keys and change contexts. [Information.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.System.Information/Common/Information.cs) defines generic TryGetValue behavior.
- **Timer/animation:** TizenFX [Timer.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Utility/Timer.cs) and [Animation.cs](https://github.com/Samsung/TizenFX/blob/API11/src/Tizen.NUI/src/public/Animation/Animation.cs) define millisecond durations, bool-returning timer callbacks and Finished. Managed elapsed-time ticking avoids native handles and preserves UI-thread callbacks.

## Unverified and constrained behavior

- **UNVERIFIED native Samsung TV KeyCode:** the protocol supplies web key codes, which are retained; names are verified from recorded TV key tables. Hardware native integer codes may differ.
- **UNVERIFIED Samsung TV font DPI:** 96 is an explicit fallback, not a researched TV constant. The 72-point conversion and profile override are tested.
- **UNVERIFIED endpoint DNS/HTTP failure:** this environment blocks the OS domain-name query used by .NET CookieContainer (`GetDomainName: -1`). Real application login reaches HttpClient.SendAsync and its own catch/error screen, but fails before an outbound connection. No sandbox or native-runtime workaround is applied.
- **UNVERIFIED physical device parity:** no Samsung hardware comparison, GPU rendering, font shaping, image decode, media codec playback or Chromium visual screenshot validation is performed by the .NET standalone tests.
- Spatial focus uses axis-aligned managed bounds. Rotated/perspective layouts and fully transformed ancestor scale geometry are outside this implementation. Focus groups are registered/queryable; layout-driven group traversal and platform touch-driven indicator modes are not reproduced.
- Local synchronous image readiness validates headers/dimensions, not every compressed pixel. Chromium remains the actual decoder. Synchronous HTTP and unsupported formats fail loudly. Async loading is covered by protocol acknowledgements, not hardware resource-loader timing.
- Borders are represented with private overlay nodes; renderer-specific CSS box geometry and rounded-corner visual parity need end-to-end image comparison.
- Preference locking is in-process; simultaneous independent processes sharing one data directory are not coordinated.
- Media-key reservation is process-local rather than system-wide. Player states and messages are tested with scripted host events; real audio/video playback remains a Node/Chromium integration responsibility.
- Tier 2 layouts, scrolling and Components are absent. Unsupported exposed operation variants emit `missing` and throw; unexposed members are rejected by inspection.
- API5/API11 conformance is a union: it verifies this shim surface exists in at least one supported reference generation. It does not assert every exposed method exists in both generations.

## Verification

See `dotnet/artifacts/build.log`, `dotnet/artifacts/tests.log`, and `dotnet/artifacts/acceptance/` for real command output and wire transcripts. The console tests cover metadata conformance, negative signatures, loader binding, lifecycle, key consumption/bubbling, explicit/default focus, reentrant focus redirection/clear/hide/disposal, subtree disposal, text, timers, frame batching, typed preference persistence, player preparation/seek and stale acknowledgement/state/cache guards, synchronous/asynchronous images, image path/symlink containment, border offset/clear geometry, animation, UI dispatch, TCP authentication/profile/DPI/disconnect, malformed handshakes and oversized input. Final acceptance results are appended after the final run.

### Recorded build and test commands

```text
dotnet build dotnet/Tvemu.sln -c Release
Build succeeded.
    0 Warning(s)
    0 Error(s)
Time Elapsed 00:00:02.73

dotnet run --project dotnet/Tvemu.Tests -c Release --no-build
PASS reference API conformance
PASS inspector exact signatures and inheritance
Observed 80 protocol messages; 479 scene operations
PASS standalone loader, lifecycle, focus, routing, text, timer, frames, preference and player
PASS standalone EOF and bounded 8 MiB input
PASS TCP hello, welcome profile DPI, disconnect and rejected handshake
Tests: 5 passed; 0 failed
```

Frame/operation totals depend on scheduler timing; assertions verify behavior and limits rather than an exact count.

### Final real-package acceptance

`python3 dotnet/acceptance.py` completed with exit code 0 for its observed checks. Full intended endpoint acceptance remains incomplete because the environment prevents the endpoint-specific network failure from being reached. It invokes the real inspector and standalone host against both supplied extracted packages, keeps stdin open while driving events, and records sent input and received output. Both package inspectors returned exit 0. These are recorded summary fields, not simulated outcomes:

| Result | net6 / API11 | legacy / API5 |
|---|---|---|
| Supported / missing references | 173 / 0 | 186 / 0 |
| `ready` | true | true |
| E-mail / password field IDs | 29 / 30 | 40 / 42 |
| Focus sequence after remote input | 29 → 30 → 31 | 40 → 42 → 44 |
| Field text changed | true | true |
| Application login error text | Confira seu e-mail e senha. | Confira seu e-mail e senha. |
| HTTP request failure observed | true | true |
| Back dialog | Deseja encerrar o aplicativo? | Deseja encerrar o aplicativo? |
| Frames / focus operations | 11 / 18 | 11 / 18 |
| Runtime exit / crashes | 0 / none | 0 / none |
| Observed script checks passed | true | true |
| Full intended endpoint acceptance complete | false | false |

The network call was attempted by the unmodified application's `GraphQlTransport.ExecuteAsync` and reached `HttpClient.SendAsync`. This environment then failed `CookieContainer` initialization with `System.InvalidOperationException: GetDomainName: -1`. The application caught that failure and rendered its own error screen; the runtime did not crash. **Actual DNS resolution or HTTP connection failure at example.invalid remains unverified**, because the environment failed earlier in the network stack. The acceptance script records that limitation and does not claim a connection was made.

Full evidence:

- [net6 summary](../../dotnet/artifacts/acceptance/net6-summary.json), [legacy summary](../../dotnet/artifacts/acceptance/legacy-summary.json)
- [net6 inspector](../../dotnet/artifacts/acceptance/net6-inspect.json), [legacy inspector](../../dotnet/artifacts/acceptance/legacy-inspect.json)
- [net6 outgoing](../../dotnet/artifacts/acceptance/net6-stdout.ndjson), [net6 input](../../dotnet/artifacts/acceptance/net6-stdin.ndjson)
- [legacy outgoing](../../dotnet/artifacts/acceptance/legacy-stdout.ndjson), [legacy input](../../dotnet/artifacts/acceptance/legacy-stdin.ndjson)
- Both corresponding stderr files are empty.

Build/test/acceptance artifacts are intentionally ignored by git. `dotnet/acceptance.py`, the test runner, and this record remain reproducible source evidence.
