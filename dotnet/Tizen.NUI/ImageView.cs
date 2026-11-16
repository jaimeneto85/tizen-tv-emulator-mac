using System.Buffers.Binary;
using Tvemu.Runtime;

namespace Tizen.NUI.BaseComponents;

public class ImageView : View
{
    public enum LoadingStatusType { Preparing, Ready, Failed }
    public class ResourceReadyEventArgs : EventArgs { public View View { get; set; } = null!; }
    public event EventHandler<ResourceReadyEventArgs>? ResourceReady;
    LoadingStatusType status;
    string url = "";
    bool synchronous;
    bool completedSynchronously;
    PropertyMap image = new();
    public ImageView() : base("image") { }
    public ImageView(string resourceUrl) : this() { ResourceUrl = resourceUrl; }
    public string ResourceUrl
    {
        get => url;
        set
        {
            RuntimeEngine.AssertUiThread();
            ObjectDisposedException.ThrowIf(Disposed, this);
            var requested = value ?? "";
            var resolved = ResolveResource(requested);
            var remote = Uri.TryCreate(resolved, UriKind.Absolute, out var uri) && !uri.IsFile;
            if (synchronous && remote) RuntimeEngine.Missing("Tizen.NUI.BaseComponents.ImageView::SynchronousLoading(http)");
            url = requested;
            status = LoadingStatusType.Preparing;
            completedSynchronously = false;
            Set("url", resolved);
            if (!synchronous || requested.Length == 0) return;
            (int Width, int Height) dimensions;
            try { dimensions = ReadDimensions(resolved); }
            catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException or ArgumentException)
            {
                completedSynchronously = true;
                Loaded(false);
                return;
            }
            Measure(dimensions.Width, dimensions.Height);
            completedSynchronously = true;
            Loaded(true);
        }
    }
    public bool SynchronousLoading
    {
        get => synchronous;
        set
        {
            RuntimeEngine.AssertUiThread();
            ObjectDisposedException.ThrowIf(Disposed, this);
            synchronous = value;
        }
    }
    public LoadingStatusType LoadingStatus => status;
    public PropertyMap Image
    {
        get => image;
        set
        {
            RuntimeEngine.AssertUiThread();
            ObjectDisposedException.ThrowIf(Disposed, this);
            ArgumentNullException.ThrowIfNull(value);
            image = value;
            if ((value.Value(ImageVisualProperty.SynchronousLoading) ?? value.Value("synchronousLoading")) is bool sync) SynchronousLoading = sync;
            if ((value.Value(ImageVisualProperty.URL) ?? value.Value("url")) is string resource) ResourceUrl = resource;
            if ((value.Value(ImageVisualProperty.FittingMode) ?? value.Value("fittingMode")) is int fitting)
            {
                if (fitting is not 0 and not 1 and not 4 and not 5) RuntimeEngine.Missing("Tizen.NUI.BaseComponents.ImageView::Image(fittingMode)");
                Set("fitting", fitting switch { 0 => "contain", 1 => "cover", 4 => "center", _ => "fill" });
            }
        }
    }
    internal void Loaded(bool success)
    {
        RuntimeEngine.AssertUiThread();
        if (Disposed) return;
        var next = success ? LoadingStatusType.Ready : LoadingStatusType.Failed;
        if (completedSynchronously && status == next) return;
        status = next;
        ResourceReady?.Invoke(this, new ResourceReadyEventArgs { View = this });
    }
    static string ResolveResource(string value)
    {
        if (value.Length == 0) return "";
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && !uri.IsFile)
        {
            if (uri.Scheme is not "http" and not "https") RuntimeEngine.Missing("Tizen.NUI.BaseComponents.ImageView::ResourceUrl(URI scheme)");
            return value;
        }
        var root = Path.GetFullPath(RuntimeEngine.AppDir);
        var resolved = Path.GetFullPath(uri?.LocalPath ?? value, root);
        EnsureContained(root, resolved);
        var canonicalRoot = ResolveLinks(root);
        var canonicalFile = ResolveLinks(resolved);
        EnsureContained(canonicalRoot, canonicalFile);
        return resolved;
    }
    static void EnsureContained(string root, string path)
    {
        var relative = Path.GetRelativePath(root, path);
        if (relative == ".." || relative.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new ArgumentException("Image must be inside the app install directory");
    }
    static string ResolveLinks(string path)
    {
        var current = Path.GetPathRoot(path)!;
        foreach (var part in path[current.Length..].Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            current = Path.Combine(current, part);
            FileSystemInfo entry = Directory.Exists(current) ? new global::System.IO.DirectoryInfo(current) : new FileInfo(current);
            if (entry.LinkTarget != null) current = entry.ResolveLinkTarget(true)?.FullName ?? throw new IOException("Image symlink could not be resolved");
        }
        return Path.GetFullPath(current);
    }
    static (int Width, int Height) ReadDimensions(string path)
    {
        using var stream = File.OpenRead(path);
        Span<byte> header = stackalloc byte[32];
        var read = stream.ReadAtLeast(header, (int)Math.Min(32, stream.Length), false);
        if (read >= 24 && header[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) && header.Slice(12, 4).SequenceEqual("IHDR"u8))
            return ValidateDimensions(BinaryPrimitives.ReadInt32BigEndian(header[16..]), BinaryPrimitives.ReadInt32BigEndian(header[20..]));
        if (read >= 10 && (header[..6].SequenceEqual("GIF87a"u8) || header[..6].SequenceEqual("GIF89a"u8)))
            return ValidateDimensions(BinaryPrimitives.ReadUInt16LittleEndian(header[6..]), BinaryPrimitives.ReadUInt16LittleEndian(header[8..]));
        if (read >= 26 && header[..2].SequenceEqual("BM"u8))
        {
            var height = BinaryPrimitives.ReadInt32LittleEndian(header[22..]);
            if (height == int.MinValue) throw new InvalidDataException("Invalid bitmap dimensions");
            return ValidateDimensions(BinaryPrimitives.ReadInt32LittleEndian(header[18..]), Math.Abs(height));
        }
        if (read >= 2 && header[0] == 255 && header[1] == 216)
        {
            stream.Position = 2;
            while (stream.Position < stream.Length)
            {
                if (stream.ReadByte() != 255) throw new InvalidDataException("Invalid JPEG marker");
                int marker;
                do { marker = stream.ReadByte(); } while (marker == 255);
                if (marker < 0 || marker is 217 or 218) break;
                if (marker is 1 or >= 208 and <= 215) continue;
                stream.ReadExactly(header[..2]);
                var length = BinaryPrimitives.ReadUInt16BigEndian(header);
                if (length < 2 || stream.Position + length - 2 > stream.Length) throw new InvalidDataException("Invalid JPEG segment");
                if (marker is >= 192 and <= 195 or >= 197 and <= 199 or >= 201 and <= 203 or >= 205 and <= 207)
                {
                    if (length < 7) throw new InvalidDataException("Invalid JPEG dimensions");
                    stream.ReadExactly(header[..5]);
                    return ValidateDimensions(BinaryPrimitives.ReadUInt16BigEndian(header[3..]), BinaryPrimitives.ReadUInt16BigEndian(header[1..]));
                }
                stream.Seek(length - 2, SeekOrigin.Current);
            }
            throw new InvalidDataException("JPEG dimensions unavailable");
        }
        RuntimeEngine.Missing("Tizen.NUI.BaseComponents.ImageView::SynchronousLoading(image format)");
        throw new NotSupportedException();
    }
    static (int Width, int Height) ValidateDimensions(int width, int height)
    {
        if (width <= 0 || height <= 0) throw new InvalidDataException("Invalid image dimensions");
        return (width, height);
    }
}
