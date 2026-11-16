using System.Text.Json;
using Tvemu.Runtime;

namespace Tizen.Multimedia;

public enum PlayerState { Idle = 1, Ready, Playing, Paused, Preparing }
public enum PlayerError
{
    NoSuchFile = -2, InternalError = -38, NoSpaceOnDevice = -28, BufferSpace = -105,
    SeekFailed = unchecked((int)0xfe6c0021), InvalidState = unchecked((int)0xfe6c0022),
    NotSupportedFile = unchecked((int)0xfe6c0023), InvalidUri = unchecked((int)0xfe6c0024),
    ConnectionFailed = unchecked((int)0xfe6c0026), DrmNotPermitted = unchecked((int)0xfe6c002b),
    ServiceDisconnected = unchecked((int)0xfe6c002d), AudioCodecNotSupported = unchecked((int)0xfe6c002e),
    VideoCodecNotSupported = unchecked((int)0xfe6c002f), SubtitleNotSupported = unchecked((int)0xfe6c0030)
}
public class PlayerErrorOccurredEventArgs : EventArgs
{
    public PlayerErrorOccurredEventArgs(PlayerError error) => Error = error;
    public PlayerError Error { get; }
    public override string ToString() => $"Error={Error}";
}
public abstract class MediaSource
{
    internal MediaSource() { }
}
public sealed class MediaUriSource : MediaSource
{
    public MediaUriSource(string uri)
    {
        ArgumentNullException.ThrowIfNull(uri);
        Uri = uri;
    }
    public string Uri { get; }
}
public class StreamInfo
{
    internal StreamInfo(Player player) => Player = player;
    public Player Player { get; }
    public int GetDuration()
    {
        Player.Validate(PlayerState.Ready, PlayerState.Playing, PlayerState.Paused);
        return Player.Duration;
    }
    public long GetDurationNanoseconds() => (long)GetDuration() * 1_000_000;
}
public class Player : IDisposable
{
    private readonly int id;
    private PlayerState state = PlayerState.Idle;
    private bool disposed;
    private bool sourceClosed;
    private Display? display;
    private MediaUriSource? source;
    private int position;
    private float volume = 1;
    private bool muted;
    private TaskCompletionSource? preparing;
    private TaskCompletionSource? seeking;
    private CancellationTokenRegistration cancellation;
    internal int Duration { get; private set; }
    public Player()
    {
        RuntimeEngine.AssertUiThread();
        id = RuntimeEngine.AllocateId();
        StreamInfo = new(this);
        RuntimeEngine.Message += Receive;
    }
    private void Check()
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        RuntimeEngine.AssertUiThread();
    }
    internal void Validate(params PlayerState[] allowed)
    {
        Check();
        if (!allowed.Contains(state)) throw new InvalidOperationException($"Player is {state}; expected {string.Join(", ", allowed)}.");
    }
    private void Send(string operation) => RuntimeEngine.Send(new { t = "player", id, op = operation });
    public PlayerState State { get { Check(); return state; } }
    public StreamInfo StreamInfo { get; }
    public Display Display
    {
        get { Check(); return display!; }
        set
        {
            Validate(PlayerState.Idle);
            display = value;
            RuntimeEngine.Send(new { t = "player", id, op = "display", mode = value == null ? "none" : "window" });
        }
    }
    public float Volume
    {
        get { Check(); return volume; }
        set
        {
            Check();
            if (!float.IsFinite(value) || value < 0 || value > 1) throw new ArgumentOutOfRangeException(nameof(value));
            volume = value;
            RuntimeEngine.Send(new { t = "player", id, op = "volume", value });
        }
    }
    public bool Muted
    {
        get { Check(); return muted; }
        set { Check(); muted = value; RuntimeEngine.Send(new { t = "player", id, op = "mute", value }); }
    }
    public event EventHandler<PlayerErrorOccurredEventArgs>? ErrorOccurred;
    public event EventHandler<EventArgs>? PlaybackCompleted;
    public void SetSource(MediaSource source)
    {
        Validate(PlayerState.Idle);
        ArgumentNullException.ThrowIfNull(source);
        this.source = source as MediaUriSource ?? throw new NotSupportedException("Only URI media sources are supported.");
        sourceClosed = false;
        RuntimeEngine.Send(new { t = "player", id, op = "open", url = this.source.Uri });
    }
    public virtual Task PrepareAsync() => PrepareAsync(CancellationToken.None);
    public virtual Task PrepareAsync(CancellationToken cancellationToken)
    {
        Validate(PlayerState.Idle);
        if (source == null) throw new InvalidOperationException("Set a source before preparing.");
        if (cancellationToken.IsCancellationRequested) return Task.FromCanceled(cancellationToken);
        if (sourceClosed)
        {
            RuntimeEngine.Send(new { t = "player", id, op = "open", url = source.Uri });
            sourceClosed = false;
        }
        state = PlayerState.Preparing;
        var completion = preparing = new();
        cancellation = cancellationToken.Register(() => RuntimeEngine.Post(() =>
        {
            if (preparing != completion) return;
            preparing = null;
            state = PlayerState.Idle;
            Send("close");
            sourceClosed = true;
            completion.TrySetCanceled(cancellationToken);
        }));
        Send("prepare");
        return completion.Task;
    }
    public virtual void Start()
    {
        Validate(PlayerState.Ready, PlayerState.Paused, PlayerState.Playing);
        state = PlayerState.Playing;
        Send("start");
    }
    public virtual void Pause()
    {
        Validate(PlayerState.Playing, PlayerState.Paused);
        if (state == PlayerState.Paused) return;
        state = PlayerState.Paused;
        Send("pause");
    }
    public virtual void Stop()
    {
        Validate(PlayerState.Playing, PlayerState.Paused);
        state = PlayerState.Ready;
        position = 0;
        Send("stop");
    }
    public virtual void Unprepare()
    {
        Validate(PlayerState.Ready, PlayerState.Playing, PlayerState.Paused, PlayerState.Idle);
        if (state == PlayerState.Idle) return;
        state = PlayerState.Idle;
        source = null;
        position = Duration = 0;
        seeking?.TrySetException(new InvalidOperationException("Player unprepared during seek."));
        seeking = null;
        Send("close");
    }
    public int GetPlayPosition() { Validate(PlayerState.Ready, PlayerState.Playing, PlayerState.Paused); return position; }
    public Task SetPlayPositionAsync(int position, bool accurate)
    {
        Validate(PlayerState.Ready, PlayerState.Playing, PlayerState.Paused);
        if (position < 0) throw new ArgumentOutOfRangeException(nameof(position));
        if (seeking != null) throw new InvalidOperationException("A seek is already pending.");
        seeking = new();
        RuntimeEngine.Send(new { t = "player", id, op = "seek", ms = position });
        return seeking.Task;
    }
    public void SetPlaybackRate(float rate)
    {
        Validate(PlayerState.Ready, PlayerState.Playing, PlayerState.Paused);
        if (!float.IsFinite(rate) || rate < -5 || rate > 5 || rate == 0) throw new ArgumentOutOfRangeException(nameof(rate));
        RuntimeEngine.Send(new { t = "player", id, op = "rate", value = rate });
    }
    private void Receive(JsonElement message)
    {
        if (!message.TryGetProperty("t", out var type) || type.GetString() != "player" || !message.TryGetProperty("id", out var playerId) || playerId.GetInt32() != id) return;
        if (!message.TryGetProperty("event", out var kind)) return;
        var playerEvent = kind.GetString();
        var accepted = playerEvent switch
        {
            "prepared" => state == PlayerState.Preparing && preparing != null,
            "playing" => state == PlayerState.Playing,
            "paused" => state == PlayerState.Paused,
            "ended" => state == PlayerState.Playing,
            "seeked" => seeking != null && state is PlayerState.Ready or PlayerState.Playing or PlayerState.Paused,
            "time" => state is PlayerState.Playing or PlayerState.Paused,
            "error" => true,
            _ => false
        };
        if (!accepted) return;
        if (message.TryGetProperty("positionMs", out var time)) position = time.GetInt32();
        if (message.TryGetProperty("durationMs", out var duration)) Duration = duration.GetInt32();
        switch (playerEvent)
        {
            case "prepared" when preparing != null:
                state = PlayerState.Ready;
                cancellation.Dispose();
                var prepared = preparing;
                preparing = null;
                prepared.TrySetResult();
                break;
            case "playing": break;
            case "paused": break;
            case "ended":
                state = PlayerState.Ready;
                PlaybackCompleted?.Invoke(this, EventArgs.Empty);
                break;
            case "seeked":
                var seek = seeking;
                seeking = null;
                seek?.TrySetResult();
                break;
            case "error":
                var error = new InvalidOperationException(message.TryGetProperty("message", out var detail) ? detail.GetString() : "Media playback failed.");
                state = PlayerState.Idle;
                cancellation.Dispose();
                var prepareFailure = preparing;
                var seekFailure = seeking;
                preparing = seeking = null;
                prepareFailure?.TrySetException(error);
                seekFailure?.TrySetException(error);
                ErrorOccurred?.Invoke(this, new(PlayerError.InternalError));
                break;
        }
    }
    protected virtual void Dispose(bool disposing)
    {
        if (disposed) return;
        Check();
        disposed = true;
        RuntimeEngine.Message -= Receive;
        cancellation.Dispose();
        preparing?.TrySetException(new ObjectDisposedException(nameof(Player)));
        seeking?.TrySetException(new ObjectDisposedException(nameof(Player)));
        preparing = seeking = null;
        Send("close");
    }
    public void Dispose() { Dispose(true); GC.SuppressFinalize(this); }
}
