# Brief: `packages/wgt` (`@tvemu/wgt`)

Read `docs/briefs/COMMON.md` first.

Reads Tizen web-app packages (`.wgt`, a zip with `config.xml` at the root) and manages the
on-disk app store under `<home>/apps/`.

Exports (all named):

- `readWgtManifest(wgtPath: string): Promise<AppManifest>` — opens the zip without extracting
  everything, parses `config.xml`.
- `parseConfigXml(xml: string): AppManifest` — pure function. W3C widgets namespace
  `http://www.w3.org/ns/widgets` plus the Tizen namespace `http://tizen.org/ns/widgets`.
  Mapping:
  - `widget@id` → `widgetId`, `widget@version` → `version`
  - `tizen:application@id` → `appId`, `@package` → `packageId`, `@required_version` → `requiredVersion`
  - first `name` element text → `name` (fallback: appId)
  - `content@src` → `contentSrc` (default `index.html`); it may be an absolute http(s) URL (hosted app)
  - first `icon@src` → `icon`
  - every `tizen:privilege@name` → `privileges`
  - every `feature@name` → `features`
  - `tizen:content-security-policy` text → `contentSecurityPolicy`
  - every `access@origin` → `accessOrigins`
  - every attribute of `tizen:setting` → `settings`
  - `tizen:profile@name` → `profile`
  Errors: missing `tizen:application` id or package → `WgtError` with code `INVALID_CONFIG`.
  Tizen rules to validate: package id is 10 alphanumeric chars OR, for Samsung TV, any
  `[A-Za-z0-9]+`; app id is `<packageId>.<name>`. Only warn (return `warnings: string[]` through a
  second export `validateManifest(manifest)`) — never reject what a real TV accepts.
- `createAppStore(home: string): AppStore` with
  - `install(wgtPath): Promise<InstalledApp>` — extracts to `<home>/apps/<packageId>/content/`,
    writes `<home>/apps/<packageId>/manifest.json`; reinstalling replaces the content atomically
    (extract to a temp dir, then rename) and keeps nothing from the previous version. Must reject
    zip entries escaping the target dir (zip-slip) and symlinks.
  - `uninstall(packageId): Promise<void>` (error code `NOT_INSTALLED` when absent)
  - `list(): Promise<InstalledApp[]>`
  - `findByAppId(appId)`, `findByPackageId(packageId)` → `InstalledApp | null`
  - `contentDir(app): string`
- `WgtError extends Error` with `code: 'NOT_A_WGT' | 'INVALID_CONFIG' | 'NOT_INSTALLED' | 'UNSAFE_ENTRY'`.

Signature files (`author-signature.xml`, `signature1.xml`) are extracted like any other file and
never verified; expose `hasAuthorSignature` / `hasDistributorSignature` booleans from
`inspectWgt(wgtPath)` together with file count and total uncompressed size.

Dependencies: a small maintained zip reader (`yauzl` or `fflate`) and an XML parser
(`fast-xml-parser`). No native modules.

Tests: build fixture `.wgt` files in the tests themselves (zip in memory, write to a temp dir).
Cover: the real-world config below, hosted `content src`, missing application element, zip-slip
entry, reinstall replaces content, list/uninstall, unicode app name.

Real config.xml the parser must accept (from a production Samsung TV app):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://example.com/Demo.Example" version="1.0.3" viewmodes="maximized">
    <tizen:application id="Demo.Example" package="Demo" required_version="5.5"/>
    <access origin="*" subdomains="true"/>
    <tizen:content-security-policy>default-src * data: blob: 'unsafe-inline' 'unsafe-eval'</tizen:content-security-policy>
    <tizen:allow-navigation>*</tizen:allow-navigation>
    <content src="index.html"/>
    <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
    <icon src="icon.png"/>
    <name>Demo</name>
    <tizen:profile name="tv"/>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
</widget>
```
