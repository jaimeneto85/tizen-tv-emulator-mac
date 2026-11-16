using System.Diagnostics;
using System.Text.Json;
using Tvemu.Metadata;

var root = FindRoot();
var hostDirectory = Path.Combine(root, "artifacts", "nui-host");
var failures = 0;
var total = 0;
await Test("reference API conformance", () =>
{
    var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    var mismatches = MetadataApi.CheckConformance(hostDirectory, Path.Combine(home, ".nuget/packages/tizen.net.api11/11.0.0.18033/ref/net6.0"), Path.Combine(home, ".nuget/packages/tizen.net.api5/5.0.0.14629/ref/netstandard2.0"));
    foreach (var mismatch in mismatches) Console.WriteLine(mismatch);
    Require(!mismatches.Any(m => !m.StartsWith("SKIP:", StringComparison.Ordinal)), $"{mismatches.Count} mismatches");
    return Task.CompletedTask;
});
await Test("inspector exact signatures and inheritance", () =>
{
    var types = new Dictionary<(string, string), ApiType>
    {
        [("Tizen.Test", "Tizen.Base")] = new("Tizen.Base", "Tizen.Test", "System.Object", System.Reflection.TypeAttributes.Public, new[] { new ApiMember("Set", "instance Set``0(System.Int32):System.Void", true) }),
        [("Tizen.Test", "Tizen.Child")] = new("Tizen.Child", "Tizen.Test", "Tizen.Base", System.Reflection.TypeAttributes.Public, Array.Empty<ApiMember>())
    };
    Require(MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Child", "instance Set``0(System.Int32):System.Void"), "inherited method missing");
    Require(!MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Child", "instance Set``0(System.String):System.Void"), "wrong overload accepted");
    Require(!MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Child", "static Set``0(System.Int32):System.Void"), "static mismatch accepted");
    Require(!MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Child", "instance Set``1(System.Int32):System.Void"), "generic mismatch accepted");
    Require(!MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Child", "instance Set``0(System.Int32):System.Int32"), "return mismatch accepted");
    types[("Tizen.Test", "Tizen.Generic`1")] = new("Tizen.Generic`1", "Tizen.Test", "System.Object", System.Reflection.TypeAttributes.Public, new[] { new ApiMember("Set", "instance Set``0(!0):System.Void", true, IdentitySignature: "instance Set``0(!0):System.Void") });
    Require(MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Generic`1<System.String>", "instance Set``0(System.String):System.Void", "instance Set``0(System.String):System.Void", "Tizen.Generic`1<System.String>"), "constructed generic signature missing");
    types[("Tizen.Test", "Tizen.Identity")] = new("Tizen.Identity", "Tizen.Test", "System.Object", System.Reflection.TypeAttributes.Public, new[] { new ApiMember("Set", "instance Set``0(Tizen.Value):System.Void", true, IdentitySignature: "instance Set``0([Tizen.Test]class:Tizen.Value):System.Void") });
    Require(!MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Identity", "instance Set``0(Tizen.Value):System.Void", "instance Set``0([Other]class:Tizen.Value):System.Void"), "wrong parameter assembly accepted");
    Require(!MetadataApi.Resolve(types, "Tizen.Test", "Tizen.Identity", "instance Set``0(Tizen.Value):System.Void", "instance Set``0([Tizen.Test]valuetype:Tizen.Value):System.Void"), "wrong class/value encoding accepted");
    return Task.CompletedTask;
});
await Test("standalone loader, lifecycle, focus, routing, text, timer, frames, preference and player", async () =>
{
    var appDirectory = Path.Combine(root, "artifacts", "test-app");
    var appBin = Path.Combine(appDirectory, "bin");
    Directory.CreateDirectory(appBin);
    var resources = Path.Combine(appDirectory, "res");
    Directory.CreateDirectory(resources);
    File.WriteAllBytes(Path.Combine(resources, "pixel.png"), Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+j8AAAAASUVORK5CYII="));
    var escapingLink = Path.Combine(resources, "escape-link.png");
    File.Delete(escapingLink);
    File.CreateSymbolicLink(escapingLink, Path.Combine(root, "artifacts", "outside.png"));
    var sample = Path.Combine(root, "samples", "HelloTv", "bin", "Release", "net9.0");
    foreach (var file in Directory.GetFiles(sample)) File.Copy(file, Path.Combine(appBin, Path.GetFileName(file)), true);
    var inspected = MetadataApi.Inspect(Path.Combine(appBin, "HelloTv.dll"), hostDirectory);
    Require(inspected.All(i => i.Status == "supported"), "sample inspector missing: " + string.Join(";", inspected.Where(i => i.Status == "missing")));
    var start = new ProcessStartInfo("dotnet") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
    foreach (var argument in new[] { Path.Combine(hostDirectory, "Tvemu.NuiHost.dll"), "--app-dir", appDirectory, "--exec", "HelloTv.dll", "--data-dir", Path.Combine(root, "artifacts", "test-data") }) start.ArgumentList.Add(argument);
    start.Environment["TVEMU_SAMPLE_TEST"] = "1";
    start.Environment.Remove("TVEMU_NUI_ENDPOINT");
    start.Environment.Remove("TVEMU_NUI_TOKEN");
    using var process = Process.Start(start)!;
    var messages = new List<JsonElement>();
    var gate = new object();
    var stderr = process.StandardError.ReadToEndAsync();
    async Task Send(object message) { await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(message)); await process.StandardInput.FlushAsync(); }
    var scriptedPlayerId = 0;
    var reading = Task.Run(async () =>
    {
        while (await process.StandardOutput.ReadLineAsync() is { } line)
        {
            var message = JsonDocument.Parse(line).RootElement.Clone();
            lock (gate) messages.Add(message);
            if (message.GetProperty("t").GetString() == "player")
            {
                var operation = message.GetProperty("op").GetString();
                var id = message.GetProperty("id").GetInt32();
                if (operation == "prepare") scriptedPlayerId = id;
                if (operation == "seek") await Send(new { t = "player", id, @event = "seeked", durationMs = 10000, positionMs = 1000 });
            }
            if (message.GetProperty("t").GetString() == "log" && scriptedPlayerId != 0)
            {
                var log = message.GetProperty("msg").GetString();
                if (log is "PLAYER-TEST:PREPARING" or "PLAYER-TEST:STOPPED")
                {
                    await Send(new { t = "player", id = scriptedPlayerId, @event = "playing", positionMs = 777 });
                    await Send(new { t = "player", id = scriptedPlayerId, @event = "paused", positionMs = 888 });
                }
                if (log == "PLAYER-TEST:PREPARING-CHECKED") await Send(new { t = "player", id = scriptedPlayerId, @event = "prepared", durationMs = 10000 });
                if (log == "PLAYER-TEST:PAUSED")
                {
                    await Send(new { t = "player", id = scriptedPlayerId, @event = "playing", positionMs = 777 });
                    await Send(new { t = "player", id = scriptedPlayerId, @event = "paused", positionMs = 2222 });
                }
                if (log == "PLAYER-TEST:RESTARTED") await Send(new { t = "player", id = scriptedPlayerId, @event = "paused", positionMs = 777 });
            }
        }
    });
    JsonElement[] Snapshot() { lock (gate) return messages.ToArray(); }
    bool Log(string text) => Snapshot().Any(m => m.GetProperty("t").GetString() == "log" && m.GetProperty("msg").GetString()!.Contains(text, StringComparison.Ordinal));
    JsonElement[] Operations() => Snapshot().Where(m => m.GetProperty("t").GetString() == "frame").SelectMany(m => m.GetProperty("ops").EnumerateArray()).ToArray();
    async Task Wait(Func<bool> condition, string description)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            if (process.HasExited || DateTime.UtcNow > deadline) throw new Exception(description + ": " + string.Join("\n", Snapshot().Select(m => m.GetRawText())) + "\n" + (process.HasExited ? await stderr : ""));
            await Task.Delay(10);
        }
    }
    try
    {
        await Wait(() => Snapshot().Any(m => m.GetProperty("t").GetString() == "ready"), "ready missing");
        await Wait(() => Log("PLAYER:STALE-EVENTS-PASS") && Log("PLAYER:SEEKED:1000") && Log("TICK:3") && Log("ANIMATION:PASS") && Log("THREAD:POST") && Log("THREAD:SEND-EXCEPTION"), "player or timer missing");
        Require(Log("FOCUS:ANCESTORS-DISPOSE-PASS"), "focus ancestor/dispose assertion missing");
        Require(Log("THREAD:GUARD") && Log("THREAD:SEND"), "thread confinement checks missing");
        Require(Log("PREFERENCE:PASS") && Log("PLAYER:IDLE-GUARD") && Log("LIFECYCLE:RESUME"), "state assertions missing");
        Require(Operations().Any(op => op[0].GetString() == "set" && op[2].TryGetProperty("opacity", out var opacity) && opacity.GetSingle() > 0.25f && opacity.GetSingle() < 1f), "animation emitted no intermediate opacity");
        var firstFrame = Snapshot().First(m => m.GetProperty("t").GetString() == "frame");
        Require(firstFrame.GetProperty("ops").GetArrayLength() > 20, "scene operations were not batched");
        Require(Log("FOCUS:REENTRANT-PASS"), "reentrant focus sample assertions missing");
        foreach (var scenario in new[] { "gain-refocus", "lost-refocus", "clear-refocus", "gain-hide", "gain-dispose" })
        {
            var operations = Operations();
            bool Named(JsonElement op, string name) => op[0].GetString() == "set" && op[2].TryGetProperty("name", out var value) && value.GetString() == name;
            var begin = Array.FindIndex(operations, op => Named(op, scenario + "-begin"));
            var end = Array.FindIndex(operations, op => Named(op, scenario + "-end"));
            var b = operations.First(op => Named(op, scenario + "-b"))[1].GetInt32();
            var c = operations.First(op => Named(op, scenario + "-c"))[1].GetInt32();
            var focus = operations[(begin + 1)..end].Where(op => op[0].GetString() == "focus").Select(op => op[1].GetInt32()).ToArray();
            Require(!focus.Contains(b), scenario + " emitted stale target focus");
            if (scenario.EndsWith("refocus", StringComparison.Ordinal)) Require(focus.Length > 0 && focus[^1] == c, scenario + " wire focus disagrees with reentrant selection");
        }
        Require(Log("IMAGE:SYNC-MAP-SECURITY-PASS") && Log("BORDER:CLEAR-PASS"), "local image or border assertions missing");
        var asyncImageId = Operations().First(op => op[0].GetString() == "set" && op[2].TryGetProperty("name", out var name) && name.GetString() == "async-image")[1].GetInt32();
        await Send(new { t = "image", id = asyncImageId, status = "ready", w = 37, h = 19 });
        await Wait(() => Log("ASYNC-IMAGE:Ready:37:19"), "async image ready dimensions missing");
        await Send(new { t = "image", id = asyncImageId, status = "failed", w = 0, h = 0 });
        await Wait(() => Log("ASYNC-IMAGE:Failed"), "async image failed event missing");
        var borderSet = Operations().First(op => op[0].GetString() == "set" && op[2].TryGetProperty("borderWidth", out var width) && width.GetSingle() == 4 && op[2].TryGetProperty("x", out var x) && x.GetSingle() == -4);
        Require(borderSet[2].GetProperty("y").GetSingle() == -4 && borderSet[2].GetProperty("w").GetSingle() == 108 && borderSet[2].GetProperty("h").GetSingle() == 88, "offset border geometry wrong");
        Require(Operations().Any(op => op[0].GetString() == "set" && op[1].GetInt32() == borderSet[1].GetInt32() && op[2].TryGetProperty("visible", out var visible) && !visible.GetBoolean()), "ClearBackground did not hide border node");
        var fieldIds = Operations().Where(op => op[0].GetString() == "create" && op[2].GetString() == "field").Select(op => op[1].GetInt32()).ToArray();
        Require(fieldIds.Length == 2, "expected two fields");
        await Send(new { t = "text", id = fieldIds[0], value = "hello@example.test" });
        await Wait(() => Log("TEXT:hello@example.test"), "TextChanged not raised");
        await Send(new { t = "key", state = "down", key = "ArrowLeft", code = 37 });
        await Wait(() => Log("VIEW:Left"), "focused view did not receive key");
        Require(!Log("WINDOW:Left") && !Log("ROOT:Left"), "consumed key propagated to parent or window");
        await Send(new { t = "key", state = "down", key = "ArrowDown", code = 40 });
        await Wait(() => Operations().Any(op => op[0].GetString() == "focus" && op[1].GetInt32() == fieldIds[1]), "directional focus did not move");
        Require(Log("ROOT:Down") && Log("WINDOW:Down"), "unconsumed key did not reach parent and window");
        var logs = Snapshot().Where(m => m.GetProperty("t").GetString() == "log").Select(m => m.GetProperty("msg").GetString()!).ToArray();
        Require(Array.FindIndex(logs, m => m.Contains("VIEW:Down")) < Array.FindIndex(logs, m => m.Contains("ROOT:Down")) && Array.FindIndex(logs, m => m.Contains("ROOT:Down")) < Array.FindIndex(logs, m => m.Contains("WINDOW:Down")), "key routing order wrong");
        await Send(new { t = "text", id = fieldIds[0], value = "focus-off" });
        await Wait(() => Log("FOCUS-MODE:focus-off"), "focus mode off not applied");
        await Send(new { t = "key", state = "down", key = "ArrowRight", code = 39 });
        await Wait(() => Log("WINDOW:Right"), "right key not processed");
        Require(Operations().Last(op => op[0].GetString() == "focus")[1].GetInt32() == fieldIds[0], "disabled algorithm moved focus");
        await Send(new { t = "text", id = fieldIds[0], value = "focus-on" });
        await Wait(() => Log("FOCUS-MODE:focus-on"), "focus mode on not applied");
        var firstButtonId = Operations().First(op => op[0].GetString() == "create" && op[2].GetString() == "text")[1].GetInt32();
        await Send(new { t = "key", state = "down", key = "ArrowRight", code = 39 });
        await Wait(() => Operations().Last(op => op[0].GetString() == "focus")[1].GetInt32() == firstButtonId, "enabled geometry algorithm did not pick aligned nearest button");
        await Send(new { t = "lifecycle", @event = "pause" });
        await Wait(() => Log("LIFECYCLE:PAUSE"), "pause callback missing");
        await Send(new { t = "lifecycle", @event = "resume" });
        await Send(new { t = "key", state = "down", key = "Back", code = 10009 });
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        await reading;
        Require(process.ExitCode == 0, $"host exit {process.ExitCode}: {await stderr}");
        Require(Log("LIFECYCLE:TERMINATE"), "termination callback missing");
        Require(Snapshot().Any(m => m.GetProperty("t").GetString() == "exit" && m.GetProperty("code").GetInt32() == 0), "clean exit missing");
        Require(Directory.GetFiles(Path.Combine(root, "artifacts", "test-data"), "*.json").Length > 0, "preference JSON not persisted");
        Console.WriteLine($"Observed {Snapshot().Length} protocol messages; {Operations().Length} scene operations");
    }
    finally { if (!process.HasExited) process.Kill(true); }
});
await Test("standalone EOF and bounded 8 MiB input", async () =>
{
    foreach (var oversized in new[] { false, true })
    {
        using var process = StartHost();
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        if (oversized)
        {
            try { await process.StandardInput.WriteLineAsync(new string('x', 8 * 1024 * 1024 + 1)); await process.StandardInput.FlushAsync(); }
            catch (IOException) { }
        }
        else process.StandardInput.Close();
        try
        {
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(15));
            Require(process.ExitCode == 3, $"transport failure returned {process.ExitCode}: {await error}");
            var text = await output;
            if (oversized) Require(text.Contains("exceeds 8 MiB", StringComparison.Ordinal), "oversized input diagnostic absent");
        }
        finally { if (!process.HasExited) process.Kill(true); }
    }
});
await Test("TCP hello, welcome profile DPI, disconnect and rejected handshake", async () =>
{
    foreach (var validWelcome in new[] { true, false })
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var endpoint = (System.Net.IPEndPoint)listener.LocalEndpoint;
            using var process = StartHost($"127.0.0.1:{endpoint.Port}");
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            using var connection = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(10));
            await using var stream = connection.GetStream();
            using var reader = new StreamReader(stream, leaveOpen: true);
            await using var writer = new StreamWriter(stream, new System.Text.UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
            var hello = JsonDocument.Parse((await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)))!).RootElement;
            Require(hello.GetProperty("t").GetString() == "hello" && hello.GetProperty("token").GetString() == "test-token" && hello.GetProperty("v").GetInt32() == 1, "wrong hello");
            if (validWelcome)
            {
                await writer.WriteLineAsync(JsonSerializer.Serialize(new { t = "welcome", v = 1, profile = new { nuiDpi = 144 }, window = new { w = 1280, h = 720 }, app = new { locale = "en_US" } }));
                var ready = false;
                var dpi = false;
                while (!ready || !dpi)
                {
                    var line = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
                    Require(line is not null, "TCP closed before frame");
                    var message = JsonDocument.Parse(line!).RootElement;
                    if (message.GetProperty("t").GetString() == "ready") ready = true;
                    if (message.GetProperty("t").GetString() == "frame")
                        dpi |= message.GetProperty("ops").EnumerateArray().Any(op => op[0].GetString() == "set" && op[2].TryGetProperty("pixelSize", out var value) && Math.Abs(value.GetSingle() - 24f) < 0.001f);
                }
                connection.Client.Shutdown(System.Net.Sockets.SocketShutdown.Both);
                connection.Close();
            }
            else await writer.WriteLineAsync("{\"t\":\"welcome\",\"v\":2}");
            try
            {
                await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
                Require(process.ExitCode == 3, $"TCP failure exit {process.ExitCode}: {await error}");
            }
            finally { if (!process.HasExited) process.Kill(true); }
        }
        finally { listener.Stop(); }
    }
});

