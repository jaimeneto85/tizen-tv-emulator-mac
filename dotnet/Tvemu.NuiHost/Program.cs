using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using Tvemu.Metadata;
using Tvemu.Runtime;

namespace Tvemu.NuiHost;

public static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0] == "inspect") return Inspect(args[1..]);
            var appDirectory = Path.GetFullPath(Option(args, "--app-dir") ?? throw new ArgumentException("--app-dir is required"));
            var executable = Option(args, "--exec") ?? throw new ArgumentException("--exec is required");
            var binaryDirectory = Path.Combine(appDirectory, "bin");
            var appPath = Path.GetFullPath(Path.Combine(binaryDirectory, executable));
            if (!appPath.StartsWith(binaryDirectory + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new ArgumentException("--exec must remain inside app-dir/bin");
            var requestedDataDirectory = Option(args, "--data-dir");
            var dataDirectory = requestedDataDirectory is null ? null : Path.GetFullPath(requestedDataDirectory);
            var entryExitCode = 0;
            var originMap = HttpOriginMap.Install(Environment.GetEnvironmentVariable("TVEMU_HTTP_MAP"));
            RuntimeEngine.Execute(() =>
            {
                RuntimeEngine.Initialize(appDirectory, dataDirectory);
                var context = new ApplicationLoadContext(binaryDirectory, AppContext.BaseDirectory);
                var assembly = context.LoadFromAssemblyPath(appPath);
                var entry = assembly.EntryPoint ?? throw new MissingMethodException($"{appPath} has no entry point");
                var result = entry.Invoke(null, entry.GetParameters().Length == 0 ? null : new object[] { Array.Empty<string>() });
                if (result is Task<int> exitTask) entryExitCode = exitTask.GetAwaiter().GetResult();
                else if (result is Task task) task.GetAwaiter().GetResult();
                else if (result is int exitCode) entryExitCode = exitCode;
            });
            GC.KeepAlive(originMap);
            return RuntimeEngine.ExitCode == 0 ? entryExitCode : RuntimeEngine.ExitCode;
        }
        catch (Exception exception)
        {
            var actual = exception is TargetInvocationException { InnerException: not null } invocation ? invocation.InnerException : exception;
            Console.Error.WriteLine(actual);
            return 1;
        }
    }

    private static string? Option(string[] args, string name)
    {
        var index = Array.IndexOf(args, name);
        if (index < 0) return null;
        return index + 1 < args.Length ? args[index + 1] : throw new ArgumentException($"{name} requires a value");
    }

    private static int Inspect(string[] args)
    {
        var input = args.FirstOrDefault(a => !a.StartsWith("--", StringComparison.Ordinal)) ?? throw new ArgumentException("inspect requires an assembly or application directory");
        var path = Path.GetFullPath(input);
        var paths = File.Exists(path) ? new[] { path } : FindExecutables(path);
        var results = paths.SelectMany(p => MetadataApi.Inspect(p, AppContext.BaseDirectory)).Distinct().ToArray();
        if (args.Contains("--json")) Console.WriteLine(JsonSerializer.Serialize(new { supported = results.Count(x => x.Status == "supported"), missing = results.Count(x => x.Status == "missing"), members = results }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        else
        {
            foreach (var result in results) Console.WriteLine($"{result.Status} {result.Assembly} {result.Type}" + (result.Member is null ? "" : "::" + result.Member));
            Console.WriteLine($"Supported: {results.Count(x => x.Status == "supported")}; Missing: {results.Count(x => x.Status == "missing")}");
        }
        return results.Any(x => x.Status == "missing") ? 2 : 0;
    }

    private static string[] FindExecutables(string directory)
    {
        var manifest = Path.Combine(directory, "tizen-manifest.xml");
        if (File.Exists(manifest))
        {
            var document = System.Xml.Linq.XDocument.Load(manifest);
            var executable = document.Descendants().Select(e => (string?)e.Attribute("exec")).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
            if (executable is not null) return new[] { Path.Combine(directory, "bin", executable) };
        }
        var binaries = Path.Combine(directory, "bin");
        var files = Directory.GetFiles(Directory.Exists(binaries) ? binaries : directory, "*.dll");
        if (files.Length == 0) throw new FileNotFoundException("No application assemblies found", directory);
        return files;
    }
}

public sealed class ApplicationLoadContext : AssemblyLoadContext
{
    private readonly string binaryDirectory;
    private readonly string shimDirectory;
    private readonly HashSet<string> frameworkNames = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? "").Split(Path.PathSeparator).Select(Path.GetFileNameWithoutExtension).OfType<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);

    public ApplicationLoadContext(string binaryDirectory, string shimDirectory) : base("tvemu-application", false)
    {
        this.binaryDirectory = Path.GetFullPath(binaryDirectory);
        this.shimDirectory = Path.GetFullPath(shimDirectory);
    }

    protected override Assembly? Load(AssemblyName assemblyName)
    {
        var name = assemblyName.Name ?? throw new FileLoadException("Assembly name is missing");
        if (name.StartsWith("Tizen", StringComparison.Ordinal))
        {
            var existing = Default.Assemblies.FirstOrDefault(a => a.GetName().Name == name);
            if (existing is not null) return existing;
            var shim = Path.Combine(shimDirectory, name + ".dll");
            if (File.Exists(shim)) return Default.LoadFromAssemblyPath(shim);
            var bundled = Path.Combine(binaryDirectory, name + ".dll");
            if (File.Exists(bundled)) return LoadFromAssemblyPath(bundled);
            throw new FileNotFoundException($"Missing Tizen shim: {name}. Run Tvemu.NuiHost inspect to identify unsupported APIs.", shim);
        }
        if (frameworkNames.Contains(name) || name == "Tvemu.Runtime") return Default.LoadFromAssemblyName(assemblyName);
        var path = Path.Combine(binaryDirectory, name + ".dll");
        return File.Exists(path) ? LoadFromAssemblyPath(path) : null;
    }
}
