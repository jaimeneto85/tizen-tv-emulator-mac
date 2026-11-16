# NUI runtime protocol (v1)

How a `.tpk` (.NET, `dotnet` / `dotnet-nui` application type) runs in tvemu:

```
tvemu host (Node) ── spawns ──> Tvemu.NuiHost (dotnet process)
      │  TCP 127.0.0.1, NDJSON           loads the UNMODIFIED app assembly from the .tpk,
      │ <───────────────────────────────  binds its Tizen.* references to tvemu's own
      │                                   re-implementation of those assemblies
      └── CDP ──> Chromium window 1920x1080 showing the renderer page (/nui/)
```

The scene (views, text, images, focus) lives in the dotnet process. The renderer page is a dumb
display: it applies scene operations to DOM nodes and reports input, image and media events.

## Transport

The Node host listens on `127.0.0.1:<random port>` and spawns the runtime with environment
`TVEMU_NUI_ENDPOINT=127.0.0.1:<port>` and `TVEMU_NUI_TOKEN=<random>`. UTF-8, one JSON object per
line (`\n`), no line longer than 8 MiB. Unknown `t` values and unknown properties are ignored by
both sides (forward compatibility). All colours are `[r, g, b, a]` floats 0..1. All ids are
positive integers allocated by the runtime; `0` means the window root / "none".

Handshake: runtime sends `{"t":"hello","v":1,"token":"..."}`. Host answers

```json
{"t":"welcome","v":1,"window":{"w":1920,"h":1080},
 "profile":{ /* DeviceProfile from @tvemu/protocol */ },
 "app":{"packageId":"..","appId":"..","exec":"App.dll","installDir":"/abs","dataDir":"/abs","locale":"en_US"}}
```

A wrong token closes the socket. If the socket closes the runtime exits with code 3.

## Runtime -> host

| message | meaning |
|---|---|
| `{"t":"ready"}` | `OnCreate` finished |
| `{"t":"frame","ops":[...]}` | batched scene operations, applied atomically, at most one per loop turn |
| `{"t":"player","id":n,"op":"open","url":".."}` | media ops: `open`, `display` (`{"mode":"window"\|"none"}`), `prepare`, `start`, `pause`, `stop`, `seek` (`ms`), `volume` (`value` 0..1), `mute` (`value` bool), `rate` (`value`), `close` |
| `{"t":"log","level":"debug\|info\|warn\|error\|fatal","tag":"..","msg":".."}` | `Tizen.Log`, `Console`, `Trace` output |
| `{"t":"missing","member":"Tizen.NUI.X::Y(..)"}` | the app touched an API tvemu does not implement (sent once per member) |
| `{"t":"exit","code":0,"reason":"app-exit\|crash","error":"..."}` | last message before the process ends |

Scene operations (arrays, first element is the op name):

| op | meaning |
|---|---|
| `["create", id, kind]` | kind: `view`, `text`, `image`, `field` |
| `["set", id, {props}]` | partial property update |
| `["insert", parentId, id, index]` | (re)parent; `parentId` 0 is the window; `index` is the sibling position, later siblings draw on top |
| `["detach", id]` | remove from its parent, keep alive |
| `["destroy", id]` | free the node (implies detach) |
| `["window", {"bg":[r,g,b,a]}]` | window properties |
| `["focus", id]` | keyboard focus indicator moved (0 = none) |
| `["ime", id, {"panel":"normal\|email\|password\|number\|url","hidden":bool}]` | on-screen keyboard requested for a field (id 0 = dismissed) |

Properties (`set`). Geometry is in window pixels relative to the parent's top-left corner.
`null` width/height means "natural size".

`x`, `y`, `w`, `h`, `visible` (bool), `opacity` (0..1), `scale` (`[sx, sy]`), `pivot` (`[px, py]`, 0..1,
origin of scale), `bg` (colour), `radius` (`[tl, tr, br, bl]` px), `borderWidth`, `borderColor`,
`clip` (bool), `name`.
Text (`text`, `field`): `text`, `textColor`, `pixelSize` (already converted from points by the
runtime), `multiline`, `hAlign` (`begin|center|end`), `vAlign` (`top|center|bottom`), `ellipsis`,
`fontFamily`, `fontWeight`, `fontStyle`, `lineSpacing`.
Field only: `placeholder`, `placeholderColor`, `hidden` (password masking), `maxLength`.
Image only: `url` (http(s) URL, or an absolute file path inside the app install dir), `fitting`
(`fill|contain|cover|center`).

## Host -> runtime

| message | meaning |
|---|---|
| `{"t":"key","state":"down\|up","key":"ArrowLeft","code":37}` | remote key: `key`/`code` are a `RemoteKey` name and code from `@tvemu/protocol`; the runtime translates to the platform key name |
| `{"t":"text","id":n,"value":".."}` | the user edited a field |
| `{"t":"image","id":n,"status":"ready\|failed","w":..,"h":..}` | image load result |
| `{"t":"measure","id":n,"w":..,"h":..}` | natural size of a node whose `w`/`h` is `null`, after layout |
| `{"t":"player","id":n,"event":"prepared\|playing\|paused\|ended\|error\|time\|seeked","positionMs":..,"durationMs":..,"message":".."}` | media events; `time` at least every 250 ms while playing |
| `{"t":"lifecycle","event":"pause\|resume\|terminate"}` | application lifecycle |

## Renderer page contract (Node side internal)

The page served at `/nui/` exposes `window.__tvemuNui.apply(json: string)`, called by the host for
every `frame` and `player` message, and reports events with the existing bridge binding:
`window.__tvemuSend(JSON.stringify({ id, api: 'nui', method: 'event', args: [<host -> runtime message>] }))`.
Keys pressed in the page (Mac keyboard or `tvemu key`) are reported as `key` messages the same way.
