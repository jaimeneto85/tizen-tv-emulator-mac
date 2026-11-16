using Tizen.NUI.BaseComponents;
using Tvemu.Runtime;

namespace Tizen.NUI;

public class AlphaFunction : Disposable
{
    public enum BuiltinFunctions { Default, Linear, Reverse, EaseInSquare, EaseOutSquare, EaseIn, EaseOut, EaseInOut, EaseInSine, EaseOutSine, EaseInOutSine, Bounce, Sin, EaseOutBack, Count }
    readonly BuiltinFunctions function;
    public AlphaFunction() { }
    public AlphaFunction(BuiltinFunctions function) { this.function = function; }
    public BuiltinFunctions GetBuiltinFunction() => function;
    internal float Apply(float t) => function switch
    {
        BuiltinFunctions.Default or BuiltinFunctions.Linear => t,
        BuiltinFunctions.Reverse => 1-t,
        BuiltinFunctions.EaseInSquare => t*t,
        BuiltinFunctions.EaseOutSquare => 1-(1-t)*(1-t),
        BuiltinFunctions.EaseIn => t*t*t,
        BuiltinFunctions.EaseOut => 1-MathF.Pow(1-t,3),
        BuiltinFunctions.EaseInOut => t<0.5f ? 4*t*t*t : 1-MathF.Pow(-2*t+2,3)/2,
        BuiltinFunctions.EaseInSine => 1-MathF.Cos(t*MathF.PI/2),
        BuiltinFunctions.EaseOutSine => MathF.Sin(t*MathF.PI/2),
        BuiltinFunctions.EaseInOutSine => -(MathF.Cos(MathF.PI*t)-1)/2,
        BuiltinFunctions.Sin => MathF.Sin(t*MathF.PI*2),
        BuiltinFunctions.EaseOutBack => 1+2.70158f*MathF.Pow(t-1,3)+1.70158f*MathF.Pow(t-1,2),
        BuiltinFunctions.Bounce => Bounce(t),
        _ => throw new ArgumentOutOfRangeException()
    };
    static float Bounce(float t)
    {
        if(t<1/2.75f) return 7.5625f*t*t;
        if(t<2/2.75f) { t-=1.5f/2.75f; return 7.5625f*t*t+0.75f; }
        if(t<2.5f/2.75f) { t-=2.25f/2.75f; return 7.5625f*t*t+0.9375f; }
        t-=2.625f/2.75f; return 7.5625f*t*t+0.984375f;
    }
}
public class Animation : BaseHandle
{
    public enum States { Stopped, Playing, Paused }
    readonly List<Track> tracks = new();
    int duration;
    long started;
    long pausedElapsed;
    public Animation() : this(1000) { }
    public Animation(int durationMilliSeconds) { Duration = durationMilliSeconds; RuntimeEngine.Tick += Advance; }
    public int Duration { get => duration; set { RuntimeEngine.AssertUiThread(); if(value<0) throw new ArgumentOutOfRangeException(nameof(value)); duration = value; } }
    public States State { get; private set; }
    public event EventHandler? Finished;
    public void AnimateTo(View target,string property,object destinationValue,AlphaFunction? alphaFunction = null) => AnimateTo(target,property,destinationValue,0,Duration,alphaFunction);
    public void AnimateTo(View target,string property,object destinationValue,int startTime,int endTime,AlphaFunction? alphaFunction = null)
    {
        RuntimeEngine.AssertUiThread();
        if(startTime<0 || endTime<startTime) throw new ArgumentOutOfRangeException(nameof(startTime));
        if(string.IsNullOrEmpty(property)) throw new ArgumentNullException(nameof(property));
        var name = char.ToUpperInvariant(property[0])+property[1..];
        if(name is not ("Position" or "Position2D" or "PositionX" or "PositionY" or "Size" or "Size2D" or "SizeWidth" or "SizeHeight" or "Opacity" or "Scale")) RuntimeEngine.Missing($"Tizen.NUI.Animation::AnimateTo({property})");
        var destination = Coerce(typeof(View).GetProperty(name)!.PropertyType,destinationValue) ?? throw new ArgumentException("Invalid "+nameof(destinationValue));
        tracks.Add(new Track(target,name,destination,startTime,endTime,alphaFunction ?? new AlphaFunction()));
    }
    static object? Coerce(Type propertyType,object? value)
    {
        if(value == null) return null;
        if(propertyType.IsInstanceOfType(value)) return value;
        if(propertyType == typeof(float)) return value is int or long or double or short or byte ? Convert.ToSingle(value) : null;
        if(value is not Vector3 vector) return null;
        if(propertyType == typeof(Position)) return new Position(vector.X,vector.Y,vector.Z);
        if(propertyType == typeof(Size)) return new Size(vector.X,vector.Y,vector.Z);
        return null;
    }
    public void AnimateTo(Animatable target,string property,object destinationValue,AlphaFunction? alphaFunction = null)
    {
        if(target is View view) AnimateTo(view,property,destinationValue,alphaFunction);
        else RuntimeEngine.Missing("Tizen.NUI.Animation::AnimateTo(non-View)");
    }
    public void AnimateTo(Animatable target,string property,object destinationValue,int startTime,int endTime,AlphaFunction? alphaFunction = null)
    {
        if(target is View view) AnimateTo(view,property,destinationValue,startTime,endTime,alphaFunction);
        else RuntimeEngine.Missing("Tizen.NUI.Animation::AnimateTo(non-View)");
    }
    public void Play()
    {
        RuntimeEngine.AssertUiThread();
        if(State == States.Playing) return;
        if(State != States.Paused) { foreach(var track in tracks) track.Capture(); pausedElapsed = 0; }
        started = Environment.TickCount64-pausedElapsed;
        State = States.Playing;
    }
    public void Pause() { RuntimeEngine.AssertUiThread(); if(State != States.Playing) return; pausedElapsed = Environment.TickCount64-started; State = States.Paused; }
    public void Stop() { RuntimeEngine.AssertUiThread(); State = States.Stopped; pausedElapsed = 0; }
    public void Clear() { Stop(); tracks.Clear(); }
    void Advance(double time)
    {
        if(State != States.Playing) return;
        var elapsed = Environment.TickCount64-started;
        foreach(var track in tracks) if(elapsed>=track.Start && !track.Target.Disposed) track.Apply(track.End == track.Start ? 1 : Math.Clamp((float)(elapsed-track.Start)/(track.End-track.Start),0,1));
        if(elapsed>=Duration) { State = States.Stopped; Finished?.Invoke(this,EventArgs.Empty); }
    }
    protected override void Dispose(DisposeTypes type) { Stop(); RuntimeEngine.Tick -= Advance; tracks.Clear(); base.Dispose(type); }
    sealed class Track(View target,string property,object destination,int start,int end,AlphaFunction easing)
    {
        internal View Target => target;
        internal int Start => start;
        internal int End => end;
        object initial = null!;
        internal void Capture() => initial = typeof(View).GetProperty(property)!.GetValue(target)!;
        internal void Apply(float progress)
        {
            var t = easing.Apply(progress);
            float L(float a,float b) => a+(b-a)*t;
            object value = (initial,destination) switch
            {
                (float a,float b) => L(a,b),
                (Position a,Position b) => new Position(L(a.X,b.X),L(a.Y,b.Y),L(a.Z,b.Z)),
                (Position2D a,Position2D b) => new Position2D((int)L(a.X,b.X),(int)L(a.Y,b.Y)),
                (Size a,Size b) => new Size(L(a.Width,b.Width),L(a.Height,b.Height),L(a.Depth,b.Depth)),
                (Size2D a,Size2D b) => new Size2D((int)L(a.Width,b.Width),(int)L(a.Height,b.Height)),
                (Vector3 a,Vector3 b) => new Vector3(L(a.X,b.X),L(a.Y,b.Y),L(a.Z,b.Z)),
                _ => throw new ArgumentException($"Unsupported animation value for {property}")
            };
            typeof(View).GetProperty(property)!.SetValue(target,value);
        }
    }
}
