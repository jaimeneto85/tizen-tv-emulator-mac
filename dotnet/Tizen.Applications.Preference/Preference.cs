using System.Text.Json;
using Tvemu.Runtime;

namespace Tizen.Applications;

public class PreferenceChangedEventArgs : EventArgs
{
    public string Key { get; internal set; } = "";
}

public static class Preference
{
    private sealed record Entry(string Type, JsonElement Value);
    private static readonly object Gate = new();
    private static readonly Dictionary<string, EventContext> Contexts = new();
    private static string FilePath => Path.Combine(RuntimeEngine.DataDir, "preferences.json");
    private static string ContextKey(string key) => FilePath + "\0" + key;
    private static void Validate(string key)
    {
        if (string.IsNullOrEmpty(key) || key.Contains('\0')) throw new ArgumentException("Invalid preference key.", nameof(key));
    }
    private static Dictionary<string, Entry> Read()
    {
        if (!File.Exists(FilePath)) return new();
        try { return JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(FilePath)) ?? new(); }
        catch (JsonException error) { throw new IOException("Invalid preferences JSON.", error); }
    }
    private static void Write(Dictionary<string, Entry> entries)
    {
        Directory.CreateDirectory(RuntimeEngine.DataDir);
        var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temporary, JsonSerializer.Serialize(entries));
            File.Move(temporary, FilePath, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static string TypeName(Type type)
    {
        if (type == typeof(int)) return "int";
        if (type == typeof(double)) return "double";
        if (type == typeof(string)) return "string";
        if (type == typeof(bool)) return "bool";
        throw new ArgumentException("Preferences support only int, double, string and bool.");
    }
    private static void Notify(string key)
    {
        EventContext? context;
        lock (Gate) Contexts.TryGetValue(ContextKey(key), out context);
        if (context != null) RuntimeEngine.Post(context.Fire);
    }
    public static IEnumerable<string> Keys { get { lock (Gate) return Read().Keys.ToArray(); } }
    public static bool Contains(string key)
    {
        Validate(key);
        lock (Gate) return Read().ContainsKey(key);
    }
    public static void Set(string key, object value)
    {
        Validate(key);
        if (value == null) throw new ArgumentException("Null preferences are unsupported.", nameof(value));
        var type = TypeName(value.GetType());
        if (value is double number && !double.IsFinite(number)) throw new ArgumentException("Preference must be finite.", nameof(value));
        lock (Gate)
        {
            var entries = Read();
            entries[key] = new(type, JsonSerializer.SerializeToElement(value));
            Write(entries);
        }
        Notify(key);
    }
    public static T Get<T>(string key)
    {
        Validate(key);
        var type = TypeName(typeof(T));
        lock (Gate)
        {
            if (!Read().TryGetValue(key, out var entry)) throw new KeyNotFoundException(key);
            if (entry.Type != type) throw new ArgumentException("Preference type does not match.", nameof(key));
            return entry.Value.Deserialize<T>()!;
        }
    }
    public static void Remove(string key)
    {
        Validate(key);
        lock (Gate)
        {
            var entries = Read();
            if (!entries.Remove(key)) throw new KeyNotFoundException(key);
            Write(entries);
        }
        Notify(key);
    }
    public static void RemoveAll()
    {
        string[] keys;
        lock (Gate) { keys = Read().Keys.ToArray(); Write(new()); }
        foreach (var key in keys) Notify(key);
    }
    public static WeakReference<EventContext> GetEventContext(string key)
    {
        Validate(key);
        lock (Gate)
        {
            if (!Read().ContainsKey(key)) throw new KeyNotFoundException(key);
            var contextKey = ContextKey(key);
            if (!Contexts.TryGetValue(contextKey, out var context)) Contexts[contextKey] = context = new(key);
            return new(context);
        }
    }
    public class EventContext
    {
        private readonly string key;
        internal EventContext(string key) => this.key = key;
        private EventHandler<PreferenceChangedEventArgs>? changed;
        public event EventHandler<PreferenceChangedEventArgs> Changed
        {
            add
            {
                if (changed == null && !Contains(key)) throw new ArgumentException("Preference key does not exist.", nameof(key));
                changed += value;
            }
            remove
            {
                changed -= value;
                if (changed == null)
                {
                    lock (Gate) Contexts.Remove(ContextKey(key));
                }
            }
        }
        internal void Fire() => changed?.Invoke(null, new() { Key = key });
    }
}
