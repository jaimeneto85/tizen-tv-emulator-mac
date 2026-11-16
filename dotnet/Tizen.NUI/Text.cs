using System.Text.Json;
using Tvemu.Runtime;
namespace Tizen.NUI.BaseComponents;
public class TextLabel : View
{
    public TextLabel() : base("text") { }
    public TextLabel(string text) : this() { Text = text; }
    public string Text { get => Get("text", ""); set { if (Text == value) return; Set("text",value); Changed(); } }
    public Color TextColor { get => Get("textColorValue",Color.Black); set { Set("textColorValue",value); Set("textColor",value.Values); } }
    public float PointSize { get => PixelSize * 72f / Dpi; set => PixelSize = value * Dpi / 72f; }
    public float PixelSize { get => Get("pixelSize",16f); set => Set("pixelSize",value); }
    static float Dpi => RuntimeEngine.Profile.ValueKind == JsonValueKind.Object && RuntimeEngine.Profile.TryGetProperty("nuiDpi", out var dpi) ? dpi.GetSingle() : 96f;
    public string FontFamily { get => Get("fontFamily", ""); set => Set("fontFamily",value); }
    public PropertyMap FontStyle { get => Get("fontStyleMap",new PropertyMap()); set { Set("fontStyleMap",value); if(value.Value("weight") is object weight) Set("fontWeight",weight); if(value.Value("slant") is object slant) Set("fontStyle",slant); } }
    public HorizontalAlignment HorizontalAlignment { get => Get("horizontal",HorizontalAlignment.Begin); set { Set("horizontal",value); Set("hAlign",value.ToString().ToLowerInvariant()); } }
    void Changed() { }
    public bool MultiLine { get => Get("multiline",false); set => Set("multiline",value); }
    public VerticalAlignment VerticalAlignment { get => Get("vertical",VerticalAlignment.Top); set { Set("vertical",value); Set("vAlign",value.ToString().ToLowerInvariant()); } }
    public bool Ellipsis { get => Get("ellipsis",true); set => Set("ellipsis",value); }
    public float LineSpacing { get => Get("lineSpacing",0f); set => Set("lineSpacing",value); }
}
public class TextField : View
{
    public TextField() : base("field") { }
    public string Text { get => Get("text", ""); set { if (Text == value) return; Set("text",value); Changed(); } }
    public Color TextColor { get => Get("textColorValue",Color.Black); set { Set("textColorValue",value); Set("textColor",value.Values); } }
    public float PointSize { get => PixelSize * 72f / Dpi; set => PixelSize = value * Dpi / 72f; }
    public float PixelSize { get => Get("pixelSize",16f); set => Set("pixelSize",value); }
    static float Dpi => RuntimeEngine.Profile.ValueKind == JsonValueKind.Object && RuntimeEngine.Profile.TryGetProperty("nuiDpi", out var dpi) ? dpi.GetSingle() : 96f;
    public string FontFamily { get => Get("fontFamily", ""); set => Set("fontFamily",value); }
    public PropertyMap FontStyle { get => Get("fontStyleMap",new PropertyMap()); set { Set("fontStyleMap",value); if(value.Value("weight") is object weight) Set("fontWeight",weight); if(value.Value("slant") is object slant) Set("fontStyle",slant); } }
    public HorizontalAlignment HorizontalAlignment { get => Get("horizontal",HorizontalAlignment.Begin); set { Set("horizontal",value); Set("hAlign",value.ToString().ToLowerInvariant()); } }
    public event EventHandler<TextChangedEventArgs>? TextChanged;
    public class TextChangedEventArgs : EventArgs { public TextField TextField { get; set; } = null!; }
    void Changed() => TextChanged?.Invoke(this,new TextChangedEventArgs { TextField = this });
    public string PlaceholderText { get => Get("placeholder", ""); set => Set("placeholder",value); }
    public Vector4 PlaceholderTextColor { get => Get("placeholderValue",Vector4.Zero); set { Set("placeholderValue",value); Set("placeholderColor",value.Values); } }
    public int MaxLength { get => Get("maxLength",int.MaxValue); set => Set("maxLength",value); }
    public PropertyMap HiddenInputSettings { get => Get("hiddenInput",new PropertyMap()); set { Set("hiddenInput",value); Set("hidden",Convert.ToInt32(value.Value(HiddenInputProperty.Mode) ?? 0) != 0); } }
    public PropertyMap InputMethodSettings { get => Get("inputMethod",new PropertyMap()); set => Set("inputMethod",value); }
    InputMethodContext? context;
    public InputMethodContext GetInputMethodContext() => context ??= new InputMethodContext(this);
    internal void Input(string value) { Text = value.Length <= MaxLength ? value : value[..MaxLength]; }
}
