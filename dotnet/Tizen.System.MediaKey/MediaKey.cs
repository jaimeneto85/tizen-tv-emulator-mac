using Tvemu.Runtime;

namespace Tizen.System;

public class MediaKeyEventArgs : EventArgs
{
    public enum KeyValue { Play, Stop, Pause, Previous, Next, FastForward, Rewind, PlayPause, Media, Unknown }
    public enum KeyStatus { Pressed, Released, Unknown }
    public KeyValue Value { get; internal set; }
    public KeyStatus Status { get; internal set; }
}

public static class MediaKey
{
    private static EventHandler<MediaKeyEventArgs>? handlers;
    public static event EventHandler<MediaKeyEventArgs> Event
    {
        add
        {
            if (handlers == null) RuntimeEngine.Message += Receive;
            handlers += value;
        }
        remove
        {
            handlers -= value;
            if (handlers == null) RuntimeEngine.Message -= Receive;
        }
    }
    private static void Receive(global::System.Text.Json.JsonElement message)
    {
        if (!message.TryGetProperty("t", out var type) || type.GetString() != "key") return;
        if (!message.TryGetProperty("key", out var key)) return;
        var value = key.GetString() switch
        {
            "MediaPlay" => MediaKeyEventArgs.KeyValue.Play,
            "MediaPause" => MediaKeyEventArgs.KeyValue.Pause,
            "MediaStop" => MediaKeyEventArgs.KeyValue.Stop,
            "MediaPlayPause" => MediaKeyEventArgs.KeyValue.PlayPause,
            "MediaFastForward" => MediaKeyEventArgs.KeyValue.FastForward,
            "MediaRewind" => MediaKeyEventArgs.KeyValue.Rewind,
            "MediaTrackPrevious" => MediaKeyEventArgs.KeyValue.Previous,
            "MediaTrackNext" => MediaKeyEventArgs.KeyValue.Next,
            _ => MediaKeyEventArgs.KeyValue.Unknown
        };
        if (value == MediaKeyEventArgs.KeyValue.Unknown) return;
        var state = message.GetProperty("state").GetString();
        handlers?.Invoke(null, new() { Value = value, Status = state == "down" ? MediaKeyEventArgs.KeyStatus.Pressed : state == "up" ? MediaKeyEventArgs.KeyStatus.Released : MediaKeyEventArgs.KeyStatus.Unknown });
    }
}
