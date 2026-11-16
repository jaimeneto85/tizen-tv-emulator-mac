using Tvemu.Runtime;

namespace Tizen.System;

public static class Information
{
    public static bool TryGetValue<T>(string key, out T value)
    {
        ArgumentNullException.ThrowIfNull(key);
        var profile = RuntimeEngine.Profile;
        var field = key switch
        {
            "http://tizen.org/system/model_name" => "model",
            "http://tizen.org/system/platform.version" => "tizenVersion",
            "http://tizen.org/system/platform.version.name" => "tizenVersion",
            "http://tizen.org/system/build.string" => "firmware",
            "http://tizen.org/feature/screen.width" => "width",
            "http://tizen.org/feature/screen.height" => "height",
            _ => ""
        };
        if (field != "" && profile.ValueKind == global::System.Text.Json.JsonValueKind.Object && profile.TryGetProperty(field, out var item))
        {
            try { value = global::System.Text.Json.JsonSerializer.Deserialize<T>(item.GetRawText())!; return true; }
            catch (global::System.Text.Json.JsonException) { value = default!; return false; }
        }
        object? result = key switch
        {
            "http://tizen.org/feature/profile" => "tv",
            "http://tizen.org/system/platform.name" => "Tizen",
            "http://tizen.org/feature/network.internet" => true,
            "http://tizen.org/feature/network.wifi" => true,
            "http://tizen.org/feature/opengles" => true,
            "http://tizen.org/feature/screen" => true,
            "http://tizen.org/feature/screen.width" => 1920,
            "http://tizen.org/feature/screen.height" => 1080,
            _ => null
        };
        if (result is T typed) { value = typed; return true; }
        value = default!;
        return false;
    }
}
