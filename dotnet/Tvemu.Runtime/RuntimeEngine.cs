using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.ExceptionServices;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Tvemu.Runtime;

public static class RuntimeEngine
{
    static readonly ConcurrentQueue<Action> Queue = new();
    static readonly AutoResetEvent Wake = new(false);
    static readonly List<object[]> Operations = new();
    static readonly HashSet<string> MissingMembers = new();
    static TextWriter output = Console.Out;
    static int threadId;
    static int nextId;
    static bool stopping;
    static volatile bool uiLoopActive;
    static bool transportFailed;
    [ThreadStatic] static bool reportingException;
    static readonly object OutputGate = new();
    const int MaximumLineBytes = 8 * 1024 * 1024;
    public static int WindowWidth { get; private set; } = 1920;
    public static int WindowHeight { get; private set; } = 1080;
    public static string Locale { get; private set; } = "en_US";
    public static string AppDir { get; private set; } = "";
    public static string DataDir { get; private set; } = "";
    public static JsonElement Profile { get; private set; }
    public static int ExitCode { get; private set; }
    public static event Action<JsonElement>? Message;
    public static event Action<double>? Tick;
    public static void Initialize(string appDir, string? dataDir)
    {
        AppDir = Path.GetFullPath(appDir);
        DataDir = Path.GetFullPath(dataDir ?? Path.Combine(Path.GetTempPath(), "tvemu-nui", Path.GetFileName(AppDir)));
        Directory.CreateDirectory(DataDir);
        threadId = Environment.CurrentManagedThreadId;
        TextReader input = Console.In;
        var endpoint = Environment.GetEnvironmentVariable("TVEMU_NUI_ENDPOINT");
        if (!string.IsNullOrEmpty(endpoint))
        {
            try
            {
                var address = endpoint.Split(':');
                var client = new TcpClient();
                client.Connect(address[0], int.Parse(address[1]));
                var stream = client.GetStream();
                input = new StreamReader(stream, new UTF8Encoding(false, true));
                output = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };
                Send(new { t = "hello", v = 1, token = Environment.GetEnvironmentVariable("TVEMU_NUI_TOKEN") });
                var welcome = ReadBoundedLine(input) ?? throw new IOException("Host closed before welcome");
                var message = JsonDocument.Parse(welcome);
                using (message)
                {
                    var root = message.RootElement;
                    if (!root.TryGetProperty("t", out var kind) || kind.GetString() != "welcome" ||
                        !root.TryGetProperty("v", out var version) || version.GetInt32() != 1)
                        throw new InvalidDataException("Host did not send protocol v1 welcome");
                    Receive(root.Clone());
                }
            }
            catch (Exception error) when (error is IOException or InvalidDataException or SocketException or JsonException or DecoderFallbackException)
            {
                transportFailed = true;
                ExitCode = 3;
                throw new RuntimeTransportException("NUI handshake failed", error);
            }
        }
        Console.SetOut(new LogWriter("info"));
        Console.SetError(new LogWriter("error"));
        Trace.Listeners.Add(new ProtocolTraceListener());
        if(Environment.GetEnvironmentVariable("TVEMU_NUI_DIAGNOSTICS") == "1")
            AppDomain.CurrentDomain.FirstChanceException += (_, args) =>
            {
                if(reportingException) return;
                reportingException = true;
                try { Send(new { t = "log", level = "debug", tag = "FirstChanceException", msg = args.Exception.ToString() }); }
                finally { reportingException = false; }
            };
        Task.Run(() =>
        {
            try
            {
                while (true)
                {
                    var line = ReadBoundedLine(input);
                    if (line is null) { Post(() => { transportFailed = true; ExitCode = 3; stopping = true; }); break; }
                    using var document = JsonDocument.Parse(line);
                    var item = document.RootElement.Clone();
                    Post(() => Receive(item));
                }
            }
            catch (Exception e)
            {
                Post(() =>
                {
                    ExitCode = 3;
                    stopping = true;
                    try { Send(new { t = "log", level = "error", tag = "transport", msg = e.Message }); }
                    catch (RuntimeTransportException) { }
                    transportFailed = true;
                });
            }
        });
    }
    public static void Execute(Action entryPoint)
    {
        try { entryPoint(); }
        catch (Exception error)
        {
            var actual = error;
            while (actual.InnerException != null) actual = actual.InnerException;
            if (transportFailed || error is RuntimeTransportException || actual is RuntimeTransportException)
            {
                ExitCode = 3;
                return;
            }
            ExitCode = 1;
            try { Send(new { t = "exit", code = 1, reason = "crash", error = error.ToString() }); }
            catch (RuntimeTransportException) { ExitCode = 3; }
        }
    }
    public static void Run(Action create, Action resume, Action pause, Action terminate)
    {
        AssertUiThread();
        uiLoopActive = true;
        var context = new UiContext();
        SynchronizationContext.SetSynchronizationContext(context);
        void Lifecycle(JsonElement item)
        {
            if (item.GetProperty("t").GetString() != "lifecycle") return;
            switch (item.GetProperty("event").GetString())
            {
                case "pause": pause(); break;
                case "resume": resume(); break;
                case "terminate": stopping = true; break;
            }
        }
        Message += Lifecycle;
        try
        {
            create();
            Send(new { t = "ready" });
            resume();
            Flush();
            var clock = System.Diagnostics.Stopwatch.StartNew();
            while (!stopping)
            {
                var count = Queue.Count;
                for (var i = 0; i < count && Queue.TryDequeue(out var action); i++) action();
                Tick?.Invoke(clock.Elapsed.TotalMilliseconds);
                Flush();
                Wake.WaitOne(8);
            }
            terminate();
            Flush();
            if (!transportFailed) Send(new { t = "exit", code = ExitCode, reason = "app-exit" });
        }
        finally
        {
            Message -= Lifecycle;
            uiLoopActive = false;
            SynchronizationContext.SetSynchronizationContext(null);
        }
    }
    public static void RequestExit() { AssertUiThread(); stopping = true; }
    public static void Post(Action action) { Queue.Enqueue(action); Wake.Set(); }
    public static void AssertUiThread()
    {
        if (threadId != 0 && Environment.CurrentManagedThreadId != threadId) throw new InvalidOperationException("NUI APIs must run on the application UI thread");
    }
    public static int AllocateId() { AssertUiThread(); return ++nextId; }
    public static void Scene(params object[] operation) { AssertUiThread(); Operations.Add(operation); }
    public static void Flush()
    {
        if (Operations.Count == 0) return;
        Send(new { t = "frame", ops = Operations.ToArray() });
        Operations.Clear();
    }
    public static void Send(object message)
    {
        var line = JsonSerializer.Serialize(message);
        if (Encoding.UTF8.GetByteCount(line) > MaximumLineBytes)
            throw new InvalidOperationException("Outgoing NDJSON exceeds 8 MiB");
        lock (OutputGate)
        {
            try { output.WriteLine(line); output.Flush(); }
            catch (Exception error) when (error is IOException or ObjectDisposedException)
            {
                transportFailed = true;
                ExitCode = 3;
                stopping = true;
                throw new RuntimeTransportException("NUI output connection closed", error);
            }
        }
    }
    static string? ReadBoundedLine(TextReader input)
    {
        var line = new StringBuilder();
        var bytes = 0;
        var previousHighSurrogate = false;
        while (true)
        {
            var next = input.Read();
            if (next < 0) return line.Length == 0 ? null : line.ToString();
            var character = (char)next;
            if (character == '\n') return line.ToString().TrimEnd('\r');
            bytes += character <= 0x7f ? 1 : character <= 0x7ff ? 2 :
                char.IsLowSurrogate(character) && previousHighSurrogate ? 1 : 3;
            previousHighSurrogate = char.IsHighSurrogate(character);
            if (bytes > MaximumLineBytes) throw new InvalidDataException("Incoming NDJSON exceeds 8 MiB");
            line.Append(character);
        }
    }
    public static void Missing(string member)
    {
        if (MissingMembers.Add(member)) Send(new { t = "missing", member });
        throw new NotSupportedException($"tvemu does not implement {member}");
    }
    static void Receive(JsonElement item)
    {
        if (!item.TryGetProperty("t", out var type)) return;
        if (type.GetString() == "welcome")
        {
            if (item.TryGetProperty("profile", out var profile)) Profile = profile.Clone();
            if (item.TryGetProperty("window", out var window))
            {
                if (window.TryGetProperty("w", out var width) && width.TryGetInt32(out var w) && w > 0) WindowWidth = w;
                if (window.TryGetProperty("h", out var height) && height.TryGetInt32(out var h) && h > 0) WindowHeight = h;
            }
            if (item.TryGetProperty("app", out var app) && app.TryGetProperty("locale", out var locale)) Locale = locale.GetString() ?? Locale;
        }
        Message?.Invoke(item);
    }
    sealed class UiContext : SynchronizationContext
    {
        public override void Post(SendOrPostCallback d, object? state) => RuntimeEngine.Post(() => d(state));
        public override void Send(SendOrPostCallback callback, object? state)
        {
            ArgumentNullException.ThrowIfNull(callback);
            if (Environment.CurrentManagedThreadId == threadId) { callback(state); return; }
            if (!uiLoopActive) throw new InvalidOperationException("The application UI loop is not running");
            var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            ExceptionDispatchInfo? failure = null;
            RuntimeEngine.Post(() =>
            {
                try { callback(state); }
                catch (Exception error) { failure = ExceptionDispatchInfo.Capture(error); }
                finally { finished.TrySetResult(); }
            });
            while (!finished.Task.Wait(25))
                if (!uiLoopActive) throw new InvalidOperationException("The application UI loop stopped before dispatch");
            failure?.Throw();
        }
        public override SynchronizationContext CreateCopy() => this;
    }
    sealed class ProtocolTraceListener : TraceListener
    {
        readonly LogWriter writer = new("debug", "Trace");
        public override void Write(string? message) => writer.Write(message);
        public override void WriteLine(string? message) => writer.WriteLine(message);
        public override void Flush() => writer.Flush();
    }
    sealed class LogWriter(string level, string tag = "Console") : TextWriter
    {
        readonly StringBuilder buffer = new();
        public override Encoding Encoding => Encoding.UTF8;
        public override void Flush()
        {
            lock (buffer)
            {
                if (buffer.Length == 0) return;
                Send(new { t = "log", level, tag, msg = buffer.ToString() });
                buffer.Clear();
            }
        }
        public override void Write(char value)
        {
            lock (buffer)
            {
                if (value == '\n') { Send(new { t = "log", level, tag, msg = buffer.ToString().TrimEnd('\r') }); buffer.Clear(); }
                else
                {
                    buffer.Append(value);
                    if (buffer.Length >= 16384)
                    {
                        Send(new { t = "log", level, tag, msg = buffer.ToString() });
                        buffer.Clear();
                    }
                }
            }
        }
    }
}

public sealed class RuntimeTransportException(string message, Exception innerException) : IOException(message, innerException);
