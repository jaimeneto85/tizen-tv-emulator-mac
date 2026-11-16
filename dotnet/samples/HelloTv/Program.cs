using Tizen.Applications;
using Tizen.NUI;
using Tizen.NUI.BaseComponents;
using Tizen.Multimedia;

namespace HelloTv;

public sealed class Program : NUIApplication
{
    private Tizen.NUI.Timer? timer;
    private Player? player;
    private readonly bool test = Environment.GetEnvironmentVariable("TVEMU_SAMPLE_TEST") == "1";
    private Program() : base(new Size2D(1920, 1080), new Position2D(0, 0)) { }
    private static void Main(string[] args) => new Program().Run(args);
    protected override void OnCreate()
    {
        base.OnCreate();
        var root = new View { Size2D = new Size2D(1920, 1080), Name = "root" };
        Window.Instance.Add(root);
        var first = new TextField { Name = "email", Text = "", PlaceholderText = "E-mail", Focusable = true, Position2D = new Position2D(50, 50), Size2D = new Size2D(400, 60) };
        var second = new TextField { Name = "password", PlaceholderText = "Password", Focusable = true, Position2D = new Position2D(50, 130), Size2D = new Size2D(400, 60) };
        second.HiddenInputSettings = new PropertyMap().Add(HiddenInputProperty.Mode, new PropertyValue(1));
        root.Add(first);
        root.Add(second);
        var buttons = Enumerable.Range(0, 4).Select(index => new TextLabel("Button " + (index + 1)) { Focusable = true, Position2D = new Position2D(500 + index % 2 * 200, 50 + index / 2 * 100), Size2D = new Size2D(180, 80) }).ToArray();
        foreach (var button in buttons) { button.PointSize = 12; root.Add(button); }
        first.DownFocusableView = second;
        first.RightFocusableView = buttons[0];
        second.UpFocusableView = first;
        second.RightFocusableView = buttons[2];
        buttons[0].RightFocusableView = buttons[1];
        buttons[0].DownFocusableView = buttons[2];
        buttons[1].LeftFocusableView = buttons[0];
        buttons[1].DownFocusableView = buttons[3];
        buttons[2].UpFocusableView = buttons[0];
        buttons[2].RightFocusableView = buttons[3];
        buttons[3].UpFocusableView = buttons[1];
        buttons[3].LeftFocusableView = buttons[2];
        var image = new ImageView { Name = "image", ResourceUrl = "https://example.invalid/hello.png", Position2D = new Position2D(50, 250), Size2D = new Size2D(320, 180) };
        image.ResourceReady += (_, _) => Console.WriteLine("IMAGE:" + image.LoadingStatus);
        root.Add(image);
        first.TextChanged += (_, _) =>
        {
            Console.WriteLine("TEXT:" + first.Text);
            if (test && first.Text is "focus-off" or "focus-on")
            {
                first.RightFocusableView = null;
                FocusManager.Instance.EnableDefaultAlgorithm(first.Text == "focus-on");
                FocusManager.Instance.SetCurrentFocusView(first);
                Console.WriteLine("FOCUS-MODE:" + first.Text);
            }
        };
        first.KeyEvent += (_, e) => { Console.WriteLine("VIEW:" + e.Key.KeyPressedName); return e.Key.KeyPressedName == "Left"; };
        root.KeyEvent += (_, e) => { Console.WriteLine("ROOT:" + e.Key.KeyPressedName); return false; };
        Window.Instance.KeyEvent += (_, e) =>
        {
            Console.WriteLine("WINDOW:" + e.Key.KeyPressedName);
            if (e.Key.KeyPressedName == "XF86Back" && e.Key.State == Key.StateType.Down) Exit();
        };
        FocusManager.Instance.SetFocusFinderRootView(root);
        FocusManager.Instance.SetCurrentFocusView(first);
        timer = new Tizen.NUI.Timer(40);
        var ticks = 0;
        timer.Tick += (_, _) => { Console.WriteLine("TICK:" + ++ticks); return ticks < 3; };
        timer.Start();
        if (test)
        {
            void ReentrantFocus(string scenario, Action<View, View, View> exercise)
            {
                var a = new View { Name = scenario + "-a", Focusable = true };
                var b = new View { Name = scenario + "-b", Focusable = true };
                var c = new View { Name = scenario + "-c", Focusable = true };
                root.Add(a); root.Add(b); root.Add(c);
                root.Name = scenario + "-begin";
                exercise(a, b, c);
                root.Name = scenario + "-end";
                FocusManager.Instance.SetCurrentFocusView(first);
            }
            ReentrantFocus("gain-refocus", (a, b, c) =>
            {
                b.FocusGained += (_, _) => FocusManager.Instance.SetCurrentFocusView(c);
                FocusManager.Instance.SetCurrentFocusView(b);
                if (FocusManager.Instance.GetCurrentFocusView() != c) throw new Exception("FocusGained refocus lost");
            });
            ReentrantFocus("lost-refocus", (a, b, c) =>
            {
                var gained = false;
                b.FocusGained += (_, _) => gained = true;
                FocusManager.Instance.SetCurrentFocusView(a);
                a.FocusLost += (_, _) => FocusManager.Instance.SetCurrentFocusView(c);
                FocusManager.Instance.SetCurrentFocusView(b);
                if (gained || FocusManager.Instance.GetCurrentFocusView() != c) throw new Exception("FocusLost override ignored");
            });
            ReentrantFocus("clear-refocus", (a, b, c) =>
            {
                FocusManager.Instance.SetCurrentFocusView(a);
                a.FocusLost += (_, _) => FocusManager.Instance.SetCurrentFocusView(c);
                FocusManager.Instance.ClearFocus();
                if (FocusManager.Instance.GetCurrentFocusView() != c) throw new Exception("ClearFocus refocus lost");
            });
            ReentrantFocus("gain-hide", (a, b, c) =>
            {
                b.FocusGained += (_, _) => b.Hide();
                FocusManager.Instance.SetCurrentFocusView(b);
                if (FocusManager.Instance.GetCurrentFocusView() == b) throw new Exception("Hidden focus retained");
            });
            ReentrantFocus("gain-dispose", (a, b, c) =>
            {
                b.FocusGained += (_, _) => b.Dispose();
                FocusManager.Instance.SetCurrentFocusView(b);
                if (FocusManager.Instance.GetCurrentFocusView() == b) throw new Exception("Disposed focus retained");
            });
            Console.WriteLine("FOCUS:REENTRANT-PASS");
            var localImage = new ImageView { Name = "sync-image" };
            var synchronousEvents = 0;
            localImage.ResourceReady += (_, _) => synchronousEvents++;
            localImage.Image = new PropertyMap().Add(Visual.Property.Type, new PropertyValue((int)Visual.Type.Image)).Add(ImageVisualProperty.SynchronousLoading, new PropertyValue(true)).Add(ImageVisualProperty.URL, new PropertyValue(Path.Combine(DirectoryInfo.Resource, "pixel.png")));
            if (localImage.LoadingStatus != ImageView.LoadingStatusType.Ready || synchronousEvents != 1 || localImage.SizeWidth != 1 || localImage.SizeHeight != 1) throw new Exception("Synchronous image readiness or natural size failed");
            root.Add(localImage);
            var asynchronousImage = new ImageView { Name = "async-image" };
            asynchronousImage.ResourceReady += (_, _) => Console.WriteLine($"ASYNC-IMAGE:{asynchronousImage.LoadingStatus}:{asynchronousImage.SizeWidth}:{asynchronousImage.SizeHeight}");
            asynchronousImage.Image = new PropertyMap().Add(Visual.Property.Type, new PropertyValue((int)Visual.Type.Image)).Add(ImageVisualProperty.URL, new PropertyValue("https://example.invalid/async.png"));
            if (asynchronousImage.LoadingStatus != ImageView.LoadingStatusType.Preparing) throw new Exception("Async image must start Preparing");
            root.Add(asynchronousImage);
            foreach (var path in new[] { Path.Combine(DirectoryInfo.Resource, "../../escape.png"), Path.Combine(DirectoryInfo.Resource, "escape-link.png") })
            {
                try { new ImageView { ResourceUrl = path }; throw new Exception("Escaping image path accepted"); }
                catch (ArgumentException) { }
            }
            Console.WriteLine("IMAGE:SYNC-MAP-SECURITY-PASS");
            var bordered = new View { Name = "bordered", Size2D = new Size2D(100, 80), BorderlineColor = Color.White, BorderlineWidth = 4, BorderlineOffset = 1 };
            root.Add(bordered);
            bordered.ClearBackground();
            if (bordered.BorderlineWidth != 0) throw new Exception("ClearBackground did not clear border");
            Console.WriteLine("BORDER:CLEAR-PASS");
            if (FocusManager.Instance.IsDefaultAlgorithmEnabled()) throw new Exception("Default focus algorithm must initially be disabled");
            var subtree = new View();
            var descendant = new View { Focusable = true };
            subtree.Add(descendant);
            root.Add(subtree);
            subtree.Hide();
            if (FocusManager.Instance.SetCurrentFocusView(descendant)) throw new Exception("Hidden ancestor focus accepted");
            subtree.Show();
            subtree.Opacity = 0;
            if (FocusManager.Instance.SetCurrentFocusView(descendant)) throw new Exception("Transparent ancestor focus accepted");
            subtree.Opacity = 1;
            if (!FocusManager.Instance.SetCurrentFocusView(descendant)) throw new Exception("Visible descendant focus rejected");
            root.Remove(subtree);
            if (FocusManager.Instance.GetCurrentFocusView() != null) throw new Exception("Detached subtree retained focus");
            subtree.DisposeRecursively();
            FocusManager.Instance.SetCurrentFocusView(first);
            Console.WriteLine("FOCUS:ANCESTORS-DISPOSE-PASS");
            var animated = new View { Name = "animated", Size = new Size(20, 30), Position = new Position(10, 20), Opacity = 1, Scale = new Vector3(1, 1, 1) };
            root.Add(animated);
            var animation = new Animation(120);
            animation.AnimateTo(animated, "Position", new Position(110, 220));
            animation.AnimateTo(animated, "Size", new Size(80, 90));
            animation.AnimateTo(animated, "opacity", 0.25f);
            animation.AnimateTo(animated, "Scale", new Vector3(2, 3, 1));
            var animationClock = System.Diagnostics.Stopwatch.StartNew();
            animation.Finished += (_, _) =>
            {
                if (animationClock.ElapsedMilliseconds < 100 || animated.Position.X != 110 || animated.Position.Y != 220 || animated.Size.Width != 80 || animated.Size.Height != 90 || animated.Opacity != 0.25f || animated.Scale.X != 2 || animated.Scale.Y != 3) throw new Exception("Animation final values or duration incorrect");
                Console.WriteLine("ANIMATION:PASS");
                animation.Dispose();
            };
            animation.Play();
            var uiContext = SynchronizationContext.Current ?? throw new Exception("UI context absent");
            var uiThread = Environment.CurrentManagedThreadId;
            _ = Task.Run(() =>
            {
                try { animated.Opacity = 0.7f; throw new Exception("Off-thread mutation accepted"); }
                catch (InvalidOperationException) { Console.WriteLine("THREAD:GUARD"); }
                uiContext.Send(_ => { if (Environment.CurrentManagedThreadId != uiThread) throw new Exception("Send ran on worker"); Console.WriteLine("THREAD:SEND"); }, null);
                try { uiContext.Send(_ => throw new ArgumentException("sent failure"), null); throw new Exception("Send swallowed exception"); }
                catch (ArgumentException) { Console.WriteLine("THREAD:SEND-EXCEPTION"); }
                uiContext.Post(_ => { if (Environment.CurrentManagedThreadId != uiThread) throw new Exception("Post ran on worker"); Console.WriteLine("THREAD:POST"); }, null);
            });
            Preference.Set("test-string", "round-trip");
            Preference.Set("test-int", 42);
            if (Preference.Get<string>("test-string") != "round-trip" || Preference.Get<int>("test-int") != 42) throw new Exception("Preference round trip failed");
            Console.WriteLine("PREFERENCE:PASS");
            player = new Player();
            try { player.Start(); throw new Exception("Player accepted start in Idle"); } catch (InvalidOperationException) { Console.WriteLine("PLAYER:IDLE-GUARD"); }
            player.SetSource(new MediaUriSource("https://example.invalid/video.mp4"));
            PreparePlayer();
        }
    }
    private async void PreparePlayer()
    {
        var preparation = player!.PrepareAsync();
        Console.WriteLine("PLAYER-TEST:PREPARING");
        await Task.Delay(80);
        if (player.State != PlayerState.Preparing) throw new Exception("Stale event escaped Preparing");
        Console.WriteLine("PLAYER-TEST:PREPARING-CHECKED");
        await preparation;
        if (player.GetPlayPosition() != 0) throw new Exception("Preparing stale events corrupted position");
        Console.WriteLine("PLAYER:PREPARED");
        player.Start();
        player.Pause();
        await player.SetPlayPositionAsync(1000, true);
        Console.WriteLine("PLAYER:SEEKED:" + player.GetPlayPosition());
        player.Stop();
        Console.WriteLine("PLAYER-TEST:STOPPED");
        await Task.Delay(80);
        if (player.State != PlayerState.Ready || player.GetPlayPosition() != 0) throw new Exception("Stopped player accepted stale event");
        player.Start();
        player.Pause();
        Console.WriteLine("PLAYER-TEST:PAUSED");
        await Task.Delay(80);
        if (player.State != PlayerState.Paused || player.GetPlayPosition() != 2222) throw new Exception("Paused player accepted playing event or rejected pause acknowledgement");
        player.Start();
        Console.WriteLine("PLAYER-TEST:RESTARTED");
        await Task.Delay(80);
        if (player.State != PlayerState.Playing || player.GetPlayPosition() != 2222) throw new Exception("Restart accepted late paused event");
        Console.WriteLine("PLAYER:STALE-EVENTS-PASS");
        player.Stop();
        player.Dispose();
    }
    protected override void OnPause() { base.OnPause(); Console.WriteLine("LIFECYCLE:PAUSE"); }
    protected override void OnResume() { base.OnResume(); Console.WriteLine("LIFECYCLE:RESUME"); }
    protected override void OnTerminate() { timer?.Stop(); base.OnTerminate(); Console.WriteLine("LIFECYCLE:TERMINATE"); }
}
