namespace Tizen.NUI;

public class PropertyValue : Disposable
{
    internal object? Value;
    public PropertyValue() { }
    public PropertyValue(bool value) { Value = value; }
    public PropertyValue(int value) { Value = value; }
    public PropertyValue(float value) { Value = value; }
    public PropertyValue(string value) { Value = value; }
    public PropertyValue(Color value) { Value = value; }
    public PropertyValue(Vector3 value) { Value = value; }
    public PropertyValue(Vector4 value) { Value = value; }
    public PropertyValue(PropertyMap value) { Value = value; }
    public bool Get(out int value) { value = Value is int number ? number : 0; return Value is int; }
    public bool Get(out float value) { value = Value is float number ? number : 0; return Value is float; }
    public bool Get(out bool value) { value = Value is bool flag && flag; return Value is bool; }
    public bool Get(out string value) { value = Value as string ?? ""; return Value is string; }
}
public class PropertyMap : Disposable
{
    readonly Dictionary<object, PropertyValue> values = new();
    public PropertyMap() { }
    public PropertyMap(PropertyMap map) { foreach (var pair in map.values) values[pair.Key] = pair.Value; }
    public PropertyMap Add(int key, PropertyValue value) { values[key] = value; return this; }
    public PropertyMap Add(string key, PropertyValue value) { values[key] = value; return this; }
    public void Insert(int key, PropertyValue value) => Add(key,value);
    public void Insert(string key, PropertyValue value) => Add(key,value);
    public PropertyValue this[int key] { get => values.TryGetValue(key,out var value) ? value : new(); set => values[key] = value; }
    public PropertyValue this[string key] { get => values.TryGetValue(key,out var value) ? value : new(); set => values[key] = value; }
    public uint Count() => (uint)values.Count;
    public bool Empty() => values.Count == 0;
    public void Clear() => values.Clear();
    internal object? Value(object key) => values.TryGetValue(key,out var value) ? value.Value : null;
}
public struct Visual
{
    public enum Type { Border, Color, Gradient, Image, Mesh, Primitive, Wireframe, Text, NPatch, SVG, AnimatedImage, AnimatedGradient, AnimatedVectorImage, Arc, Invalid = -1 }
    public struct Property
    {
        public static readonly int Type = 60000000;
        public static readonly int MixColor = 60000004;
        public static readonly int Opacity = 60000005;
    }
}
public struct BorderVisualProperty
{
    public static readonly int Color = 60000101;
    public static readonly int Size = 60000102;
}
public struct ImageVisualProperty
{
    public static readonly int URL = 60000101;
    public static readonly int FittingMode = 60000102;
    public static readonly int SynchronousLoading = 60000106;
}
public struct HiddenInputProperty { public static readonly int Mode = 0; }
