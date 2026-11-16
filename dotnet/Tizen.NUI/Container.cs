using Tizen.NUI.BaseComponents;
using Tvemu.Runtime;

namespace Tizen.NUI;

public abstract class Container : Animatable
{
    readonly List<View> children = new();
    internal Container? parent;
    internal virtual int NodeId => 0;
    internal Container() { }
    public List<View> Children => new(children);
    public Container? Parent => parent;
    public uint ChildCount => (uint)children.Count;
    public void Add(View child)
    {
        RuntimeEngine.AssertUiThread();
        ObjectDisposedException.ThrowIf(Disposed || child.Disposed, this);
        for (Container? ancestor = this; ancestor != null; ancestor = ancestor.Parent)
            if (ReferenceEquals(ancestor, child)) throw new InvalidOperationException("A scene cannot contain cycles");
        child.parent?.Remove(child);
        children.Add(child);
        child.parent = this;
        RuntimeEngine.Scene("insert", NodeId, child.NodeId, children.Count - 1);
        child.Geometry();
    }
    public void Remove(View child)
    {
        RuntimeEngine.AssertUiThread();
        if (!children.Contains(child)) return;
        for (Container? focused = FocusManager.Instance.GetCurrentFocusView(); focused != null; focused = focused.Parent)
            if (ReferenceEquals(focused, child)) { FocusManager.Instance.ClearFocus(); break; }
        children.Remove(child);
        child.parent = null;
        RuntimeEngine.Scene("detach", child.NodeId);
    }
    public View GetChildAt(uint index) => children[(int)index];
    public Container? GetParent() => Parent;
    public uint GetChildCount() => ChildCount;
    public void DisposeRecursively()
    {
        for (Container? focused = FocusManager.Instance.GetCurrentFocusView(); focused != null; focused = focused.Parent)
            if (ReferenceEquals(focused, this)) { FocusManager.Instance.ClearFocus(); break; }
        foreach (var child in children.ToArray()) child.DisposeRecursively();
        Dispose();
    }
}
