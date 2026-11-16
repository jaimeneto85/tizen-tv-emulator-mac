namespace Tizen.NUI;

public enum DisposeTypes { Explicit, Implicit }
public class Disposable : IDisposable
{
    protected bool disposed;
    public Disposable() { }
    public bool Disposed => disposed;
    public void Dispose() { Dispose(DisposeTypes.Explicit); GC.SuppressFinalize(this); }
    protected virtual void Dispose(DisposeTypes type) { disposed = true; }
    protected virtual void Dispose(bool disposing) { Dispose(disposing ? DisposeTypes.Explicit : DisposeTypes.Implicit); }
}
public class BaseHandle : Binding.Element, IDisposable
{
    protected bool disposed;
    public BaseHandle() { }
    public bool Disposed => disposed;
    public void Dispose() { Dispose(DisposeTypes.Explicit); GC.SuppressFinalize(this); }
    protected virtual void Dispose(DisposeTypes type) { disposed = true; }
    protected virtual void Dispose(bool disposing) { Dispose(disposing ? DisposeTypes.Explicit : DisposeTypes.Implicit); }
    public static bool operator ==(BaseHandle? a, BaseHandle? b) => ReferenceEquals(a, b);
    public static bool operator !=(BaseHandle? a, BaseHandle? b) => !ReferenceEquals(a, b);
    public override bool Equals(object? obj) => ReferenceEquals(this, obj);
    public override int GetHashCode() => System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(this);
}
public class Animatable : BaseHandle { internal Animatable() { } }
public delegate R EventHandlerWithReturnType<T, U, R>(T sender, U e);
public enum HorizontalAlignment { Begin, Center, End }
public enum VerticalAlignment { Top, Center, Bottom }
public class Vector2 : Disposable
{
    public Vector2() { }
    public Vector2(float x, float y) { X = x; Y = y; }
    public float X { get; set; }
    public float Y { get; set; }
    internal float[] Values => [X, Y];
    public static Vector2 Zero => new(0, 0);
    public static Vector2 One => new(1, 1);
}
public class Vector3 : Disposable
{
    public Vector3() { }
    public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; }
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
    internal float[] Values => [X, Y, Z];
    public static Vector3 Zero => new(0, 0, 0);
    public static Vector3 One => new(1, 1, 1);
}
public class Vector4 : Disposable
{
    public Vector4() { }
    public Vector4(float x, float y, float z, float w) { X = x; Y = y; Z = z; W = w; }
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
    public float W { get; set; }
    internal float[] Values => [X, Y, Z, W];
    public static Vector4 Zero => new(0, 0, 0, 0);
    public static Vector4 One => new(1, 1, 1, 1);
    public static implicit operator Vector4(float value) => new(value, value, value, value);
}
public class Position : Disposable
{
    public Position() { }
    public Position(float x, float y, float z = 0) { X = x; Y = y; Z = z; }
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
    internal float[] Values => [X, Y, Z];
    public static implicit operator Vector3(Position value) => new(value.X,value.Y,value.Z);
    public static implicit operator Position(Vector3 value) => new(value.X,value.Y,value.Z);
}
public class Position2D : Disposable
{
    public Position2D() { }
    public Position2D(int x, int y) { X = x; Y = y; }
    public int X { get; set; }
    public int Y { get; set; }
}
public class Size : Disposable
{
    public Size() { }
    public Size(float width, float height, float depth = 0) { Width = width; Height = height; Depth = depth; }
    public float Width { get; set; }
    public float Height { get; set; }
    public float Depth { get; set; }
    internal float[] Values => [Width, Height, Depth];
    public static implicit operator Vector3(Size value) => new(value.Width,value.Height,value.Depth);
    public static implicit operator Size(Vector3 value) => new(value.X,value.Y,value.Z);
}
public class Size2D : Disposable
{
    public Size2D() { }
    public Size2D(int width, int height) { Width = width; Height = height; }
    public int Width { get; set; }
    public int Height { get; set; }
}
public class Color : Disposable
{
    public Color() { }
    public Color(float r, float g, float b, float a) { R = r; G = g; B = b; A = a; }
    public float R { get; set; }
    public float G { get; set; }
    public float B { get; set; }
    public float A { get; set; }
    internal float[] Values => [R, G, B, A];
    public static readonly Color Transparent = new(0,0,0,0);
    public static readonly Color Black = new(0,0,0,1);
    public static readonly Color White = new(1,1,1,1);
    public static readonly Color Red = new(1,0,0,1);
    public static readonly Color Green = new(0,0.5f,0,1);
    public static readonly Color Blue = new(0,0,1,1);
    public static implicit operator Vector4(Color value) => new(value.R,value.G,value.B,value.A);
    public static implicit operator Color(Vector4 value) => new(value.X,value.Y,value.Z,value.W);
}
