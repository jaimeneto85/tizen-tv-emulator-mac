using System.Text.Json;
using Tizen.NUI.BaseComponents;
using Tvemu.Runtime;

namespace Tizen.NUI;

public class Key : BaseHandle
{
    public enum StateType { Down, Up, Last }
    internal Key(string name, int code, StateType state) { KeyPressedName = name; KeyCode = code; State = state; }
    public string KeyPressedName { get; }
    public int KeyCode { get; }
    public StateType State { get; }
}
public class InputMethod
{
    public enum PanelLayoutType { Normal, Number, Email, URL, PhoneNumber, IP, Month, NumberOnly, HEX, Terminal, Password, Datetime, Emoticon }
    public PanelLayoutType PanelLayout { get; set; }
    public PropertyMap OutputMap => new PropertyMap().Add(0,new PropertyValue((int)PanelLayout));
}
public class InputMethodContext : BaseHandle
{
    readonly TextField? field;
    public InputMethodContext() { }
    internal InputMethodContext(TextField field) { this.field = field; }
    public void Activate()
    {
        RuntimeEngine.AssertUiThread();
        if (field == null) return;
        var panel = (InputMethod.PanelLayoutType)Convert.ToInt32(field.InputMethodSettings.Value(0) ?? 0);
        RuntimeEngine.Scene("ime",field.NodeId,new { panel = panel switch { InputMethod.PanelLayoutType.Email => "email", InputMethod.PanelLayoutType.Password => "password", InputMethod.PanelLayoutType.Number or InputMethod.PanelLayoutType.NumberOnly => "number", InputMethod.PanelLayoutType.URL => "url", _ => "normal" }, hidden = field.Get("hidden",false) });
    }
    public void Deactivate() => RuntimeEngine.Scene("ime",0,new { panel = "normal", hidden = false });
}
public class FocusManager : BaseHandle
{
    static readonly FocusManager instance = new();
    readonly HashSet<View> groups = new();
    View? current;
    long focusRevision;
    View? root;
    bool indicator = true;
    bool algorithm;
    FocusManager() { }
    public static FocusManager Instance => instance;
    public bool SetCurrentFocusView(View view)
    {
        RuntimeEngine.AssertUiThread();
        if (view == null || view.Disposed || !view.Focusable || !Eligible(view)) return false;
        if (current == view) return true;
        var revision = ++focusRevision;
        var previous = current;
        current = view;
        previous?.Lose();
        if (revision != focusRevision || current != view) return current == view;
        if (!view.Focusable || !Eligible(view)) { ClearFocus(); return false; }
        view.Gain();
        if (revision != focusRevision || current != view) return current == view;
        if (!view.Focusable || !Eligible(view)) { ClearFocus(); return false; }
        RuntimeEngine.Scene("focus",indicator ? view.NodeId : 0);
        return true;
    }
    public View? GetCurrentFocusView() => current;
    public void ClearFocus()
    {
        RuntimeEngine.AssertUiThread();
        var revision = ++focusRevision;
        var old = current;
        current = null;
        old?.Lose();
        if (revision == focusRevision && current == null) RuntimeEngine.Scene("focus",0);
    }
    public void SetFocusFinderRootView(View view) { RuntimeEngine.AssertUiThread(); root = view; }
    public void ResetFocusFinderRootView() { RuntimeEngine.AssertUiThread(); root = null; }
    public void SetAsFocusGroup(View view,bool isFocusGroup) { RuntimeEngine.AssertUiThread(); if(isFocusGroup) groups.Add(view); else groups.Remove(view); }
    public bool IsFocusGroup(View view) => groups.Contains(view);
    public View? GetFocusGroup(View view)
    {
        for(View? ancestor = view; ancestor != null; ancestor = ancestor.Parent as View) if(groups.Contains(ancestor)) return ancestor;
        return null;
    }
    public void EnableDefaultAlgorithm(bool enable) { RuntimeEngine.AssertUiThread(); algorithm = enable; }
    public bool IsDefaultAlgorithmEnabled() => algorithm;
    public void EnableFocusIndicator(bool enable) { RuntimeEngine.AssertUiThread(); indicator = enable; RuntimeEngine.Scene("focus",enable ? current?.NodeId ?? 0 : 0); }
    public bool IsFocusIndicatorEnabled() => indicator;
    internal void Move(string direction)
    {
        var explicitNext = direction switch { "Left" => current?.LeftFocusableView, "Right" => current?.RightFocusableView, "Up" => current?.UpFocusableView, "Down" => current?.DownFocusableView, _ => null };
        if (explicitNext != null && SetCurrentFocusView(explicitNext)) return;
        if (!algorithm) return;
        var candidates = Descendants(root ?? (Container)Window.Instance.GetDefaultLayer()).Where(v => v.Focusable && Eligible(v) && v != current).ToList();
        var source = current == null ? new Bounds(0,0,0,0) : ScreenBounds(current);
        View? next = null;
        AxisBox best = default;
        var origin = Orient(source,direction);
        foreach(var candidate in candidates)
        {
            var box = Orient(ScreenBounds(candidate),direction);
            if (box.Far <= origin.Far || (box.Near <= origin.Near && box.Near < origin.Far)) continue;
            if (next == null || Better(origin,box,best,direction is "Left" or "Right")) { next = candidate; best = box; }
        }
        if(next != null) SetCurrentFocusView(next);
    }
    static IEnumerable<View> Descendants(Container container)
    {
        foreach(var child in container.Children.AsEnumerable().Reverse())
        {
            if(!Eligible(child)) continue;
            yield return child;
            foreach(var descendant in Descendants(child)) yield return descendant;
        }
    }
    static bool Eligible(View view)
    {
        var opacity = 1f;
        Container? item = view;
        for(; item is View ancestor; item = item.Parent)
        {
            if(ancestor.Disposed || !ancestor.Visibility) return false;
            opacity *= ancestor.Opacity;
        }
        return opacity > 0.01f && item is Layer;
    }
    static bool Better(AxisBox source,AxisBox candidate,AxisBox best,bool horizontal)
    {
        bool Beam(AxisBox b) => b.CrossEnd >= source.CrossStart && b.CrossStart <= source.CrossEnd;
        float Gap(AxisBox b) => Math.Max(0,b.Near-source.Far);
        bool Prefers(AxisBox a,AxisBox b) => Beam(a) && !Beam(b) && (b.Near < source.Far || horizontal || Gap(a) < Math.Max(1,b.Far-source.Far));
        if(Prefers(candidate,best)) return true;
        if(Prefers(best,candidate)) return false;
        double Score(AxisBox b) { var cross = (int)Math.Abs((b.CrossStart+b.CrossEnd-source.CrossStart-source.CrossEnd)/2); var main = (int)Gap(b); return 13d*main*main+cross*cross; }
        return Score(candidate)<Score(best);
    }
    static AxisBox Orient(Bounds b,string direction) => direction switch
    {
        "Left" => new(-b.Right,-b.Left,b.Top,b.Bottom),
        "Right" => new(b.Left,b.Right,b.Top,b.Bottom),
        "Up" => new(-b.Bottom,-b.Top,b.Left,b.Right),
        _ => new(b.Top,b.Bottom,b.Left,b.Right)
    };
    static Bounds ScreenBounds(View view)
    {
        var left = view.Get("x",0f);
        var top = view.Get("y",0f);
        for(var ancestor = view.Parent as View; ancestor != null; ancestor = ancestor.Parent as View) { left += ancestor.Get("x",0f); top += ancestor.Get("y",0f); }
        return new(left,top,left+view.SizeWidth,top+view.SizeHeight);
    }
    readonly record struct Bounds(float Left,float Top,float Right,float Bottom);
    readonly record struct AxisBox(float Near,float Far,float CrossStart,float CrossEnd);
    static bool IsInside(View view,View? target)
    {
        if (target == null) return view.Parent != null;
        for (Container? item = view; item != null; item = item.Parent) if (item == target) return true;
        return false;
    }
    static (float,float) Center(View view)
    {
        var x = view.PositionX + view.SizeWidth/2;
        var y = view.PositionY + view.SizeHeight/2;
        for (var parent = view.Parent as View; parent != null; parent = parent.Parent as View) { x += parent.PositionX; y += parent.PositionY; }
        return (x,y);
    }
}
