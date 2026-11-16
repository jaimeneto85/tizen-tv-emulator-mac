# Brief: `packages/tpk` (`@tvemu/tpk`)

Read `docs/briefs/COMMON.md` first. You own ONLY `packages/tpk` and `docs/notes/tpk.md`.
Look at `packages/wgt/src` for the house style of the sibling package (zip reading, safe
extraction, error class, tests) and reuse its approach; depend on it (`"@tvemu/wgt": "workspace:*"`)
only if it already exports what you need, otherwise implement locally.

A `.tpk` is the Tizen native/.NET package: a zip with `tizen-manifest.xml` at the root,
`bin/`, `lib/`, `res/`, `shared/res/`, and signature files (`author-signature.xml`,
`signature1.xml`). tvemu runs the .NET kinds only.

Exports (named):

```ts
export type TpkAppKind = 'ui' | 'service' | 'widget' | 'watch' | 'component';
export interface TpkApp {
    appId: string; exec: string; type: string; kind: TpkAppKind; label: string;
    labels: Record<string, string>; icon: string | null; metadata: Record<string, string>;
    nodisplay: boolean; launchMode: string | null;
}
export interface TpkManifest {
    packageId: string; version: string; apiVersion: string; profiles: string[];
    label: string; privileges: string[]; apps: TpkApp[];
    signed: { author: boolean; distributor: boolean };
}
export class TpkError extends Error { code: string }
export function isTpk(filePath: string): Promise<boolean>;
export function parseTizenManifest(xml: string): Omit<TpkManifest, 'signed'>;
export function readTpkManifest(tpkPath: string): Promise<TpkManifest>;
export function extractTpk(tpkPath: string, destDir: string): Promise<TpkManifest>;
export function mainUiApp(manifest: TpkManifest): TpkApp;
export function isDotnetApp(app: TpkApp): boolean;
```

Behaviour:

- `isTpk`: true when the file is a zip that contains `tizen-manifest.xml` at the root (decide by
  content, not by extension).
- `parseTizenManifest`: namespace `http://tizen.org/ns/packages`; `<manifest package version
  api-version>`, `<profile name>`, `<privileges><privilege>`, application elements
  `ui-application`, `service-application`, `widget-application`, `watch-application`,
  `component-based-application` with `appid`, `exec`, `type`, `nodisplay`, `launch_mode`,
  `<label>` (optionally `xml:lang`), `<icon>`, `<metadata key value>`. Missing `package` or no
  application -> `TpkError` with a code. Tolerate unknown elements and attributes.
- `isDotnetApp`: type is `dotnet`, `dotnet-nui`, `dotnet-inhouse` (case-insensitive).
  `mainUiApp`: first `ui` app; throws `TpkError('NO_UI_APP')` when none, and
  `TpkError('NOT_DOTNET')` with a message explaining that native (`capp`/`c++app`) packages need
  the Tizen OS and are not supported when the main app is not .NET.
- `extractTpk`: safe extraction (reject absolute paths, `..`, symlinks, entries escaping
  `destDir`; size limit like the wgt package), preserves the tree as-is, returns the manifest.
- No XML library dependency unless `packages/wgt` already uses one (use the same one then).

Tests (Vitest): build tpk fixtures in the test with the same zip helper the wgt tests use
(manifest variants, multilingual labels, native type, no manifest, zip-slip, signature flags).
Also, when the files exist, read these two REAL packages and assert the parsed values (skip
otherwise; never copy them into the repo):
`<api11-app>.tpk` -> app type `dotnet-nui`;
`<api5-app>.tpk`.

Finish with build + test green and report real output.
