using Tvemu.Runtime;

namespace Tizen.Applications;

public abstract class Application : IDisposable
{
    public static Application Current { get; private set; } = null!;
    public DirectoryInfo DirectoryInfo { get; } = new();
    public virtual void Run(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);
        Current = this;
    }
    public abstract void Exit();
    protected virtual void Dispose(bool disposing) { }
    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }
}

public class DirectoryInfo
{
    internal DirectoryInfo() { }
    private static string PathAt(string root, params string[] parts) => Path.Combine([root, .. parts]) + Path.DirectorySeparatorChar;
    private static string Writable(params string[] parts)
    {
        var path = PathAt(RuntimeEngine.DataDir, parts);
        Directory.CreateDirectory(path);
        return path;
    }
    public string Resource => PathAt(RuntimeEngine.AppDir, "res");
    public string SharedResource => PathAt(RuntimeEngine.AppDir, "shared", "res");
    public string Data => Writable();
    public string Cache => Writable("cache");
    public string SharedData => Writable("shared", "data");
    public string SharedTrusted => Writable("shared", "trusted");
    public string ExternalData => Writable("external", "data");
    public string ExternalCache => Writable("external", "cache");
    public string ExternalSharedData => Writable("external", "shared", "data");
    public string ExpansionPackageResource => PathAt(RuntimeEngine.AppDir, "res");
}

public class CoreApplication : Application
{
    internal CoreApplication() { }
    public event EventHandler? Created;
    public event EventHandler? Terminated;
    protected virtual void OnCreate() => Created?.Invoke(this, EventArgs.Empty);
    protected virtual void OnTerminate() => Terminated?.Invoke(this, EventArgs.Empty);
    public override void Exit() => RuntimeEngine.RequestExit();
    public static void Post(Action runner)
    {
        ArgumentNullException.ThrowIfNull(runner);
        RuntimeEngine.Post(runner);
    }
    public static Task<T> Post<T>(Func<T> runner)
    {
        ArgumentNullException.ThrowIfNull(runner);
        var completion = new TaskCompletionSource<T>();
        RuntimeEngine.Post(() =>
        {
            try { completion.SetResult(runner()); }
            catch (Exception error) { completion.SetException(error); }
        });
        return completion.Task;
    }
}
