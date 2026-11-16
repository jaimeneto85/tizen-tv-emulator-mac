# NUI runtime public surface coverage

Generated from the built shim metadata. `implemented` means a managed implementation exists; restrictions below still apply. Exact signature conformance is tested independently against the union of installed API5/API11 reference assemblies.

| Assembly / type / member | Status |
|---|---|
| `Tizen.Applications.Common Tizen.Applications.Application` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::static get_Current``0():Tizen.Applications.Application` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::instance get_DirectoryInfo``0():Tizen.Applications.DirectoryInfo` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::instance Run``0(System.String[]):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::instance Exit``0():System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::instance Dispose``0(System.Boolean):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::instance Dispose``0():System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.Application::instance .ctor``0():System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_Resource``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_SharedResource``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_Data``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_Cache``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_SharedData``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_SharedTrusted``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_ExternalData``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_ExternalCache``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_ExternalSharedData``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.DirectoryInfo::instance get_ExpansionPackageResource``0():System.String` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance add_Created``0(System.EventHandler):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance remove_Created``0(System.EventHandler):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance add_Terminated``0(System.EventHandler):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance remove_Terminated``0(System.EventHandler):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance OnCreate``0():System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance OnTerminate``0():System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::instance Exit``0():System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::static Post``0(System.Action):System.Void` | implemented |
| `Tizen.Applications.Common Tizen.Applications.CoreApplication::static Post``1(System.Func`1<!!0>):System.Threading.Tasks.Task`1<!!0>` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.PreferenceChangedEventArgs` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.PreferenceChangedEventArgs::instance get_Key``0():System.String` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.PreferenceChangedEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static get_Keys``0():System.Collections.Generic.IEnumerable`1<System.String>` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static Contains``0(System.String):System.Boolean` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static Set``0(System.String,System.Object):System.Void` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static Get``1(System.String):!!0` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static Remove``0(System.String):System.Void` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static RemoveAll``0():System.Void` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference::static GetEventContext``0(System.String):System.WeakReference`1<Tizen.Applications.Preference/EventContext>` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference/EventContext` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference/EventContext::instance add_Changed``0(System.EventHandler`1<Tizen.Applications.PreferenceChangedEventArgs>):System.Void` | implemented |
| `Tizen.Applications.Preference Tizen.Applications.Preference/EventContext::instance remove_Changed``0(System.EventHandler`1<Tizen.Applications.PreferenceChangedEventArgs>):System.Void` | implemented |
| `Tizen.Log Tizen.Log` | implemented |
| `Tizen.Log Tizen.Log::static Verbose``0(System.String,System.String,System.String,System.String,System.Int32):System.Void` | implemented |
| `Tizen.Log Tizen.Log::static Debug``0(System.String,System.String,System.String,System.String,System.Int32):System.Void` | implemented |
| `Tizen.Log Tizen.Log::static Info``0(System.String,System.String,System.String,System.String,System.Int32):System.Void` | implemented |
| `Tizen.Log Tizen.Log::static Warn``0(System.String,System.String,System.String,System.String,System.Int32):System.Void` | implemented |
| `Tizen.Log Tizen.Log::static Error``0(System.String,System.String,System.String,System.String,System.Int32):System.Void` | implemented |
| `Tizen.Log Tizen.Log::static Fatal``0(System.String,System.String,System.String,System.String,System.Int32):System.Void` | implemented |
| `Tizen.Log Tizen.Log::instance .ctor``0():System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState::value__:System.Int32` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState::Idle:Tizen.Multimedia.PlayerState = 01000000` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState::Ready:Tizen.Multimedia.PlayerState = 02000000` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState::Playing:Tizen.Multimedia.PlayerState = 03000000` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState::Paused:Tizen.Multimedia.PlayerState = 04000000` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerState::Preparing:Tizen.Multimedia.PlayerState = 05000000` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::value__:System.Int32` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::NoSuchFile:Tizen.Multimedia.PlayerError = FEFFFFFF` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::InternalError:Tizen.Multimedia.PlayerError = DAFFFFFF` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::NoSpaceOnDevice:Tizen.Multimedia.PlayerError = E4FFFFFF` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::BufferSpace:Tizen.Multimedia.PlayerError = 97FFFFFF` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::SeekFailed:Tizen.Multimedia.PlayerError = 21006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::InvalidState:Tizen.Multimedia.PlayerError = 22006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::NotSupportedFile:Tizen.Multimedia.PlayerError = 23006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::InvalidUri:Tizen.Multimedia.PlayerError = 24006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::ConnectionFailed:Tizen.Multimedia.PlayerError = 26006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::DrmNotPermitted:Tizen.Multimedia.PlayerError = 2B006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::ServiceDisconnected:Tizen.Multimedia.PlayerError = 2D006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::AudioCodecNotSupported:Tizen.Multimedia.PlayerError = 2E006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::VideoCodecNotSupported:Tizen.Multimedia.PlayerError = 2F006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerError::SubtitleNotSupported:Tizen.Multimedia.PlayerError = 30006CFE` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerErrorOccurredEventArgs` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerErrorOccurredEventArgs::instance .ctor``0(Tizen.Multimedia.PlayerError):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerErrorOccurredEventArgs::instance get_Error``0():Tizen.Multimedia.PlayerError` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.PlayerErrorOccurredEventArgs::instance ToString``0():System.String` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaSource` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaUriSource` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaUriSource::instance .ctor``0(System.String):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.MediaUriSource::instance get_Uri``0():System.String` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.StreamInfo` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.StreamInfo::instance get_Player``0():Tizen.Multimedia.Player` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.StreamInfo::instance GetDuration``0():System.Int32` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.StreamInfo::instance GetDurationNanoseconds``0():System.Int64` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance .ctor``0():System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance get_State``0():Tizen.Multimedia.PlayerState` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance get_StreamInfo``0():Tizen.Multimedia.StreamInfo` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance get_Display``0():Tizen.Multimedia.Display` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance set_Display``0(Tizen.Multimedia.Display):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance get_Volume``0():System.Single` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance set_Volume``0(System.Single):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance get_Muted``0():System.Boolean` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance set_Muted``0(System.Boolean):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance add_ErrorOccurred``0(System.EventHandler`1<Tizen.Multimedia.PlayerErrorOccurredEventArgs>):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance remove_ErrorOccurred``0(System.EventHandler`1<Tizen.Multimedia.PlayerErrorOccurredEventArgs>):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance add_PlaybackCompleted``0(System.EventHandler`1<System.EventArgs>):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance remove_PlaybackCompleted``0(System.EventHandler`1<System.EventArgs>):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance SetSource``0(Tizen.Multimedia.MediaSource):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance PrepareAsync``0():System.Threading.Tasks.Task` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance PrepareAsync``0(System.Threading.CancellationToken):System.Threading.Tasks.Task` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance Start``0():System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance Pause``0():System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance Stop``0():System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance Unprepare``0():System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance GetPlayPosition``0():System.Int32` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance SetPlayPositionAsync``0(System.Int32,System.Boolean):System.Threading.Tasks.Task` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance SetPlaybackRate``0(System.Single):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance Dispose``0(System.Boolean):System.Void` | implemented |
| `Tizen.Multimedia.MediaPlayer Tizen.Multimedia.Player::instance Dispose``0():System.Void` | implemented |
| `Tizen.Multimedia Tizen.Multimedia.Display` | implemented |
| `Tizen.Multimedia Tizen.Multimedia.Display::instance .ctor``0(Tizen.NUI.Window):System.Void` | implemented |
| `Tizen.Multimedia Tizen.Multimedia.Display::instance .ctor``0(Tizen.NUI.Window,System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction::instance .ctor``0(Tizen.NUI.AlphaFunction/BuiltinFunctions):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction::instance GetBuiltinFunction``0():Tizen.NUI.AlphaFunction/BuiltinFunctions` | implemented |
| `Tizen.NUI Tizen.NUI.Animation` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance .ctor``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance get_Duration``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance set_Duration``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance get_State``0():Tizen.NUI.Animation/States` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance add_Finished``0(System.EventHandler):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance remove_Finished``0(System.EventHandler):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance AnimateTo``0(Tizen.NUI.BaseComponents.View,System.String,System.Object,Tizen.NUI.AlphaFunction):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance AnimateTo``0(Tizen.NUI.BaseComponents.View,System.String,System.Object,System.Int32,System.Int32,Tizen.NUI.AlphaFunction):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance AnimateTo``0(Tizen.NUI.Animatable,System.String,System.Object,Tizen.NUI.AlphaFunction):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance AnimateTo``0(Tizen.NUI.Animatable,System.String,System.Object,System.Int32,System.Int32,Tizen.NUI.AlphaFunction):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance Play``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance Pause``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance Stop``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance Clear``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Animation::instance Dispose``0(Tizen.NUI.DisposeTypes):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Container` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance get_Children``0():System.Collections.Generic.List`1<Tizen.NUI.BaseComponents.View>` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance get_Parent``0():Tizen.NUI.Container` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance get_ChildCount``0():System.UInt32` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance Add``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance Remove``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance GetChildAt``0(System.UInt32):Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance GetParent``0():Tizen.NUI.Container` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance GetChildCount``0():System.UInt32` | implemented |
| `Tizen.NUI Tizen.NUI.Container::instance DisposeRecursively``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Key` | implemented |
| `Tizen.NUI Tizen.NUI.Key::instance get_KeyPressedName``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.Key::instance get_KeyCode``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Key::instance get_State``0():Tizen.NUI.Key/StateType` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod::instance get_PanelLayout``0():Tizen.NUI.InputMethod/PanelLayoutType` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod::instance set_PanelLayout``0(Tizen.NUI.InputMethod/PanelLayoutType):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod::instance get_OutputMap``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethodContext` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethodContext::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethodContext::instance Activate``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethodContext::instance Deactivate``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::static get_Instance``0():Tizen.NUI.FocusManager` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance SetCurrentFocusView``0(Tizen.NUI.BaseComponents.View):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance GetCurrentFocusView``0():Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance ClearFocus``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance SetFocusFinderRootView``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance ResetFocusFinderRootView``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance SetAsFocusGroup``0(Tizen.NUI.BaseComponents.View,System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance IsFocusGroup``0(Tizen.NUI.BaseComponents.View):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance GetFocusGroup``0(Tizen.NUI.BaseComponents.View):Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance EnableDefaultAlgorithm``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance IsDefaultAlgorithmEnabled``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance EnableFocusIndicator``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.FocusManager::instance IsFocusIndicatorEnabled``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.DisposeTypes` | implemented |
| `Tizen.NUI Tizen.NUI.DisposeTypes::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.DisposeTypes::Explicit:Tizen.NUI.DisposeTypes = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.DisposeTypes::Implicit:Tizen.NUI.DisposeTypes = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable::instance get_Disposed``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable::instance Dispose``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable::instance Dispose``0(Tizen.NUI.DisposeTypes):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable::instance Dispose``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Disposable::disposed:System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance get_Disposed``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance Dispose``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance Dispose``0(Tizen.NUI.DisposeTypes):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance Dispose``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::static op_Equality``0(Tizen.NUI.BaseHandle,Tizen.NUI.BaseHandle):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::static op_Inequality``0(Tizen.NUI.BaseHandle,Tizen.NUI.BaseHandle):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance Equals``0(System.Object):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::instance GetHashCode``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.BaseHandle::disposed:System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.Animatable` | implemented |
| `Tizen.NUI Tizen.NUI.EventHandlerWithReturnType`3` | implemented |
| `Tizen.NUI Tizen.NUI.EventHandlerWithReturnType`3::instance .ctor``0(System.Object,System.IntPtr):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.EventHandlerWithReturnType`3::instance Invoke``0(!0,!1):!2` | implemented |
| `Tizen.NUI Tizen.NUI.EventHandlerWithReturnType`3::instance BeginInvoke``0(!0,!1,System.AsyncCallback,System.Object):System.IAsyncResult` | implemented |
| `Tizen.NUI Tizen.NUI.EventHandlerWithReturnType`3::instance EndInvoke``0(System.IAsyncResult):!2` | implemented |
| `Tizen.NUI Tizen.NUI.HorizontalAlignment` | implemented |
| `Tizen.NUI Tizen.NUI.HorizontalAlignment::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.HorizontalAlignment::Begin:Tizen.NUI.HorizontalAlignment = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.HorizontalAlignment::Center:Tizen.NUI.HorizontalAlignment = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.HorizontalAlignment::End:Tizen.NUI.HorizontalAlignment = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.VerticalAlignment` | implemented |
| `Tizen.NUI Tizen.NUI.VerticalAlignment::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.VerticalAlignment::Top:Tizen.NUI.VerticalAlignment = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.VerticalAlignment::Center:Tizen.NUI.VerticalAlignment = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.VerticalAlignment::Bottom:Tizen.NUI.VerticalAlignment = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::instance .ctor``0(System.Single,System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::instance get_X``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::instance set_X``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::instance get_Y``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::instance set_Y``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::static get_Zero``0():Tizen.NUI.Vector2` | implemented |
| `Tizen.NUI Tizen.NUI.Vector2::static get_One``0():Tizen.NUI.Vector2` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance .ctor``0(System.Single,System.Single,System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance get_X``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance set_X``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance get_Y``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance set_Y``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance get_Z``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::instance set_Z``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::static get_Zero``0():Tizen.NUI.Vector3` | implemented |
| `Tizen.NUI Tizen.NUI.Vector3::static get_One``0():Tizen.NUI.Vector3` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance .ctor``0(System.Single,System.Single,System.Single,System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance get_X``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance set_X``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance get_Y``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance set_Y``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance get_Z``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance set_Z``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance get_W``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::instance set_W``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::static get_Zero``0():Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::static get_One``0():Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.Vector4::static op_Implicit``0(System.Single):Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.Position` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance .ctor``0(System.Single,System.Single,System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance get_X``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance set_X``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance get_Y``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance set_Y``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance get_Z``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Position::instance set_Z``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position::static op_Implicit``0(Tizen.NUI.Position):Tizen.NUI.Vector3` | implemented |
| `Tizen.NUI Tizen.NUI.Position::static op_Implicit``0(Tizen.NUI.Vector3):Tizen.NUI.Position` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D::instance .ctor``0(System.Int32,System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D::instance get_X``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D::instance set_X``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D::instance get_Y``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Position2D::instance set_Y``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance .ctor``0(System.Single,System.Single,System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance get_Width``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance set_Width``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance get_Height``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance set_Height``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance get_Depth``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Size::instance set_Depth``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size::static op_Implicit``0(Tizen.NUI.Size):Tizen.NUI.Vector3` | implemented |
| `Tizen.NUI Tizen.NUI.Size::static op_Implicit``0(Tizen.NUI.Vector3):Tizen.NUI.Size` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D::instance .ctor``0(System.Int32,System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D::instance get_Width``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D::instance set_Width``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D::instance get_Height``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Size2D::instance set_Height``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance .ctor``0(System.Single,System.Single,System.Single,System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance get_R``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance set_R``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance get_G``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance set_G``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance get_B``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance set_B``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance get_A``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Color::instance set_A``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Color::static op_Implicit``0(Tizen.NUI.Color):Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.Color::static op_Implicit``0(Tizen.NUI.Vector4):Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::Transparent:Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::Black:Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::White:Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::Red:Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::Green:Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Color::Blue:Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(Tizen.NUI.Color):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(Tizen.NUI.Vector3):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(Tizen.NUI.Vector4):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance .ctor``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance Get``0(System.Int32&):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance Get``0(System.Single&):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance Get``0(System.Boolean&):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyValue::instance Get``0(System.String&):System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance .ctor``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Add``0(System.Int32,Tizen.NUI.PropertyValue):Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Add``0(System.String,Tizen.NUI.PropertyValue):Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Insert``0(System.Int32,Tizen.NUI.PropertyValue):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Insert``0(System.String,Tizen.NUI.PropertyValue):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance get_Item``0(System.Int32):Tizen.NUI.PropertyValue` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance set_Item``0(System.Int32,Tizen.NUI.PropertyValue):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance get_Item``0(System.String):Tizen.NUI.PropertyValue` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance set_Item``0(System.String,Tizen.NUI.PropertyValue):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Count``0():System.UInt32` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Empty``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.PropertyMap::instance Clear``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Visual` | implemented |
| `Tizen.NUI Tizen.NUI.BorderVisualProperty` | implemented |
| `Tizen.NUI Tizen.NUI.BorderVisualProperty::Color:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.BorderVisualProperty::Size:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.ImageVisualProperty` | implemented |
| `Tizen.NUI Tizen.NUI.ImageVisualProperty::URL:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.ImageVisualProperty::FittingMode:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.ImageVisualProperty::SynchronousLoading:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.HiddenInputProperty` | implemented |
| `Tizen.NUI Tizen.NUI.HiddenInputProperty::Mode:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Timer` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance add_Tick``0(Tizen.NUI.EventHandlerWithReturnType`3<System.Object,Tizen.NUI.Timer/TickEventArgs,System.Boolean>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance remove_Tick``0(Tizen.NUI.EventHandlerWithReturnType`3<System.Object,Tizen.NUI.Timer/TickEventArgs,System.Boolean>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance .ctor``0(System.UInt32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance get_Interval``0():System.UInt32` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance set_Interval``0(System.UInt32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance Start``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance Stop``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance IsRunning``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.Timer::instance Dispose``0(Tizen.NUI.DisposeTypes):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Layer` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance get_Name``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance set_Name``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance get_Opacity``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance set_Opacity``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance get_Visibility``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance set_Visibility``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Layer::instance Dispose``0(Tizen.NUI.DisposeTypes):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window` | implemented |
| `Tizen.NUI Tizen.NUI.Window::static get_Instance``0():Tizen.NUI.Window` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance get_Size``0():Tizen.NUI.Size2D` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance get_WindowSize``0():Tizen.NUI.Size2D` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance set_WindowSize``0(Tizen.NUI.Size2D):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance get_BackgroundColor``0():Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance set_BackgroundColor``0(Tizen.NUI.Color):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance GetDefaultLayer``0():Tizen.NUI.Layer` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance Add``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance Remove``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance add_KeyEvent``0(System.EventHandler`1<Tizen.NUI.Window/KeyEventArgs>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window::instance remove_KeyEvent``0(System.EventHandler`1<Tizen.NUI.Window/KeyEventArgs>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance .ctor``0(Tizen.NUI.Size2D,Tizen.NUI.Position2D):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance get_Window``0():Tizen.NUI.Window` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance Run``0(System.String[]):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance Exit``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance OnCreate``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance OnPause``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance OnResume``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.NUIApplication::instance OnTerminate``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance add_ResourceReady``0(System.EventHandler`1<Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance remove_ResourceReady``0(System.EventHandler`1<Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance .ctor``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance get_ResourceUrl``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance set_ResourceUrl``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance get_SynchronousLoading``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance set_SynchronousLoading``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance get_LoadingStatus``0():Tizen.NUI.BaseComponents.ImageView/LoadingStatusType` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance get_Image``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView::instance set_Image``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance .ctor``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_Text``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_Text``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_TextColor``0():Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_TextColor``0(Tizen.NUI.Color):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_PointSize``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_PointSize``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_PixelSize``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_PixelSize``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_FontFamily``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_FontFamily``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_FontStyle``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_FontStyle``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_HorizontalAlignment``0():Tizen.NUI.HorizontalAlignment` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_HorizontalAlignment``0(Tizen.NUI.HorizontalAlignment):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_MultiLine``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_MultiLine``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_VerticalAlignment``0():Tizen.NUI.VerticalAlignment` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_VerticalAlignment``0(Tizen.NUI.VerticalAlignment):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_Ellipsis``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_Ellipsis``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance get_LineSpacing``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextLabel::instance set_LineSpacing``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_Text``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_Text``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_TextColor``0():Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_TextColor``0(Tizen.NUI.Color):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_PointSize``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_PointSize``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_PixelSize``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_PixelSize``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_FontFamily``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_FontFamily``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_FontStyle``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_FontStyle``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_HorizontalAlignment``0():Tizen.NUI.HorizontalAlignment` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_HorizontalAlignment``0(Tizen.NUI.HorizontalAlignment):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance add_TextChanged``0(System.EventHandler`1<Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance remove_TextChanged``0(System.EventHandler`1<Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_PlaceholderText``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_PlaceholderText``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_PlaceholderTextColor``0():Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_PlaceholderTextColor``0(Tizen.NUI.Vector4):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_MaxLength``0():System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_MaxLength``0(System.Int32):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_HiddenInputSettings``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_HiddenInputSettings``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance get_InputMethodSettings``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance set_InputMethodSettings``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField::instance GetInputMethodContext``0():Tizen.NUI.InputMethodContext` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Position``0():Tizen.NUI.Position` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Position``0(Tizen.NUI.Position):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Position2D``0():Tizen.NUI.Position2D` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Position2D``0(Tizen.NUI.Position2D):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_PositionX``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_PositionX``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_PositionY``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_PositionY``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Size``0():Tizen.NUI.Size` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Size``0(Tizen.NUI.Size):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Size2D``0():Tizen.NUI.Size2D` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Size2D``0(Tizen.NUI.Size2D):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_SizeWidth``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_SizeWidth``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_SizeHeight``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_SizeHeight``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_ParentOrigin``0():Tizen.NUI.Position` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_ParentOrigin``0(Tizen.NUI.Position):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_PivotPoint``0():Tizen.NUI.Position` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_PivotPoint``0(Tizen.NUI.Position):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_PositionUsesPivotPoint``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_PositionUsesPivotPoint``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Scale``0():Tizen.NUI.Vector3` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Scale``0(Tizen.NUI.Vector3):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_BackgroundColor``0():Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_BackgroundColor``0(Tizen.NUI.Color):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_BorderlineColor``0():Tizen.NUI.Color` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_BorderlineColor``0(Tizen.NUI.Color):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_CornerRadius``0():Tizen.NUI.Vector4` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_CornerRadius``0(Tizen.NUI.Vector4):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_BorderlineOffset``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_BorderlineOffset``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Background``0():Tizen.NUI.PropertyMap` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Background``0(Tizen.NUI.PropertyMap):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Name``0():System.String` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Name``0(System.String):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Visibility``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Opacity``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Opacity``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_BorderlineWidth``0():System.Single` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_BorderlineWidth``0(System.Single):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_Focusable``0():System.Boolean` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_Focusable``0(System.Boolean):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_LeftFocusableView``0():Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_LeftFocusableView``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_RightFocusableView``0():Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_RightFocusableView``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_UpFocusableView``0():Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_UpFocusableView``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance get_DownFocusableView``0():Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance set_DownFocusableView``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance ClearBackground``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance Show``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance Hide``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance add_FocusGained``0(System.EventHandler):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance remove_FocusGained``0(System.EventHandler):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance add_FocusLost``0(System.EventHandler):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance remove_FocusLost``0(System.EventHandler):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance add_KeyEvent``0(Tizen.NUI.EventHandlerWithReturnType`3<System.Object,Tizen.NUI.BaseComponents.View/KeyEventArgs,System.Boolean>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance remove_KeyEvent``0(Tizen.NUI.EventHandlerWithReturnType`3<System.Object,Tizen.NUI.BaseComponents.View/KeyEventArgs,System.Boolean>):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View::instance Dispose``0(Tizen.NUI.DisposeTypes):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Binding.BindableObject` | implemented |
| `Tizen.NUI Tizen.NUI.Binding.BindableObject::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Binding.Element` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::Default:Tizen.NUI.AlphaFunction/BuiltinFunctions = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::Linear:Tizen.NUI.AlphaFunction/BuiltinFunctions = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::Reverse:Tizen.NUI.AlphaFunction/BuiltinFunctions = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseInSquare:Tizen.NUI.AlphaFunction/BuiltinFunctions = 03000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseOutSquare:Tizen.NUI.AlphaFunction/BuiltinFunctions = 04000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseIn:Tizen.NUI.AlphaFunction/BuiltinFunctions = 05000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseOut:Tizen.NUI.AlphaFunction/BuiltinFunctions = 06000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseInOut:Tizen.NUI.AlphaFunction/BuiltinFunctions = 07000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseInSine:Tizen.NUI.AlphaFunction/BuiltinFunctions = 08000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseOutSine:Tizen.NUI.AlphaFunction/BuiltinFunctions = 09000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseInOutSine:Tizen.NUI.AlphaFunction/BuiltinFunctions = 0A000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::Bounce:Tizen.NUI.AlphaFunction/BuiltinFunctions = 0B000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::Sin:Tizen.NUI.AlphaFunction/BuiltinFunctions = 0C000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::EaseOutBack:Tizen.NUI.AlphaFunction/BuiltinFunctions = 0D000000` | implemented |
| `Tizen.NUI Tizen.NUI.AlphaFunction/BuiltinFunctions::Count:Tizen.NUI.AlphaFunction/BuiltinFunctions = 0E000000` | implemented |
| `Tizen.NUI Tizen.NUI.Animation/States` | implemented |
| `Tizen.NUI Tizen.NUI.Animation/States::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Animation/States::Stopped:Tizen.NUI.Animation/States = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.Animation/States::Playing:Tizen.NUI.Animation/States = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.Animation/States::Paused:Tizen.NUI.Animation/States = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.Key/StateType` | implemented |
| `Tizen.NUI Tizen.NUI.Key/StateType::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Key/StateType::Down:Tizen.NUI.Key/StateType = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.Key/StateType::Up:Tizen.NUI.Key/StateType = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.Key/StateType::Last:Tizen.NUI.Key/StateType = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Normal:Tizen.NUI.InputMethod/PanelLayoutType = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Number:Tizen.NUI.InputMethod/PanelLayoutType = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Email:Tizen.NUI.InputMethod/PanelLayoutType = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::URL:Tizen.NUI.InputMethod/PanelLayoutType = 03000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::PhoneNumber:Tizen.NUI.InputMethod/PanelLayoutType = 04000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::IP:Tizen.NUI.InputMethod/PanelLayoutType = 05000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Month:Tizen.NUI.InputMethod/PanelLayoutType = 06000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::NumberOnly:Tizen.NUI.InputMethod/PanelLayoutType = 07000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::HEX:Tizen.NUI.InputMethod/PanelLayoutType = 08000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Terminal:Tizen.NUI.InputMethod/PanelLayoutType = 09000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Password:Tizen.NUI.InputMethod/PanelLayoutType = 0A000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Datetime:Tizen.NUI.InputMethod/PanelLayoutType = 0B000000` | implemented |
| `Tizen.NUI Tizen.NUI.InputMethod/PanelLayoutType::Emoticon:Tizen.NUI.InputMethod/PanelLayoutType = 0C000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Border:Tizen.NUI.Visual/Type = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Color:Tizen.NUI.Visual/Type = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Gradient:Tizen.NUI.Visual/Type = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Image:Tizen.NUI.Visual/Type = 03000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Mesh:Tizen.NUI.Visual/Type = 04000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Primitive:Tizen.NUI.Visual/Type = 05000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Wireframe:Tizen.NUI.Visual/Type = 06000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Text:Tizen.NUI.Visual/Type = 07000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::NPatch:Tizen.NUI.Visual/Type = 08000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::SVG:Tizen.NUI.Visual/Type = 09000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::AnimatedImage:Tizen.NUI.Visual/Type = 0A000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::AnimatedGradient:Tizen.NUI.Visual/Type = 0B000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::AnimatedVectorImage:Tizen.NUI.Visual/Type = 0C000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Arc:Tizen.NUI.Visual/Type = 0D000000` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Type::Invalid:Tizen.NUI.Visual/Type = FFFFFFFF` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Property` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Property::Type:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Property::MixColor:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Visual/Property::Opacity:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.Timer/TickEventArgs` | implemented |
| `Tizen.NUI Tizen.NUI.Timer/TickEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window/KeyEventArgs` | implemented |
| `Tizen.NUI Tizen.NUI.Window/KeyEventArgs::instance get_Key``0():Tizen.NUI.Key` | implemented |
| `Tizen.NUI Tizen.NUI.Window/KeyEventArgs::instance set_Key``0(Tizen.NUI.Key):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.Window/KeyEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/LoadingStatusType` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/LoadingStatusType::value__:System.Int32` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/LoadingStatusType::Preparing:Tizen.NUI.BaseComponents.ImageView/LoadingStatusType = 00000000` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/LoadingStatusType::Ready:Tizen.NUI.BaseComponents.ImageView/LoadingStatusType = 01000000` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/LoadingStatusType::Failed:Tizen.NUI.BaseComponents.ImageView/LoadingStatusType = 02000000` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs::instance get_View``0():Tizen.NUI.BaseComponents.View` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs::instance set_View``0(Tizen.NUI.BaseComponents.View):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.ImageView/ResourceReadyEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs::instance get_TextField``0():Tizen.NUI.BaseComponents.TextField` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs::instance set_TextField``0(Tizen.NUI.BaseComponents.TextField):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.TextField/TextChangedEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View/KeyEventArgs` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View/KeyEventArgs::instance get_Key``0():Tizen.NUI.Key` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View/KeyEventArgs::instance set_Key``0(Tizen.NUI.Key):System.Void` | implemented |
| `Tizen.NUI Tizen.NUI.BaseComponents.View/KeyEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.System.Information Tizen.System.Information` | implemented |
| `Tizen.System.Information Tizen.System.Information::static TryGetValue``1(System.String,!!0&):System.Boolean` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs::instance get_Value``0():Tizen.System.MediaKeyEventArgs/KeyValue` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs::instance get_Status``0():Tizen.System.MediaKeyEventArgs/KeyStatus` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs::instance .ctor``0():System.Void` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKey` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKey::static add_Event``0(System.EventHandler`1<Tizen.System.MediaKeyEventArgs>):System.Void` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKey::static remove_Event``0(System.EventHandler`1<Tizen.System.MediaKeyEventArgs>):System.Void` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::value__:System.Int32` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Play:Tizen.System.MediaKeyEventArgs/KeyValue = 00000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Stop:Tizen.System.MediaKeyEventArgs/KeyValue = 01000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Pause:Tizen.System.MediaKeyEventArgs/KeyValue = 02000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Previous:Tizen.System.MediaKeyEventArgs/KeyValue = 03000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Next:Tizen.System.MediaKeyEventArgs/KeyValue = 04000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::FastForward:Tizen.System.MediaKeyEventArgs/KeyValue = 05000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Rewind:Tizen.System.MediaKeyEventArgs/KeyValue = 06000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::PlayPause:Tizen.System.MediaKeyEventArgs/KeyValue = 07000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Media:Tizen.System.MediaKeyEventArgs/KeyValue = 08000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyValue::Unknown:Tizen.System.MediaKeyEventArgs/KeyValue = 09000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyStatus` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyStatus::value__:System.Int32` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyStatus::Pressed:Tizen.System.MediaKeyEventArgs/KeyStatus = 00000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyStatus::Released:Tizen.System.MediaKeyEventArgs/KeyStatus = 01000000` | implemented |
| `Tizen.System.MediaKey Tizen.System.MediaKeyEventArgs/KeyStatus::Unknown:Tizen.System.MediaKeyEventArgs/KeyStatus = 02000000` | implemented |

## Restricted implementations

| Member / behavior | Status | Detail |
|---|---|---|
| `Animation.AnimateTo` on non-view or unsupported property | stub | Emits missing and throws; position, size, opacity, scale are implemented. |
| `ImageView.SynchronousLoading` HTTP and formats outside PNG/JPEG/GIF/BMP | stub | Emits missing and throws; local supported format headers read synchronously. |
| `ImageView.Image` FitWidth/FitHeight | stub | Emits missing and throws because protocol lacks these fitting modes. |
| `View.Background` unsupported visual types | stub | Emits missing and throws; color and border implemented. |
| Layouts, ScrollableBase, NUI.Components | missing | Tier 2 not implemented. Inspector rejects missing referenced types/members. |

623 type/member entries.
