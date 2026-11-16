# tpk notes

Decisions and deviations for `packages/tpk` (`@tvemu/tpk`).

## Implementation

- Follows the `packages/wgt` house style: `yauzl` for reading (lazy entries, strict
  file names), `fast-xml-parser` in preserve-order mode for XML, `fflate` only in tests
  to build fixtures. `wgt` does not export its zip/XML helpers, so the equivalents
  (`visitArchive`, `safeEntry`, `elements`) are implemented locally in `src/archive.ts`
  and `src/manifest.ts`; `@tvemu/wgt` is not a dependency.
- `TpkError` codes: `NOT_A_TPK`, `INVALID_MANIFEST`, `UNSAFE_ENTRY`, `TOO_LARGE`,
  `NO_UI_APP`, `NOT_DOTNET`.
- `isTpk` only checks that the zip contains a root `tizen-manifest.xml`; it does not
  validate the manifest content and ignores entry safety, so a "yes/no by content"
  answer is never confused with a validity verdict. `readTpkManifest` / `extractTpk`
  do full safety checks.
- Extraction enforces the wgt-style entry checks (absolute paths, `..`, backslashes,
  drive letters, symlinks via external attributes) plus a total uncompressed size cap
  of 2 GiB (`TPK_MAX_TOTAL_UNCOMPRESSED_BYTES` in `src/archive.ts`, violation code
  `TOO_LARGE`). The cap is not reachable from the public signature, so the limit
  itself is only covered indirectly; flagged as not verified by an explicit test.
- App `label` is the label without `xml:lang`; when absent, the first declared label
  is used. The empty-language label is stored in `labels` under the `''` key.

## Verification

- `pnpm --filter @tvemu/tpk run build` — green (`tsc -p tsconfig.json`, no errors).
- `pnpm --filter @tvemu/tpk run test` — green; real packages are exercised when `TVEMU_TEST_TPKS` lists their paths.
