# Brief: integration pass (`packages/engine`, `packages/host`, `README.md`)

Read `docs/briefs/COMMON.md` first. All packages now exist and build. `packages/tizen-api` and
`packages/sdb-bridge` are owned by other agents: do not edit them. Facts below come from
`docs/re/07-tv-image-web-runtime.md` (static analysis of the real Tizen 10 TV image).

1. **Tizen 10 profile.** The 2026 TV image ships Chromium **130.0.6723.116**. Add
   `tizen-10.0` (model year 2026, milestone 130) to `DEFAULT_PROFILES` and a registry entry for
   M130 (probe the snapshot bucket with HTTP HEAD around branch base position 1356013 for
   `Mac_Arm`; `verified: false`, `sha256: null` unless you really downloaded it — do not download).
   User agent template observed in the image:
   `Mozilla/5.0 (SMART-TV; LINUX; Tizen <ver>) AppleWebKit/537.36 (KHTML, like Gecko) <chromium version>/<ver> TV Safari/537.36`
   (no `Chrome/` token). Make every profile follow it.
2. **Honest engine fallback.** Today a profile whose milestone has no matching build silently runs
   on whatever Playwright Chromium is in the cache (e.g. profile M76 on Chromium 153). Keep the
   fallback, but make it explicit everywhere: `resolveEngine` returns `exact: boolean`;
   `tvemu profiles` prints `exact` or `APPROXIMATE (Chromium <real> instead of M<wanted>)`;
   `tvemu start/run` prints a prominent warning line and the remote UI shows it in the state
   panel (extend the `log` message, do not change the protocol types); `--strict-engine` makes it
   an error. Default profile selection prefers profiles with an exact engine.
3. **Device identity defaults** per profile (`model`, `modelCode`, `firmware`, `duid`, `locale`,
   `country`): keep generic non-Samsung placeholder values but shaped like real ones as described
   in doc 07 section on identity (model `Emulator`-style, language `en_US`). Allow overriding any
   `DeviceProfile` field from `<home>/profiles/<name>.json` and from `tvemu start --set key=value`.
4. **End-to-end test with the API bundle** in `packages/host` (skip when no Chromium resolves):
   fixture `.wgt` whose page uses `tizen.tvinputdevice.registerKey('MediaPlayPause')`,
   `tizen.application.getCurrentApplication().exit()` on Back, and `webapis.productinfo.getModel()`.
   Assert: before registration MediaPlayPause (10252) does not reach the page and Enter does;
   after registration it does; the remote UI state reports the registered key; Back triggers
   `application.exit` and the host ends the app. Run it for real on Chromium 69
   (`TVEMU_CHROMIUM_69=<chromium-69>/Chromium.app/Contents/MacOS/Chromium`)
   and on the Playwright Chromium, and report real output.
5. **`tvemu doctor`**: prints Node version, arch, Rosetta availability (`arch -x86_64 /usr/bin/true`),
   each profile's engine resolution, whether port 26101 is free, whether Samsung `sdb` is on PATH
   or at `~/tizen-studio/tools/sdb`, and the home dir.
6. **README.md**: make sure it matches reality after this pass (profiles table incl. Tizen 10,
   exact vs approximate engines, how to get exact engines, `tvemu doctor`, the D-pad testing
   workflow, limitations). No claims that were not verified by a test you ran.

Finish with `pnpm -r run build` and `pnpm -r run test` green and report the real output.
