using System.Diagnostics;
using System.Net.Http;

namespace Tvemu.NuiHost;

public sealed class HttpOriginMap : IObserver<DiagnosticListener>, IObserver<KeyValuePair<string, object?>>
{
    private readonly (Uri From, Uri To)[] routes;
    private readonly List<IDisposable> subscriptions = new();

    private HttpOriginMap((Uri, Uri)[] routes) => this.routes = routes;

    public static HttpOriginMap? Install(string? specification)
    {
        if (string.IsNullOrWhiteSpace(specification)) return null;
        var routes = specification.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(Parse).ToArray();
        var map = new HttpOriginMap(routes);
        map.subscriptions.Add(DiagnosticListener.AllListeners.Subscribe(map));
        foreach (var (from, to) in routes) Console.Error.WriteLine($"[tvemu] HTTP origin {Origin(from)} is served by {Origin(to)}");
        return map;
    }

    private static (Uri, Uri) Parse(string route)
    {
        var parts = route.Split('=', 2);
        if (parts.Length != 2 || !Uri.TryCreate(parts[0], UriKind.Absolute, out var from) || !Uri.TryCreate(parts[1], UriKind.Absolute, out var to))
            throw new ArgumentException($"Invalid TVEMU_HTTP_MAP entry: {route}. Expected <origin>=<origin>.");
        if (!to.IsLoopback) throw new ArgumentException($"TVEMU_HTTP_MAP target must be a loopback address: {parts[1]}");
        return (from, to);
    }

    private static string Origin(Uri uri) => uri.GetLeftPart(UriPartial.Authority);

    public void OnNext(DiagnosticListener listener)
    {
        if (listener.Name == "HttpHandlerDiagnosticListener") subscriptions.Add(listener.Subscribe(this));
    }

    public void OnNext(KeyValuePair<string, object?> diagnostic)
    {
        if (diagnostic.Key != "System.Net.Http.HttpRequestOut.Start" || diagnostic.Value is null) return;
        if (diagnostic.Value.GetType().GetProperty("Request")?.GetValue(diagnostic.Value) is not HttpRequestMessage request || request.RequestUri is null) return;
        foreach (var (from, to) in routes)
        {
            if (!string.Equals(Origin(from), Origin(request.RequestUri), StringComparison.OrdinalIgnoreCase)) continue;
            request.RequestUri = new UriBuilder(request.RequestUri) { Scheme = to.Scheme, Host = to.Host, Port = to.Port }.Uri;
            return;
        }
    }

    public void OnCompleted() { }
    public void OnError(Exception error) { }
}