Process StartHost(string? endpoint = null)
{
    var start = new ProcessStartInfo("dotnet") { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
    foreach (var argument in new[] { Path.Combine(hostDirectory, "Tvemu.NuiHost.dll"), "--app-dir", Path.Combine(root, "artifacts", "test-app"), "--exec", "HelloTv.dll", "--data-dir", Path.Combine(root, "artifacts", "transport-test-data") }) start.ArgumentList.Add(argument);
    start.Environment.Remove("TVEMU_SAMPLE_TEST");
    if (endpoint is null) start.Environment.Remove("TVEMU_NUI_ENDPOINT");
    else start.Environment["TVEMU_NUI_ENDPOINT"] = endpoint;
    start.Environment["TVEMU_NUI_TOKEN"] = "test-token";
    return Process.Start(start)!;
}
Console.WriteLine($"Tests: {total - failures} passed; {failures} failed");
return failures == 0 ? 0 : 1;

async Task Test(string name, Func<Task> test)
{
    total++;
    try { await test(); Console.WriteLine("PASS " + name); }
    catch (Exception error) { failures++; Console.WriteLine("FAIL " + name + ": " + error.Message); }
}
static void Require(bool condition, string description) { if (!condition) throw new Exception(description); }
static string FindRoot()
{
    for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        if (File.Exists(Path.Combine(directory.FullName, "NuGet.Config")) && Directory.Exists(Path.Combine(directory.FullName, "Tvemu.NuiHost"))) return directory.FullName;
    throw new DirectoryNotFoundException("dotnet source directory not found");
}
