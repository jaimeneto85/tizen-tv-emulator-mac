using Tvemu.Runtime;
namespace Tizen.NUI.BaseComponents;

public class View : Container
{
    internal static readonly Dictionary<int, View> Nodes = new();
    readonly Dictionary<string, object?> values = new();
    readonly int id;
    int borderId;
    internal override int NodeId => id;
    internal View(string kind)
    {
        id = RuntimeEngine.AllocateId();
        Nodes[id] = this;
        RuntimeEngine.Scene("create", id, kind);
        Set("pivot", new float[] { 0.5f, 0.5f });
        if (kind == "view") { Set("w", 0f); Set("h", 0f); }
        else { Set("w", null); Set("h", null); }
    }
    public View() : this("view") { }
    internal void Set(string key, object? value)
    {
        RuntimeEngine.AssertUiThread();
        ObjectDisposedException.ThrowIf(Disposed, this);
        values[key] = value;
        if (WireProperties.Contains(key)) RuntimeEngine.Scene("set", id, new Dictionary<string, object?> { [key] = value });
    }
    static readonly HashSet<string> WireProperties = new("x y w h visible opacity scale pivot bg radius borderWidth borderColor clip name text textColor pixelSize multiline hAlign vAlign ellipsis fontFamily fontWeight fontStyle lineSpacing placeholder placeholderColor hidden maxLength url fitting".Split(' '));
    internal T Get<T>(string key, T fallback) => values.TryGetValue(key, out var value) && value is T typed ? typed : fallback;
    internal void Geometry()
    {
        var parentView = Parent as View;
        var width = parentView?.SizeWidth ?? Window.Instance.Size.Width;
        var height = parentView?.SizeHeight ?? Window.Instance.Size.Height;
        Set("x", position.X + origin.X * width - (usesPivot ? pivot.X * size.Width : 0));
        Set("y", position.Y + origin.Y * height - (usesPivot ? pivot.Y * size.Height : 0));
    }
    Position position = new();
    Size size = new();
    Position origin = new(0,0,0.5f);
    Position pivot = new(0.5f,0.5f,0.5f);
    bool usesPivot;
    public Position Position { get => new(position.X,position.Y,position.Z); set { RuntimeEngine.AssertUiThread(); position = new(value.X,value.Y,value.Z); Geometry(); } }
    public Position2D Position2D { get => new((int)position.X,(int)position.Y); set { RuntimeEngine.AssertUiThread(); position = new(value.X,value.Y,position.Z); Geometry(); } }
    public float PositionX { get => position.X; set { RuntimeEngine.AssertUiThread(); position.X = value; Geometry(); } }
    public float PositionY { get => position.Y; set { RuntimeEngine.AssertUiThread(); position.Y = value; Geometry(); } }
    public Size Size { get => new(size.Width,size.Height,size.Depth); set { RuntimeEngine.AssertUiThread(); size = new(value.Width,value.Height,value.Depth); Resize(); } }
    public Size2D Size2D { get => new((int)size.Width,(int)size.Height); set { RuntimeEngine.AssertUiThread(); size = new(value.Width,value.Height,size.Depth); Resize(); } }
    public float SizeWidth { get => size.Width; set { RuntimeEngine.AssertUiThread(); size.Width = value; Resize(); } }
    public float SizeHeight { get => size.Height; set { RuntimeEngine.AssertUiThread(); size.Height = value; Resize(); } }
    internal void Measure(float width,float height)
    {
        RuntimeEngine.AssertUiThread();
        if (!values.TryGetValue("w",out var w) || w == null) size.Width = width;
        if (!values.TryGetValue("h",out var h) || h == null) size.Height = height;
        Geometry();
        foreach(var child in Children) child.Geometry();
    }
    void Resize() { Set("w",size.Width); Set("h",size.Height); Geometry(); foreach (var child in Children) child.Geometry(); UpdateBorder(); }
    public Position ParentOrigin { get => new(origin.X,origin.Y,origin.Z); set { RuntimeEngine.AssertUiThread(); origin = value; Geometry(); } }
    public Position PivotPoint { get => new(pivot.X,pivot.Y,pivot.Z); set { RuntimeEngine.AssertUiThread(); pivot = value; Set("pivot",new[] { value.X,value.Y }); Geometry(); } }
    public bool PositionUsesPivotPoint { get => usesPivot; set { RuntimeEngine.AssertUiThread(); usesPivot = value; Geometry(); } }
    public Vector3 Scale { get => Get("scaleValue",Vector3.One); set { RuntimeEngine.AssertUiThread(); Set("scaleValue",value); Set("scale",new[] {value.X,value.Y}); } }
    public Color BackgroundColor { get => Get("bgValue",Color.Transparent); set { RuntimeEngine.AssertUiThread(); Set("bgValue",value); Set("bg",value.Values); } }
    public Color BorderlineColor { get => Get("borderValue",Color.Black); set { RuntimeEngine.AssertUiThread(); Set("borderValue",value); UpdateBorder(); } }
    public Vector4 CornerRadius { get => Get("radiusValue",Vector4.Zero); set { RuntimeEngine.AssertUiThread(); Set("radiusValue",value); Set("radius",value.Values); UpdateBorder(); } }
    public float BorderlineOffset { get => Get("borderOffset",0f); set { RuntimeEngine.AssertUiThread(); Set("borderOffset",value); UpdateBorder(); } }
    public PropertyMap Background { get => Get("background",new PropertyMap()); set { RuntimeEngine.AssertUiThread(); values["background"] = value; ApplyBackground(value); } }
    void ApplyBackground(PropertyMap map)
    {
        if (map.Value(Visual.Property.Type) is int type && type == (int)Visual.Type.Border)
        {
            if (map.Value(BorderVisualProperty.Color) is Color color) BorderlineColor = color;
            if (map.Value(BorderVisualProperty.Size) is object width) BorderlineWidth = Convert.ToSingle(width);
        }
        else if (map.Value(Visual.Property.MixColor) is Color color) BackgroundColor = color;
        else RuntimeEngine.Missing("Tizen.NUI.BaseComponents.View::Background visual type");
    }
    public string Name { get => Get("name",""); set => Set("name",value); }
    public bool Visibility => Get("visible",true);
    public float Opacity { get => Get("opacity",1f); set => Set("opacity",value); }
    public float BorderlineWidth { get => Get("borderlineWidth",0f); set { Set("borderlineWidth",value); UpdateBorder(); } }
    public bool Focusable { get => Get("focusable",false); set => Set("focusable",value); }
    View? leftFocusable;
    public View? LeftFocusableView { get => leftFocusable; set { RuntimeEngine.AssertUiThread(); leftFocusable = value; } }
    View? rightFocusable;
    public View? RightFocusableView { get => rightFocusable; set { RuntimeEngine.AssertUiThread(); rightFocusable = value; } }
    View? upFocusable;
    public View? UpFocusableView { get => upFocusable; set { RuntimeEngine.AssertUiThread(); upFocusable = value; } }
    View? downFocusable;
    public View? DownFocusableView { get => downFocusable; set { RuntimeEngine.AssertUiThread(); downFocusable = value; } }
    void UpdateBorder()
    {
        var width = BorderlineWidth;
        if(width <= 0)
        {
            if(borderId != 0) RuntimeEngine.Scene("set",borderId,new { visible = false });
            return;
        }
        if(borderId == 0)
        {
            borderId = RuntimeEngine.AllocateId();
            RuntimeEngine.Scene("create",borderId,"view");
            RuntimeEngine.Scene("insert",id,borderId,Children.Count);
        }
        var outside = width*(1+BorderlineOffset)/2;
        RuntimeEngine.Scene("set",borderId,new { x = -outside, y = -outside, w = SizeWidth+2*outside, h = SizeHeight+2*outside, borderWidth = width, borderColor = BorderlineColor.Values, radius = CornerRadius.Values, visible = true });
    }
    public void ClearBackground() { BackgroundColor = Color.Transparent; BorderlineWidth = 0; }
    public void Show() => Set("visible",true);
    public void Hide() => Set("visible",false);
    public event EventHandler? FocusGained;
    public event EventHandler? FocusLost;
    public event EventHandlerWithReturnType<object, KeyEventArgs, bool>? KeyEvent;
    public class KeyEventArgs : EventArgs { public Key Key { get; set; } = null!; }
    internal bool Dispatch(Key key)
    {
        if (KeyEvent == null) return false;
        foreach (EventHandlerWithReturnType<object, KeyEventArgs, bool> handler in KeyEvent.GetInvocationList())
            if (handler(this,new KeyEventArgs { Key = key })) return true;
        return false;
    }
    internal void Gain() => FocusGained?.Invoke(this,EventArgs.Empty);
    internal void Lose() => FocusLost?.Invoke(this,EventArgs.Empty);
    protected override void Dispose(DisposeTypes type)
    {
        if (Disposed) return;
        RuntimeEngine.AssertUiThread();
        if (FocusManager.Instance.GetCurrentFocusView() == this) FocusManager.Instance.ClearFocus();
        parent?.Remove(this);
        foreach (var child in Children) Remove(child);
        if(borderId != 0) RuntimeEngine.Scene("destroy",borderId);
        Nodes.Remove(id);
        RuntimeEngine.Scene("destroy",id);
        base.Dispose(type);
    }
}
