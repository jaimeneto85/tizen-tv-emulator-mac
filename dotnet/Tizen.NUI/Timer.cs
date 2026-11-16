using Tvemu.Runtime;
namespace Tizen.NUI;

public class Timer : BaseHandle
{
    uint interval;
    bool active;
    long next;
    public class TickEventArgs : EventArgs { }
    public event EventHandlerWithReturnType<object,TickEventArgs,bool>? Tick;
    public Timer(uint milliSec) { Interval = milliSec; RuntimeEngine.Tick += Advance; }
    public uint Interval { get => interval; set { RuntimeEngine.AssertUiThread(); if(value == 0) throw new ArgumentOutOfRangeException(nameof(value)); interval = value; next = Environment.TickCount64 + interval; } }
    public void Start() { RuntimeEngine.AssertUiThread(); active = true; next = Environment.TickCount64 + interval; }
    public void Stop() { RuntimeEngine.AssertUiThread(); active = false; }
    public bool IsRunning() => active;
    void Advance(double time)
    {
        if (!active || Environment.TickCount64 < next) return;
        next = Environment.TickCount64 + interval;
        if(Tick == null) { Stop(); return; }
        foreach(EventHandlerWithReturnType<object,TickEventArgs,bool> handler in Tick.GetInvocationList()) if(!handler(this,new TickEventArgs())) { Stop(); break; }
    }
    protected override void Dispose(DisposeTypes type) { Stop(); RuntimeEngine.Tick -= Advance; base.Dispose(type); }
}
