using System.Text.Json;
using Tizen.NUI.BaseComponents;
using Tvemu.Runtime;

namespace Tizen.NUI;

public class Layer : Container
{
    readonly int id;
    internal override int NodeId => id;
    internal Layer(bool windowRoot) { }
    public Layer() { id = RuntimeEngine.AllocateId(); RuntimeEngine.Scene("create",id,"view"); RuntimeEngine.Scene("insert",0,id,Window.Instance.GetDefaultLayer().Children.Count); }
    string name = "";
    float opacity = 1;
    bool visible = true;
    public string Name { get => name; set { RuntimeEngine.AssertUiThread(); name = value; RuntimeEngine.Scene("set",id,new { name }); } }
    public float Opacity { get => opacity; set { RuntimeEngine.AssertUiThread(); opacity = value; RuntimeEngine.Scene("set",id,new { opacity }); } }
    public bool Visibility { get => visible; set { RuntimeEngine.AssertUiThread(); visible = value; RuntimeEngine.Scene("set",id,new { visible }); } }
    protected override void Dispose(DisposeTypes type) { if(Disposed) return; foreach(var child in Children) Remove(child); if(id != 0) RuntimeEngine.Scene("destroy",id); base.Dispose(type); }
}
public class Window : BaseHandle
{
    static readonly Window instance = new();
    readonly Layer layer = new(true);
    Color color = Color.Black;
    Size2D size = new(1920,1080);
    Window() { size = new(RuntimeEngine.WindowWidth,RuntimeEngine.WindowHeight); RuntimeEngine.Message += Receive; }
    public static Window Instance => instance;
    public Size2D Size => new(size.Width,size.Height);
    public Size2D WindowSize { get => Size; set { RuntimeEngine.AssertUiThread(); size = value; } }
    public Color BackgroundColor { get => color; set { RuntimeEngine.AssertUiThread(); color = value; RuntimeEngine.Scene("window",new { bg = value.Values }); } }
    public Layer GetDefaultLayer() => layer;
    public void Add(View child) => layer.Add(child);
    public void Remove(View child) => layer.Remove(child);
    public event EventHandler<KeyEventArgs>? KeyEvent;
    public class KeyEventArgs : EventArgs { public Key Key { get; set; } = null!; }
    void Receive(JsonElement item)
    {
        switch(item.GetProperty("t").GetString())
        {
            case "welcome":
                if(item.TryGetProperty("window",out var window)) size = new(window.GetProperty("w").GetInt32(),window.GetProperty("h").GetInt32());
                break;
            case "key":
                var name = item.GetProperty("key").GetString() ?? "";
                var mapped = KeyNames.Map.TryGetValue(name,out var keysym) ? keysym : name;
                var key = new Key(mapped,item.GetProperty("code").GetInt32(),item.GetProperty("state").GetString() == "up" ? Key.StateType.Up : Key.StateType.Down);
                for(var view = FocusManager.Instance.GetCurrentFocusView(); view != null; view = view.Parent as View)
                    if(view.Dispatch(key)) return;
                KeyEvent?.Invoke(this,new KeyEventArgs { Key = key });
                if(key.State == Key.StateType.Down && mapped is "Left" or "Right" or "Up" or "Down") FocusManager.Instance.Move(mapped);
                break;
            case "text":
                if(View.Nodes.TryGetValue(item.GetProperty("id").GetInt32(),out var node) && node is TextField field) field.Input(item.GetProperty("value").GetString() ?? "");
                break;
            case "measure":
                if(View.Nodes.TryGetValue(item.GetProperty("id").GetInt32(),out var measured)) measured.Measure(item.GetProperty("w").GetSingle(),item.GetProperty("h").GetSingle());
                break;
            case "image":
                if(View.Nodes.TryGetValue(item.GetProperty("id").GetInt32(),out var image) && image is ImageView viewImage)
                {
                    var ready = item.GetProperty("status").GetString() == "ready";
                    if(ready && item.TryGetProperty("w",out var width) && item.TryGetProperty("h",out var height)) viewImage.Measure(width.GetSingle(),height.GetSingle());
                    viewImage.Loaded(ready);
                }
                break;
        }
    }
}
public class NUIApplication : Tizen.Applications.CoreApplication
{
    public NUIApplication() { _ = Window.Instance; }
    public NUIApplication(Size2D windowSize,Position2D windowPosition) : this() { Window.Instance.WindowSize = windowSize; }
    public Window Window => Window.Instance;
    public override void Run(string[] args) { base.Run(args); RuntimeEngine.Run(OnCreate,OnResume,OnPause,OnTerminate); }
    public override void Exit() => RuntimeEngine.RequestExit();
    protected override void OnCreate() { base.OnCreate(); }
    protected virtual void OnPause() { }
    protected virtual void OnResume() { }
    protected override void OnTerminate() { base.OnTerminate(); }
}
internal static class KeyNames
{
    internal static readonly Dictionary<string, string> Map = new()
    {
        ["ArrowLeft"] = "Left",
        ["ArrowUp"] = "Up",
        ["ArrowRight"] = "Right",
        ["ArrowDown"] = "Down",
        ["Enter"] = "Return",
        ["Back"] = "XF86Back",
        ["Exit"] = "XF86Exit",
        ["0"] = "0",
        ["1"] = "1",
        ["2"] = "2",
        ["3"] = "3",
        ["4"] = "4",
        ["5"] = "5",
        ["6"] = "6",
        ["7"] = "7",
        ["8"] = "8",
        ["9"] = "9",
        ["Minus"] = "minus",
        ["PreviousChannel"] = "XF86PreviousChannel",
        ["VolumeUp"] = "XF86AudioRaiseVolume",
        ["VolumeDown"] = "XF86AudioLowerVolume",
        ["VolumeMute"] = "XF86AudioMute",
        ["ChannelUp"] = "XF86RaiseChannel",
        ["ChannelDown"] = "XF86LowerChannel",
        ["ChannelList"] = "XF86ChannelList",
        ["ColorF0Red"] = "XF86Red",
        ["ColorF1Green"] = "XF86Green",
        ["ColorF2Yellow"] = "XF86Yellow",
        ["ColorF3Blue"] = "XF86Blue",
        ["MediaPlayPause"] = "XF86PlayBack",
        ["MediaPlay"] = "XF86AudioPlay",
        ["MediaPause"] = "XF86AudioPause",
        ["MediaStop"] = "XF86AudioStop",
        ["MediaRewind"] = "XF86AudioRewind",
        ["MediaFastForward"] = "XF86AudioNext",
        ["MediaRecord"] = "XF86AudioRecord",
        ["MediaTrackPrevious"] = "XF86PreviousChapter",
        ["MediaTrackNext"] = "XF86NextChapter",
        ["Info"] = "XF86Info",
        ["Menu"] = "XF86SysMenu",
        ["Tools"] = "XF86SimpleMenu",
        ["Guide"] = "XF86ChannelGuide",
        ["Source"] = "XF86Display",
        ["Caption"] = "XF86Caption",
        ["Search"] = "XF86Search",
        ["Extra"] = "XF86ExtraApp",
        ["E-Manual"] = "XF86EManual",
        ["PictureSize"] = "XF86PictureSize",
        ["Soccer"] = "XF86SoccerMode",
        ["Teletext"] = "XF86TTXMIX",
        ["MTS"] = "XF86MTS",
        ["3D"] = "XF863D"
    };
}
