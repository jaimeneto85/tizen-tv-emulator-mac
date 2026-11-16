# Tizen API members referenced by a real dotnet-nui TV app

Extracted from the metadata of two builds of the same app (Tizen.NET 11 / net6.0 and Tizen.NET 5 / tizen50).
Format: `M <assembly> <type>::<member>(<params>) : <return>`, `T <assembly> <type>`, `BASE <app type> : <base>`.

```
ASMREF Tizen.Applications.Common 4.0.0.0
ASMREF Tizen.Applications.Preference 4.0.0.0
ASMREF Tizen.Log 4.0.0.0
ASMREF Tizen.Multimedia 4.0.0.0
ASMREF Tizen.Multimedia.MediaPlayer 4.0.0.0
ASMREF Tizen.NUI 4.0.0.0
ASMREF Tizen.System.MediaKey 4.0.0.0
BASE CoverImage : Tizen.NUI.BaseComponents.View
BASE FocusButton : Tizen.NUI.BaseComponents.View
BASE FocusCard : Tizen.NUI.BaseComponents.View
BASE Program : Tizen.NUI.NUIApplication
M ? Tizen.NUI.EventHandlerWithReturnType`3<Object,Tizen.NUI.BaseComponents.View/KeyEventArgs,Boolean>::.ctor(Object,IntPtr) : Void
M ? Tizen.NUI.EventHandlerWithReturnType`3<Object,Tizen.NUI.Timer/TickEventArgs,Boolean>::.ctor(Object,IntPtr) : Void
M Tizen.Applications.Common Tizen.Applications.Application::Exit() : Void
M Tizen.Applications.Common Tizen.Applications.Application::Run(String[]) : Void
M Tizen.Applications.Common Tizen.Applications.Application::get_DirectoryInfo() : Tizen.Applications.DirectoryInfo
M Tizen.Applications.Common Tizen.Applications.Application::static get_Current() : Tizen.Applications.Application
M Tizen.Applications.Common Tizen.Applications.DirectoryInfo::get_Resource() : String
M Tizen.Applications.Preference Tizen.Applications.Preference::static Contains(String) : Boolean
M Tizen.Applications.Preference Tizen.Applications.Preference::static Get(String) : !!0
M Tizen.Applications.Preference Tizen.Applications.Preference::static Remove(String) : Void
M Tizen.Applications.Preference Tizen.Applications.Preference::static Set(String,Object) : Void
M Tizen.Log Tizen.Log::static Warn(String,String,String,String,Int32) : Void
M Tizen.Multimedia Tizen.Multimedia.Display::.ctor(Tizen.NUI.Window) : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaUriSource::.ctor(String) : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::.ctor() : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::Dispose() : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::GetPlayPosition() : Int32
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::Pause() : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::PrepareAsync() : System.Threading.Tasks.Task
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::PrepareAsync(System.Threading.CancellationToken) : System.Threading.Tasks.Task
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::SetPlayPositionAsync(Int32,Boolean) : System.Threading.Tasks.Task
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::SetSource(Tizen.Multimedia.MediaSource) : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::Start() : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::Stop() : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::add_ErrorOccurred(System.EventHandler`1<Tizen.Multimedia.PlayerErrorOccurredEventArgs>) : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::add_PlaybackCompleted(System.EventHandler`1<System.EventArgs>) : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::get_State() : Tizen.Multimedia.PlayerState
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::get_StreamInfo() : Tizen.Multimedia.StreamInfo
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::set_Display(Tizen.Multimedia.Display) : Void
M Tizen.Multimedia.MediaPlayer Tizen.Multimedia.StreamInfo::GetDuration() : Int32
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::.ctor() : Void
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::add_ResourceReady(System.EventHandler`1<Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs>) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::get_LoadingStatus() : Tizen.NUI.BaseComponents.ImageView/LoadingStatusType
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::remove_ResourceReady(System.EventHandler`1<Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs>) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::set_Image(Tizen.NUI.PropertyMap) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::set_ResourceUrl(String) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.ImageView::set_SynchronousLoading(Boolean) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::.ctor() : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::GetInputMethodContext() : Tizen.NUI.InputMethodContext
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::add_TextChanged(System.EventHandler`1<Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs>) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::get_Text() : String
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_HiddenInputSettings(Tizen.NUI.PropertyMap) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_InputMethodSettings(Tizen.NUI.PropertyMap) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_PlaceholderText(String) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_PlaceholderTextColor(Tizen.NUI.Vector4) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_PointSize(Single) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_Text(String) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextField::set_TextColor(Tizen.NUI.Color) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::.ctor(String) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::set_MultiLine(Boolean) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::set_PointSize(Single) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::set_TextColor(Tizen.NUI.Color) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::set_VerticalAlignment(Tizen.NUI.VerticalAlignment) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View/KeyEventArgs::get_Key() : Tizen.NUI.Key
M Tizen.NUI Tizen.NUI.BaseComponents.View::.ctor() : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::ClearBackground() : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::Dispose(Tizen.NUI.DisposeTypes) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::add_FocusGained(System.EventHandler) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::add_FocusLost(System.EventHandler) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::add_KeyEvent(Tizen.NUI.EventHandlerWithReturnType`3<Object,Tizen.NUI.BaseComponents.View/KeyEventArgs,Boolean>) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_ChildCount() : UInt32
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_DownFocusableView() : Tizen.NUI.BaseComponents.View
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_Focusable() : Boolean
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_LeftFocusableView() : Tizen.NUI.BaseComponents.View
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_Position2D() : Tizen.NUI.Position2D
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_RightFocusableView() : Tizen.NUI.BaseComponents.View
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_Size2D() : Tizen.NUI.Size2D
M Tizen.NUI Tizen.NUI.BaseComponents.View::get_UpFocusableView() : Tizen.NUI.BaseComponents.View
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_Background(Tizen.NUI.PropertyMap) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_BackgroundColor(Tizen.NUI.Color) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_BorderlineColor(Tizen.NUI.Color) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_BorderlineWidth(Single) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_CornerRadius(Tizen.NUI.Vector4) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_DownFocusableView(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_Focusable(Boolean) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_LeftFocusableView(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_Opacity(Single) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_Position2D(Tizen.NUI.Position2D) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_RightFocusableView(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_Scale(Tizen.NUI.Vector3) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_Size2D(Tizen.NUI.Size2D) : Void
M Tizen.NUI Tizen.NUI.BaseComponents.View::set_UpFocusableView(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.BaseHandle::Dispose() : Void
M Tizen.NUI Tizen.NUI.BaseHandle::static op_Equality(Tizen.NUI.BaseHandle,Tizen.NUI.BaseHandle) : Boolean
M Tizen.NUI Tizen.NUI.BaseHandle::static op_Inequality(Tizen.NUI.BaseHandle,Tizen.NUI.BaseHandle) : Boolean
M Tizen.NUI Tizen.NUI.BorderVisualProperty::Color : Int32
M Tizen.NUI Tizen.NUI.BorderVisualProperty::Size : Int32
M Tizen.NUI Tizen.NUI.Color::.ctor(Single,Single,Single,Single) : Void
M Tizen.NUI Tizen.NUI.Color::Black : Tizen.NUI.Color
M Tizen.NUI Tizen.NUI.Color::Transparent : Tizen.NUI.Color
M Tizen.NUI Tizen.NUI.Color::White : Tizen.NUI.Color
M Tizen.NUI Tizen.NUI.Color::static op_Implicit(Tizen.NUI.Color) : Tizen.NUI.Vector4
M Tizen.NUI Tizen.NUI.Container::Add(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.Container::DisposeRecursively() : Void
M Tizen.NUI Tizen.NUI.Container::GetChildAt(UInt32) : Tizen.NUI.BaseComponents.View
M Tizen.NUI Tizen.NUI.Container::Remove(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.FocusManager::SetAsFocusGroup(Tizen.NUI.BaseComponents.View,Boolean) : Void
M Tizen.NUI Tizen.NUI.FocusManager::SetCurrentFocusView(Tizen.NUI.BaseComponents.View) : Boolean
M Tizen.NUI Tizen.NUI.FocusManager::SetFocusFinderRootView(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.FocusManager::static get_Instance() : Tizen.NUI.FocusManager
M Tizen.NUI Tizen.NUI.HiddenInputProperty::Mode : Int32
M Tizen.NUI Tizen.NUI.ImageVisualProperty::SynchronousLoading : Int32
M Tizen.NUI Tizen.NUI.ImageVisualProperty::URL : Int32
M Tizen.NUI Tizen.NUI.InputMethod::.ctor() : Void
M Tizen.NUI Tizen.NUI.InputMethod::get_OutputMap() : Tizen.NUI.PropertyMap
M Tizen.NUI Tizen.NUI.InputMethod::set_PanelLayout(Tizen.NUI.InputMethod/PanelLayoutType) : Void
M Tizen.NUI Tizen.NUI.InputMethodContext::Activate() : Void
M Tizen.NUI Tizen.NUI.InputMethodContext::Deactivate() : Void
M Tizen.NUI Tizen.NUI.Key::get_KeyPressedName() : String
M Tizen.NUI Tizen.NUI.Key::get_State() : Tizen.NUI.Key/StateType
M Tizen.NUI Tizen.NUI.NUIApplication::.ctor(Tizen.NUI.Size2D,Tizen.NUI.Position2D) : Void
M Tizen.NUI Tizen.NUI.NUIApplication::OnCreate() : Void
M Tizen.NUI Tizen.NUI.NUIApplication::OnPause() : Void
M Tizen.NUI Tizen.NUI.NUIApplication::OnResume() : Void
M Tizen.NUI Tizen.NUI.NUIApplication::OnTerminate() : Void
M Tizen.NUI Tizen.NUI.Position2D::.ctor(Int32,Int32) : Void
M Tizen.NUI Tizen.NUI.Position2D::get_X() : Int32
M Tizen.NUI Tizen.NUI.Position2D::get_Y() : Int32
M Tizen.NUI Tizen.NUI.PropertyMap::.ctor() : Void
M Tizen.NUI Tizen.NUI.PropertyMap::Add(Int32,Tizen.NUI.PropertyValue) : Tizen.NUI.PropertyMap
M Tizen.NUI Tizen.NUI.PropertyValue::.ctor(Boolean) : Void
M Tizen.NUI Tizen.NUI.PropertyValue::.ctor(Int32) : Void
M Tizen.NUI Tizen.NUI.PropertyValue::.ctor(Single) : Void
M Tizen.NUI Tizen.NUI.PropertyValue::.ctor(String) : Void
M Tizen.NUI Tizen.NUI.PropertyValue::.ctor(Tizen.NUI.Color) : Void
M Tizen.NUI Tizen.NUI.Size2D::.ctor(Int32,Int32) : Void
M Tizen.NUI Tizen.NUI.Timer::.ctor(UInt32) : Void
M Tizen.NUI Tizen.NUI.Timer::Start() : Void
M Tizen.NUI Tizen.NUI.Timer::Stop() : Void
M Tizen.NUI Tizen.NUI.Timer::add_Tick(Tizen.NUI.EventHandlerWithReturnType`3<Object,Tizen.NUI.Timer/TickEventArgs,Boolean>) : Void
M Tizen.NUI Tizen.NUI.Vector3::.ctor(Single,Single,Single) : Void
M Tizen.NUI Tizen.NUI.Vector4::static op_Implicit(Single) : Tizen.NUI.Vector4
M Tizen.NUI Tizen.NUI.Visual/Property::Type : Int32
M Tizen.NUI Tizen.NUI.Window/KeyEventArgs::get_Key() : Tizen.NUI.Key
M Tizen.NUI Tizen.NUI.Window::Add(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.Window::Remove(Tizen.NUI.BaseComponents.View) : Void
M Tizen.NUI Tizen.NUI.Window::add_KeyEvent(System.EventHandler`1<Tizen.NUI.Window/KeyEventArgs>) : Void
M Tizen.NUI Tizen.NUI.Window::remove_KeyEvent(System.EventHandler`1<Tizen.NUI.Window/KeyEventArgs>) : Void
M Tizen.NUI Tizen.NUI.Window::set_BackgroundColor(Tizen.NUI.Color) : Void
M Tizen.NUI Tizen.NUI.Window::static get_Instance() : Tizen.NUI.Window
M Tizen.System.MediaKey Tizen.System.MediaKey::static add_Event(System.EventHandler`1<Tizen.System.MediaKeyEventArgs>) : Void
M Tizen.System.MediaKey Tizen.System.MediaKey::static remove_Event(System.EventHandler`1<Tizen.System.MediaKeyEventArgs>) : Void
M Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs::get_Status() : Tizen.System.MediaKeyEventArgs/KeyStatus
M Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs::get_Value() : Tizen.System.MediaKeyEventArgs/KeyValue
T Tizen.Applications.Common Tizen.Applications.Application
T Tizen.Applications.Common Tizen.Applications.DirectoryInfo
T Tizen.Applications.Preference Tizen.Applications.Preference
T Tizen.Log Tizen.Log
T Tizen.Multimedia Tizen.Multimedia.Display
T Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaSource
T Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaUriSource
T Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player
T Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerErrorOccurredEventArgs
T Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState
T Tizen.Multimedia.MediaPlayer Tizen.Multimedia.StreamInfo
T Tizen.NUI Tizen.NUI.BaseComponents.ImageView
T Tizen.NUI Tizen.NUI.BaseComponents.ImageView/LoadingStatusType
T Tizen.NUI Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs
T Tizen.NUI Tizen.NUI.BaseComponents.TextField
T Tizen.NUI Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs
T Tizen.NUI Tizen.NUI.BaseComponents.TextLabel
T Tizen.NUI Tizen.NUI.BaseComponents.View
T Tizen.NUI Tizen.NUI.BaseComponents.View/KeyEventArgs
T Tizen.NUI Tizen.NUI.BaseHandle
T Tizen.NUI Tizen.NUI.BorderVisualProperty
T Tizen.NUI Tizen.NUI.Color
T Tizen.NUI Tizen.NUI.Container
T Tizen.NUI Tizen.NUI.DisposeTypes
T Tizen.NUI Tizen.NUI.EventHandlerWithReturnType`3
T Tizen.NUI Tizen.NUI.FocusManager
T Tizen.NUI Tizen.NUI.HiddenInputProperty
T Tizen.NUI Tizen.NUI.ImageVisualProperty
T Tizen.NUI Tizen.NUI.InputMethod
T Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType
T Tizen.NUI Tizen.NUI.InputMethodContext
T Tizen.NUI Tizen.NUI.Key
T Tizen.NUI Tizen.NUI.Key/StateType
T Tizen.NUI Tizen.NUI.NUIApplication
T Tizen.NUI Tizen.NUI.Position2D
T Tizen.NUI Tizen.NUI.PropertyMap
T Tizen.NUI Tizen.NUI.PropertyValue
T Tizen.NUI Tizen.NUI.Size2D
T Tizen.NUI Tizen.NUI.Timer
T Tizen.NUI Tizen.NUI.Timer/TickEventArgs
T Tizen.NUI Tizen.NUI.Vector3
T Tizen.NUI Tizen.NUI.Vector4
T Tizen.NUI Tizen.NUI.VerticalAlignment
T Tizen.NUI Tizen.NUI.Visual
T Tizen.NUI Tizen.NUI.Visual/Property
T Tizen.NUI Tizen.NUI.Window
T Tizen.NUI Tizen.NUI.Window/KeyEventArgs
T Tizen.System.MediaKey Tizen.System.MediaKey
T Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs
T Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyStatus
T Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue
```
