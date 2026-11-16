# 07 - Tizen 10 TV emulator image: web runtime, injected APIs, keys, identity, config.xml

Behavioural spec recovered by **static** inspection of the Samsung TV emulator disk image. Nothing from the image was executed.
Clean-room: this file lists names, signatures, constants, formats and defaults only; no vendor function bodies, no vendor files.

- Image: `tv-samsung-10.0-x86_64/emulimg-10.0.x86_64` (qcow2 v3, 64 KiB clusters, zlib, no backing file, virtual size 12 885 950 464 B) + `info.ini` (`profile=tv`, `version=10.0`, `binary_version=10.0.6`).
- Layout: MBR. Partition 1 (offset 1 048 576, 6 GiB, ext4 label `emulator-rootfs`) = `/`. Partition 2 (offset 6 443 499 520, ext4 label `emulator-sysdata`) = `/opt`.
- Paths below are image paths; `p2:` prefix means partition 2 (mounted at `/opt`).
- Tags: **OBSERVED** = read from the named file/identifier. **INFERRED** = deduced from observed facts, not directly read.
- Readers used (stdlib Python, written for this task): `_samsung-tv-sdk-ref/tools/{qcow2,ext4,elfkeys,elfxref,keymap_from_init,jsapi_summary}.py`.

> Headline correction for ARCHITECTURE.md: the Tizen **10.0** TV image ships **Chromium 130.0.6723.116** (chromium-efl) with an Electron-based WRT 33.3.0. It is *not* Chromium 69 (that is Tizen 5.0 / 2019 TVs). A pinned-Chromium emulator must pick the engine per target platform version.

## 1. Web engine

| Fact | Value | Tag / source |
|---|---|---|
| Platform | `Tizen10/TV 10.0.0 (x86_64)`, `VERSION=10.0.0`, `CODENAME=TTEN`, `BUILD_ID=EMULATOR64-202601071715` | OBSERVED `/etc/tizen-release`, `/etc/os-release` |
| Engine library | `/usr/share/chromium-efl/lib/libchromium-impl.so` (274 MB, has symbols); EWK shim `/usr/lib64/libchromium-ewk.so` (`libewebkit2.so.0` symlink) | OBSERVED |
| Chromium version | `130.0.6723.116` | OBSERVED string `Chrome/130.0.6723.116` in libchromium-impl.so |
| WRT | Electron-derived runtime "wrtjs"; product token `WRT/33.3.0`; JS app `/usr/share/wrt/app/` (`package.json` name `wrtjs`, main `src/runtime.js`); `/usr/share/wrtjs/version` = `1.1.1` | OBSERVED strings `%s/%s Chrome/%s WRT/33.3.0`, `Chrome/130.0.6723.116 WRT/33.3.0` |
| WRT executables | `/usr/bin/wrt` (symlinks `wrt-loader`, `wrt-client`), `/usr/bin/wrt-service`, loader descriptor `/usr/share/aul/wrt.loader`, env `/etc/profile.d/wrt_env.sh` (`WRT_BLOCK_SINGLE_PROCESS=OFF`) | OBSERVED |
| UA template (TV) | `Mozilla/5.0 (SMART-TV; LINUX; Tizen %s) AppleWebKit/537.36 (KHTML, like Gecko) %s/%s TV Safari/537.36%s` | OBSERVED string in libchromium-impl.so |
| Where UA is built | `EflWebView::VersionInfo::BuildUserAgentForTV` (source path string `tizen_src/ewk/efl_integration/common/version_info.cc`), called from `CreateUserAgent` | OBSERVED symbols |
| UA arguments | (1) Tizen version, (2) `VersionForUserAgent()` = Chromium version, (3) Tizen version again, (4) empty suffix unless the "impl library upgrade" (UWE) switch is set | OBSERVED by disassembly of the call site (argument order) |
| Tizen version source | system-info key `http://tizen.org/feature/platform.version` = `10.0` (read in `OSType()`) | OBSERVED `/etc/config/model-config.xml` + symbol |
| **Default UA string** | `Mozilla/5.0 (SMART-TV; LINUX; Tizen 10.0) AppleWebKit/537.36 (KHTML, like Gecko) 130.0.6723.116/10.0 TV Safari/537.36` | INFERRED (template + arguments above; not captured from a running guest) |

Notes
- The UA has **no** `Chrome/` token and no `SamsungBrowser` token; the "product/version" slot carries `<chromium version>/<tizen version>`. Apps that sniff `Tizen (\d+\.\d+)` and `SMART-TV` work; apps that sniff `Chrome/(\d+)` get nothing. (OBSERVED template.)
- The Electron-style string `... Chrome/130.0.6723.116 WRT/33.3.0` exists too, but the TV path uses the template above. Which one a given WRT window ends up with was not traced end to end (see UNKNOWNS).

## 2. Injected Web API layer

### 2.1 Mechanism

- **OBSERVED** `window.tizen` and `window.webapis` are provided by *xwalk extensions*: shared objects in `/usr/lib64/tizen-extensions-crosswalk/` listed by `plugins.json` (version 2.92) and `x-plugins.json`, lazily loaded by entry point name. A second directory `/usr/lib64/tizen-extensions-crosswalk-ewk/` (`vd-webapi.json`: only `tizen`, `xwalk`) serves the non-WRT EWK webview.
- **OBSERVED** every extension `.so` embeds its JavaScript source as a string; JS talks to native through `extension.postMessage` / `extension.internal.sendSyncMessage` with JSON `{cmd|method, args}`; native message names are listed per module in section 2.4.
- **OBSERVED** WRT preloads without first use: `libwidget_plugin`, `tizen.systeminfo`, `tizen.tvinputdevice`, `webapis.adinfo`, `webapis.avplay`, `webapis.productinfo`, `webapis.tvinfo`, `webapis.network` (name list in libchromium-impl.so).
- **OBSERVED** `$WEBAPIS/webapis/webapis.js`: WRT resolves the virtual prefixes `/$WEBAPIS`, `/$B2BAPIS`, `/$USB_DIR`, `/$TEMP`, `/$STD_WRITE`, `/$SHARE` (function `ResolveAlias`, source string `encrypted_file_url_loader.cc`); `$WEBAPIS` maps to `/usr/bin/emps/empPepperPlugins/`. The file `/usr/bin/emps/empPepperPlugins/webapis/webapis.js` exists (18 600 B; `webapis.min.js` is a symlink to it). It creates `window.webapis` if missing, defines a Pepper-plugin bridge, an argument validator and `WebAPIException`, then loads "upgradable" pepper plugins returned by `widget.getDownloadedWebapis()`.
- **INFERRED** for the emulator: serving an (almost) empty script at `$WEBAPIS/webapis/webapis.js` is sufficient; all `webapis.*` modules of section 2.3 exist *without* that script because they come from the extension layer. The script must not replace an existing `window.webapis`.

### 2.2 `tizen.*` modules present (OBSERVED `plugins.json`)

`tizen` (core: `tizen.*Filter`, `WebAPIException`, ...), `tizen.account`, `tizen.alarm`, `tizen.application`, `tizen.archive`, `tizen.bluetooth`, `tizen.content`, `tizen.datacontrol`, `tizen.download`, `tizen.exif`, `tizen.filesystem`, `tizen.iotcon`, `tizen.keymanager`, `tizen.mediacontroller`, `tizen.mediakey`, `tizen.messageport`, `tizen.metadata`, `tizen.ml`, `tizen.package`, `tizen.push`, `tizen.systeminfo`, `tizen.time`, `tizen.tvaudiocontrol`, `tizen.tvchannel`, `tizen.tvdisplaycontrol`, `tizen.tvinfo`, `tizen.tvinputdevice`, `tizen.tvwindow`, `tizen.voicecontrol`, `tizen.websetting`, `xwalk` (utils); plus Cordova `file`/`globalization`, `SplashScreen`, `Widget` (W3C `widget` object). Service-side only: `tizen.notification`.

### 2.3 `webapis.*` modules present (OBSERVED `plugins.json` / `x-plugins.json`, version = each module's `getVersion()` constant)

| Module | Version | Module | Version |
|---|---|---|---|
| `webapis.adinfo` | 4.0 | `webapis.network` | 3.4 |
| `webapis.appcommon` | 3.9 | `webapis.objectdetection` | 1.0 |
| `webapis.avplay` | 7.3 | `webapis.poseestimation` | 1.0 |
| `webapis.avplaystore` | 7.3 | `webapis.pluginmanager` | 1.0 |
| `webapis.bixby` | 2.0.0 | `webapis.productinfo` | 4.1 |
| `webapis.broadcastapputil` | 1.0 | `webapis.tvinfo` | 4.5 |
| `webapis.debugtool` | 1.0 | `webapis.tvs` | 1.5 |
| `webapis.deviced` | 1.0 | `webapis.unifiedauthentication` | 1.0 |
| `webapis.displayrotator` | 1.1 | `webapis.unipicture` | 1.0.0 |
| `webapis.featureconfig` | 1.0.0 | `webapis.widgetdata` | 2.0 |
| `webapis.logging` | 4.0 | `webapis.preview` | (x-plugins) |

Service-side only: `webapis.wrtservice`, `webapis.sso`. **No extension library** in this directory for `webapis.billing`, page-side `webapis.sso`, `webapis.systemcontrol`, `webapis.voiceinteraction`, `webapis.security`, `webapis.syncplay` (OBSERVED directory listing; a native `/usr/lib64/billing_api_internal/` exists but has no JS binding here).

`webapis.productinfo` (the module apps touch most), OBSERVED names: `getVersion`, `getFirmware`, `getDuid`, `getModelCode`, `getModel`, `getRealModel`, `getBaseModelCode`, `getLocalSet`, `getPsid`, `getSmartTVServerType`, `getSmartTVServerVersion`, `getTunerEpop`, `getLicensedVendor`, `getLicensedBrand`, `getNoGlass3dSupport`, `getSystemConfig(key)`, `setSystemConfig(key, value, onsuccess, onerror)`, `addSystemConfigChangeListener(key, listener)`, `removeSystemConfigChangeListener(key, id)`, booleans `isSoccerModeEnabled`, `isTtvSupported`, `isUdPanelSupported`, `is8KPanelSupported`, `isOledPanelSupported`, `isUHDAModel`, `isWallModel`, `isDisplayRotatorSupported`; enum `ProductInfoSiServerType { SI_TYPE_OPERATIING_SERVER: 0, SI_TYPE_DEVELOPMENT_SERVER: 1, SI_TYPE_DEVELOPING_SERVER: 2 }` (the misspelling `OPERATIING` is in the image).

Runtime-level message names used by the JS (OBSERVED): `tizen://api/inputdevice/{registerKey,unregisterKey,registerKeyBatch,unregisterKeyBatch}`, `webapis://appcommon/{RegisterKeyInSpecialMode,setIMEPosition,setScreenSaver,setAuxHint}`, `tizen://tvwindow/*`, `tizen://api/systeminfo/getDisplayResolution`, `tizen://setFocus`.

### 2.4 Full name tables

Generated from the JS embedded in each extension `.so` (file name = `crosswalk__<lib>.js` or `service__<lib>.js`). Per module: exported objects, `Type: method(args); ...`, enumerable properties, and `[native]` message names. All OBSERVED. Argument names are the vendor's formal parameter names (interface facts).

#### `webapis.*` (and WRT-service modules)

```text
### crosswalk__libwebapis_Logging.js
exports: LoggingManager
  LoggingManager: isAgreedWith(); getVersion(); setServiceConfigInfo(servicename,queuemax,expiration,threshold,loglevel,serverUrl,onsuccess,onerror); setEventHeader(modelName,userId,duid,country,privacylog,onsuccess,onerror); addEventLog(eventName,time,category,value,desc,onsuccess,onerror); addEventFullLog(eventName,log,onsuccess,onerror); flushLog(onsuccess,onerror); addEventConfigInfo(eventName,queueMax,expiration,threshold,loglevel,onsuccess,onerror)
  [native] LoggingManager_addEventLog, LoggingManager_isAgreedWith, LoggingManager_setServiceConfigInfo
### crosswalk__libwebapis_PluginManager.js
exports: PluginManagerManager
  PluginManagerManager: getVersion(); getPluginInfo(pluginName); getPluginsInfo(onsuccess,onerror)
  [native] PluginManagerManager_getPluginInfo, PluginManagerManager_getPluginsInfo
### crosswalk__libwebapis_adinfo.js
exports: AdInfoManager
  AdInfoManager: getVersion(); getTIFA(); isLATEnabled()
  [props] obj: code, name, message
### crosswalk__libwebapis_appcommon.js
exports: AppCommonManager
  AppCommonManager: getVersion(); getUuid(); generateKey(keyName); registerKey(keyNameList); registerKeyInSpecialMode(keyNameList,mode); unregisterKey(keyNameList); getSpecialSupportedKeys(); getSystemStat(resource,onsuccess,onerror); getForegroundAppId(); setEpopAppWindow(epopPosition,anyPositionMode); requestTvContextTask(target,action); setIMERecommendedWordsType(Type); setIMERecommendedWords(words); setIMEPosition(x,y,align); setScreenSaver(state,onsuccess,onerror); resetProfiling(onsuccess,onerror); recordProfiling(label,onsuccess,onerror); setAppFocus(state); setWindowStackMode(mode); setAuxHint(auxhint,onsuccess,onerror); getAppState(appid)
  [native] AppCommonManager_checkPlatformLevelPrivilege, AppCommonManager_generateKey, AppCommonManager_getAppState, AppCommonManager_getForegroundAppId, AppCommonManager_getIMEResolution, AppCommonManager_getSystemStat, AppCommonManager_recordProfiling, AppCommonManager_registerKeyInSpecialMode, AppCommonManager_requestTvContextTask, AppCommonManager_setEpopAppWindow, AppCommonManager_setScreenSaver, tizen://api/inputdevice/registerKey, tizen://api/inputdevice/unregisterKey, tizen://setFocus, tizen://setWindowStackMode, webapis://appcommon/RegisterKeyInSpecialMode, webapis://appcommon/setAuxHint, webapis://appcommon/setIMEPosition, webapis://appcommon/setIMERecommendedType, webapis://appcommon/setIMERecommendedWords
  [privileges] TV_INPUT_DEVICE
### crosswalk__libwebapis_avplay.js
exports: AVPlayManager
  WebAPIExceptionLocal: toString()
  AVPlayManager: open(); setDisplayRect(); prepare(); prepareAsync(); restoreAsync(); play(); setDrm(); getUID(); changeURL(); stop(); close(); setListener(); restore(); suspend(); set360Rotation(); set360Zoom(); setStreamingProperty(); getState(); getSubState(); unsetSoundAnalysisListener(); setDisplayMethod(); enableAudioStream(); disableAudioStream(); setExternalClockTick(); updateSyncEvent(); setVideoRoi(); setTimeoutForBuffering(); setSelectTrack(); setBufferingParam(); setExternalSubtitlePath(); setLooping(); setSeamlessLooping(); setSilentSubtitle(); setSubtitlePosition(); getVideoSeamlessInfo(); getVideoSize(); getCodecInfo(); setVideoStillMode(); setDisplayRotation(); setSpeed(); setSoundAnalysisListener(); seekTo(); pause(); getVersion(); getDuration(); get360Info(); getStreamingProperty(); getCurrentStreamInfo(); getTotalTrackInfo(); getCurrentTime(); setNextURI(); jumpForward(); jumpBackward()
  [props] this: code, name, message
  [native] AVPlay_changeURL, AVPlay_close, AVPlay_disableAudioStream, AVPlay_enableAudioStream, AVPlay_get360Info, AVPlay_getCodecInfo, AVPlay_getCurrentStreamInfo, AVPlay_getCurrentTime, AVPlay_getDuration, AVPlay_getState, AVPlay_getStreamingProperty, AVPlay_getSubState, AVPlay_getTotalTrackInfo, AVPlay_getUID, AVPlay_getVersion, AVPlay_getVideoSeamlessInfo, AVPlay_getVideoSize, AVPlay_jumpBackward, AVPlay_jumpForward, AVPlay_open, AVPlay_pause, AVPlay_play, AVPlay_prepare, AVPlay_prepareAsync, AVPlay_restore, AVPlay_restoreAsync, AVPlay_seekTo, AVPlay_set360Rotation, AVPlay_set360Zoom, AVPlay_setBufferingParam, AVPlay_setDisplayMethod, AVPlay_setDisplayRect, AVPlay_setDisplayRotation, AVPlay_setDrm, AVPlay_setExternalClockTick, AVPlay_setExternalSubtitlePath, AVPlay_setLooping, AVPlay_setNextURI, AVPlay_setSeamlessLooping, AVPlay_setSelectTrack, AVPlay_setSilentSubtitle, AVPlay_setSpeed, AVPlay_setStreamingProperty, AVPlay_setSubtitlePosition, AVPlay_setTimeoutForBuffering, AVPlay_setVideoRoi, AVPlay_setVideoStillMode, AVPlay_setuniqueId, AVPlay_stop, AVPlay_suspend, AVPlay_updateSyncEvent
### crosswalk__libwebapis_avplaystore.js
exports: AVPlayServiceManager
  WebAPIExceptionLocalStore: toString()
  Service: open(); setDisplayRect(); prepare(); prepareAsync(); restoreAsync(); play(); setDrm(); getUID(); changeURL(); stop(); close(); setListener(); restore(); suspend(); set360Rotation(); set360Zoom(); get360Info(); setStreamingProperty(); getState(); getSubState(); unsetSoundAnalysisListener(); setDisplayMethod(); enableAudioStream(); setVideoRoi(); setExternalClockTick(); updateSyncEvent(); disableAudioStream(); setTimeoutForBuffering(); setSelectTrack(); setBufferingParam(); setExternalSubtitlePath(); setLooping(); setSeamlessLooping(); setSilentSubtitle(); setSubtitlePosition(); getVideoSeamlessInfo(); getVideoSize(); getCodecInfo(); setVideoStillMode(); setDisplayRotation(); setSpeed(); setSoundAnalysisListener(); seekTo(); pause(); getVersion(); getDuration(); getStreamingProperty(); getCurrentStreamInfo(); getTotalTrackInfo(); getCurrentTime(); setNextURI(); jumpForward(); jumpBackward()
  AVPlayServiceManager: getPlayer()
  [props] this: code, name, message
  [native] AVPlayService_close, AVPlayService_disableAudioStream, AVPlayService_enableAudioStream, AVPlayService_get360Info, AVPlayService_getCodecInfo, AVPlayService_getCurrentStreamInfo, AVPlayService_getCurrentTime, AVPlayService_getDuration, AVPlayService_getPlayer, AVPlayService_getState, AVPlayService_getStreamingProperty, AVPlayService_getSubState, AVPlayService_getTotalTrackInfo, AVPlayService_getUID, AVPlayService_getVersion, AVPlayService_getVideoSeamlessInfo, AVPlayService_getVideoSize, AVPlayService_jumpBackward, AVPlayService_jumpForward, AVPlayService_open, AVPlayService_pause, AVPlayService_play, AVPlayService_prepare, AVPlayService_prepareAsync, AVPlayService_restore, AVPlayService_restoreAsync, AVPlayService_seekTo, AVPlayService_set360Rotation, AVPlayService_set360Zoom, AVPlayService_setBufferingParam, AVPlayService_setDisplayMethod, AVPlayService_setDisplayRect, AVPlayService_setDisplayRotation, AVPlayService_setDrm, AVPlayService_setExternalClockTick, AVPlayService_setExternalSubtitlePath, AVPlayService_setLooping, AVPlayService_setNextURI, AVPlayService_setSeamlessLooping, AVPlayService_setSelectTrack, AVPlayService_setSilentSubtitle, AVPlayService_setSpeed, AVPlayService_setStreamingProperty, AVPlayService_setSubtitlePosition, AVPlayService_setTimeoutForBuffering, AVPlayService_setVideoRoi, AVPlayService_setVideoStillMode, AVPlayService_setuniqueId, AVPlayService_stop, AVPlayService_suspend, AVPlayService_updateSyncEvent, AVPlay_changeURL
### crosswalk__libwebapis_bixby.js
exports: Bixby
  Bixby: initialize(); deinitialize(); setAppStateRequestListener(callback); unsetAppStateRequestListener(); completeAppStateRequest(app_state_handler,app_state); setActionExecutionListener(action_id,callback); unsetActionExecutionListener(action_id); completeActionExecution(action_handler,action_result); getActionName(action_handler); getVersion()
  [native] Bixby_completeActionExecution, Bixby_completeAppStateRequest, Bixby_deinitialize, Bixby_getActionName, Bixby_initialize, Bixby_setActionExecutionListener, Bixby_setAppStateRequestListener, Bixby_unsetActionExecutionListener, Bixby_unsetAppStateRequestListener, setActionExecution, setAppStateRequest
### crosswalk__libwebapis_broadcastapputil.js
exports: BroadcastAppUtilManager
  BroadcastAppUtilManager: getVersion(); loadFavoriteName(favorite); getChannelNumberString(svcMode,chType,major,minor); getCurrentCategory(antennaMode,svcMode,successcallback,errorcallback); setCurrentCategory(antennaMode,svcMode,category,type,sortMode,successcallback,errorcallback); getNavigationList(antennaMode,svcMode,successcallback,errorcallback); getNavigationModeInfoCategory(handleId); getNavigationModeInfoSort(handleId); getNavigationModeInfoParam(handleId)
  [native] BroadcastAppUtil_getChannelNumberString, BroadcastAppUtil_getCurrentCategory, BroadcastAppUtil_getNavigationList, BroadcastAppUtil_getNavigationModeInfoCategory, BroadcastAppUtil_getNavigationModeInfoParam, BroadcastAppUtil_getNavigationModeInfoSort, BroadcastAppUtil_getVersion, BroadcastAppUtil_loadFavoriteName, BroadcastAppUtil_setCurrentCategory
### crosswalk__libwebapis_debugtool.js
exports: DebugToolManager
  DebugToolManager: getVersion(); addMonitorLog(logPatterns,grepPatterns,sleepSec,listener); removeMonitorLog(listenerId)
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(listenerId)
  [native] DebugToolManager_addMonitorLog, DebugToolManager_getVersion, DebugToolManager_removeMonitorLog
### crosswalk__libwebapis_deviced.js
exports: DevicedManager
  DevicedManager: getVersion(); getBatteryCapacity(); getBatteryPowerSource(); addBatteryCapacityListener(onbatterycapacitychange); removeBatteryCapacityListener(callbackId); addChargingStatusListener(onchargingstatuschange); removeChargingStatusListener(callbackId)
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(callbackId); hasSameListener(callback)
  [native] DevicedManager_addBatteryCapacityListener, DevicedManager_addChargingStatusListener, DevicedManager_checkIsBatterySupported, DevicedManager_getBatteryCapacity, DevicedManager_getBatteryPowerSource, DevicedManager_getVersion, DevicedManager_removeBatteryCapacityListener, DevicedManager_removeChargingStatusListener
### crosswalk__libwebapis_displayrotator.js
exports: DisplayRotatorManager
  DisplayRotatorManager: getVersion(); isSupported(); getStatus(); getOrientation(); setOrientation(orientation); setListener(listener); unsetListener()
  ListenerManager: onListenerCalled(msg); addListener(callback,watchId); removeListener(watchId)
  [native] DisplayRotatorManager_getVersion, DisplayRotatorManager_isSupported, DisplayRotatorManager_setListener, DisplayRotatorManager_setOrientation, DisplayRotatorManager_unsetListener
### crosswalk__libwebapis_featureconfig.js
exports: FeatureConfig
  FeatureConfig: getVersion(); getFeatureConfigLong(key); getFeatureConfigBool(key); getFeatureConfigString(key)
  [native] FeatureConfig_getFeatureConfigBool, FeatureConfig_getFeatureConfigLong, FeatureConfig_getFeatureConfigString, FeatureConfig_getVersion
### crosswalk__libwebapis_network.js
exports: NetworkManager
  NetworkManager: getVersion(); getActiveConnectionType(); getIp(); setIp(ip); getTVName(); getIpMode(); setIpMode(ipmode); getSubnetMask(); setSubnetMask(subnet); getGateway(); setGateway(gateway); getDns(); setDns(dns); getProxyserverInfo(); setProxyserverInfo(id,pwd,url,port); getSecondaryDns(); getMac(); isConnectedToGateway(); isConnectedToInternet(); getWiFiSsid(); getWiFiSignalStrengthLevel(); getWiFiSecurityMode(); getWiFiEncryptionType(); setDhcpOption60Field(vendor); removeDhcpOption60Field(); getCurrentDhcpOption60Field(); checkCurrentIpWith60Field(); enableSoftAP(); disableSoftAP(); isSoftAPEnabled(); getSoftAPSSID(); setSoftAPSSID(ssid); getSoftAPChannel(); setSoftAPChannel(channel); getSoftAPSecurityKey(); setSoftAPSecurityKey(securityKey); getSoftAPSecurityKeyAutoGeneration(); setSoftAPSecurityKeyAutoGeneration(value); getSoftAPSignalStrength(); setSoftAPSignalStrength(power); getSoftAPVisibility(); setSoftAPVisibility(visibility); getSoftAPSecurityType(); setSoftAPSecurityType(securityType); setTVName(name); setEAPCAfilePath(path); setEAPPassphrase(name,password); getWiFiFrequency(); getEthernetMac(); addInternetCheckListener(listener); removeInternetCheckListener(listenerId); addNetworkStateChangeListener(listener); removeNetworkStateChangeListener(listenerId); addWifiStateChangeListener(listener); removeWifiStateChangeListener(listenerId); addSoftAPStateChangeListener(listener); removeSoftAPStateChangeListener(listenerId); addSoftAPEnableListener(listener); removeSoftAPEnableListener(listenerId); addSoftAPDisableListener(listener); removeSoftAPDisableListener(listenerId); addSoftAPClientInfoListener(listener); removeSoftAPClientInfoListener(listenerId)
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(watchId)
  [native] NetworkManager_addInternetCheckListener, NetworkManager_addNetworkStateChangeListener, NetworkManager_addSoftAPClientInfoListener, NetworkManager_addSoftAPDisableListener, NetworkManager_addSoftAPEnableListener, NetworkManager_addSoftAPStateChangeListener, NetworkManager_addWifiStateChangeListener, NetworkManager_checkCurrentIpWith60Field, NetworkManager_disableSoftAP, NetworkManager_enableSoftAP, NetworkManager_getActiveConnectionType, NetworkManager_getCurrentDhcpOption60Field, NetworkManager_getDns, NetworkManager_getEthernetMac, NetworkManager_getGateway, NetworkManager_getIp, NetworkManager_getIpMode, NetworkManager_getMac, NetworkManager_getProxyserverInfo, NetworkManager_getSecondaryDns, NetworkManager_getSoftAPChannel, NetworkManager_getSoftAPSSID, NetworkManager_getSoftAPSecurityKey, NetworkManager_getSoftAPSecurityKeyAutoGeneration, NetworkManager_getSoftAPSecurityType, NetworkManager_getSoftAPSignalStrength, NetworkManager_getSoftAPVisibility, NetworkManager_getSubnetMask, NetworkManager_getTVName, NetworkManager_getVersion, NetworkManager_getWiFiEncryptionType, NetworkManager_getWiFiFrequency, NetworkManager_getWiFiSecurityMode, NetworkManager_getWiFiSignalStrengthLevel, NetworkManager_getWiFiSsid, NetworkManager_isConnectedToGateway, NetworkManager_isConnectedToInternet, NetworkManager_isSoftAPEnabled, NetworkManager_removeDhcpOption60Field, NetworkManager_removeInternetCheckListener, NetworkManager_removeNetworkStateChangeListener, NetworkManager_removeSoftAPClientInfoListener, NetworkManager_removeSoftAPDisableListener, NetworkManager_removeSoftAPEnableListener, NetworkManager_removeSoftAPStateChangeListener, NetworkManager_removeWifiStateChangeListener, NetworkManager_setDhcpOption60Field, NetworkManager_setDns, NetworkManager_setEAPCAfilePath, NetworkManager_setEAPPassphrase, NetworkManager_setGateway, NetworkManager_setIp, NetworkManager_setIpMode, NetworkManager_setProxyserverInfo, NetworkManager_setSoftAPChannel, NetworkManager_setSoftAPSSID, NetworkManager_setSoftAPSecurityKey, NetworkManager_setSoftAPSecurityKeyAutoGeneration, NetworkManager_setSoftAPSecurityType, NetworkManager_setSoftAPSignalStrength, NetworkManager_setSoftAPVisibility, NetworkManager_setSubnetMask, NetworkManager_setTVName
### crosswalk__libwebapis_objectdetection.js
exports: ObjectDetectionManager
  ObjectDetectionManager: getVersion(); init(handle,detectionType); deinit(handle); create(); destroy(handle); runWithBuffer(handle,buffer); run(handle,url)
  [native] ObjectDetectionManager_create, ObjectDetectionManager_deinit, ObjectDetectionManager_destroy, ObjectDetectionManager_getVersion, ObjectDetectionManager_init, ObjectDetectionManager_run, ObjectDetectionManager_runWithBuffer
### crosswalk__libwebapis_poseestimation.js
exports: PoseEstimationManager
  PoseEstimationManager: getVersion(); create(); init(handle); runWithBuffer(handle,buffer,roi); run(handle,url,roi); deinit(handle); destroy(handle)
  [native] PoseEstimationManager_create, PoseEstimationManager_deinit, PoseEstimationManager_destroy, PoseEstimationManager_getVersion, PoseEstimationManager_init, PoseEstimationManager_run, PoseEstimationManager_runWithBuffer
### crosswalk__libwebapis_preview.js
exports: Preview
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener()
  Preview: setPreviewData(previewData_JSON,successCallback,errorCallback); getVersion(); setActionDataEventListener(deeplinkCallback); unsetActionDataEventListener(); setFuntionTileData(functionData_JSON,successCallback,errorCallback)
### crosswalk__libwebapis_productinfo.js
exports: ProductInfoManager
  ProductInfoManager: getVersion(); getRealModel(); getModel(); isWallModel(); getPsid(); getSmartTVServerType(); getSmartTVServerVersion(); getTunerEpop(); isUdPanelSupported(); getFirmware(); getDuid(); getLocalSet(); getModelCode(); getBaseModelCode(); isUHDAModel(); is8KPanelSupported(); getLicensedVendor(); isSoccerModeEnabled(); isTtvSupported(); getNoGlass3dSupport(); isDisplayRotatorSupported(); getLicensedBrand(); isOledPanelSupported(); addSystemConfigChangeListener(key,callback); removeSystemConfigChangeListener(listenerId); getSystemConfig(key); setSystemConfig(key,value,successCallback,errorCallback)
  ListenerManager: onListenerCalled(msg); addListener(callback,watchId); removeListener(watchId)
  [native] ProductInfoManager_addSystemConfigChangeListener, ProductInfoManager_getSystemConfig, ProductInfoManager_removeSystemConfigChangeListener, ProductInfoManager_setSystemConfig
### crosswalk__libwebapis_tvinfo.js
exports: TvInfoManager
  TvInfoManager: getVersion(); isTvsPicSizeResized(); showCaption(show); registerInAppCaptionControl(status); addCaptionChangeListener(key,listener); removeCaptionChangeListener(listenerId); getMenuValue(key); setMenuValue(key,value,successCallback,errorCallback); getTvInfoValue(key); addTvInfoChangeListener(key,listener); removeTvInfoChangeListener(listenerId)
  ListenerManager: onListenerCalled(msg); addListener(callback,watchId); removeListener(watchId)
  [native] TvInfoManager_addCaptionChangeListener, TvInfoManager_getMenuValue, TvInfoManager_isTvsPicSizeResized, TvInfoManager_registerInAppCaptionControl, TvInfoManager_removeCaptionChangeListener, TvInfoManager_setMenuValue, TvInfoManager_showCaption
### crosswalk__libwebapis_tvs.js
exports: TVSManager
  TVSPluginCaller: _validate_result(result); _sync_plugin_call(callArgs); _async_plugin_call(callArgs)
  TVSDisposable: _create(); dispose(); _validCheck()
  SourceControl: dispose(); getSourceState(successCallback,errorCallback)
  ServiceNavigation: dispose(); getOptimumService(criteriaHelper,tvMode,serviceData,successCallback,errorCallback); getCurrentServiceInfo(criteriaHelper,tvMode,serviceData,successCallback,errorCallback); getCurrentTvPlusServiceInfo(criteriaHelper,tvMode,serviceData,successCallback,errorCallback); getNextServiceInfo(criteriaHelper,tvMode,referenceServiceId,serviceData,successCallback,errorCallback); getPreviousServiceInfo(criteriaHelper,tvMode,referenceServiceId,serviceData,successCallback,errorCallback); setService(serviceId,changeDirection,cacheOnly,appId,successCallback,errorCallback); setNextService(criteriaHelper,serviceData,successCallback,errorCallback); setPreviousService(criteriaHelper,serviceData,successCallback,errorCallback); getServiceList(criteriaHelper,tvMode,serviceListType,includeDefaultCurrent,successCallback,errorCallback); getTvMode(successCallback,errorCallback)
  AVControl: dispose(); startExclusiveAVSession(successCallback,errorCallback); endExclusiveAVSession(successCallback,errorCallback); muteVideo(mode,onoff,successCallback,errorCallback); muteAudio(mode,onoff,successCallback,errorCallback)
  VideoControl: dispose(); getWindowId(successCallback,errorCallback); setWindowId(windowId,successCallback,errorCallback); setDefaultSize(successCallback,errorCallback)
  LockControl: dispose(); setTemporaryServiceChildUnlockStatus(unlockStatus,successCallback,errorCallback); getTemporaryServiceChildUnlockStatus(successCallback,errorCallback); setTemporaryNCPlusUnlockStatus(unlockStatus,successCallback,errorCallback); getTemporaryNCPlusUnlockStatus(successCallback,errorCallback); setTemporaryRatingUnlockLevel(ratingLevel,successCallback,errorCallback); temporaryServiceUnmute(successCallback,errorCallback)
  CriteriaHelper: dispose(); addWhere(tag,tagValue); addWhereServiceId(serviceId); addWhereNot(tag,tagValue); resetWhere(tag); fetch(tag); orderBy(tag); groupBy(tag)
  NavigationCriteria: getNavigationCriteria(criteriahelper,sortmode,mode); getNavigationSubCriteria(criteriahelper,subId,mode); getDirectTuningCriteria(criteriahelper,major,minor,mode)
  ServiceData: dispose(); setValueOfTag(tag,tagValue); getValueOfTag(tag); getServiceName(); getServiceId(); setServiceId(serviceId)
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(watchId)
  SignalSubscriber: dispose(); addReceivedSignalCallback(signal,pipeline,onSignal); removeReceivedSignalCallback(signal,pipeline,watchId)
  ServiceStorage: dispose(); findService(criteriaHelper,serviceData)
  TVSManager: getVersion()
### crosswalk__libwebapis_unifiedauthentication.js
exports: unifiedauthentication
  unifiedauthentication: getVersion(); UnifiedAuth()
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(watchId)
  [native] unifiedauthentication_authenticate, unifiedauthentication_create, unifiedauthentication_deleteAuthentication, unifiedauthentication_destroy, unifiedauthentication_discovery, unifiedauthentication_enroll, unifiedauthentication_getRegisteredList, unifiedauthentication_getVersion
### crosswalk__libwebapis_unipicture.js
exports: UnipictureManager
  UnipictureManager: create(); setScalerType(scalerValue); setGeometry(geometryMode); load(url); loadAsync(url,successCallback,errorCallback); loadFromBuffer(buffer); loadAsyncFromBuffer(buffer,successCallback,errorCallback); show(); useSWDecoder(); close(); destroy(); destroyScaler(scalerValue); getState(); getVersion(); setDisplayRect(x,y,width,height); setCropRect(x,y,width,height); rotate(angle); setSlideShowEffect(effectType); runSlideShow(url,successCallback,errorCallback); closeSlideShow()
  [native] UnipictureManager_Close, UnipictureManager_CloseSlidShow, UnipictureManager_Create, UnipictureManager_Destroy, UnipictureManager_DestroyByScaler, UnipictureManager_GetState, UnipictureManager_GetVersion, UnipictureManager_Load, UnipictureManager_LoadAsync, UnipictureManager_LoadAsyncFromBuffer, UnipictureManager_LoadFromBuffer, UnipictureManager_Rotate, UnipictureManager_SetCropRect, UnipictureManager_SetDisplayRect, UnipictureManager_SetEffectType, UnipictureManager_SetGeometry, UnipictureManager_SetScalerType, UnipictureManager_SetSlideShow, UnipictureManager_Show, UnipictureManager_softDecode
### crosswalk__libwebapis_widgetdata.js
exports: WidgetDataManager
  WidgetDataManager: getVersion(); readWidgetData(password,dataLength,widgetId,successCallback,errorCallback); read(successCallback,errorCallback); writeWidgetData(password,Data,dataLength,widgetId,successCallback,errorCallback); write(Data,successCallback,errorCallback); removeWidgetData(widgetId,successCallback,errorCallback); remove(successCallback,errorCallback)
  [native] WidgetDataManager_read, WidgetDataManager_readWidgetData, WidgetDataManager_remove, WidgetDataManager_removeWidgetData, WidgetDataManager_write, WidgetDataManager_writeWidgetData
### service__libwebapis.js
exports: AttributeFilter, AttributeRangeFilter, CompositeFilter, SimpleCoordinates, SortMode
  AttributeFilter: _filter(element)
  AttributeRangeFilter: _filter(element)
  CompositeFilter: _filter(element)
  [static] exports: AttributeFilter(attrName,matchFlag,matchValue); AttributeRangeFilter(attrName,start,end); CompositeFilter(type,filters); SortMode(attrName,order); SimpleCoordinates(lat,lng)
  [props] this: attributeName, matchFlag, matchValue, initialValue, endValue, type, filters, order, latitude, longitude
### service__libwrtservice_plugin.js
exports: WRTServiceApi
  WRTServiceApi: isRunningApp(appId); getAppIdsByMetadata(key); getCurrentLoginId(); getDeviceName(); getDeviceUUID(); queryProductValue(query); postPlainNotification(title, message, timeout); getCameraInfo(); toString()
```
#### `tizen.*`

```text
### crosswalk__libtizen.js
exports: AttributeFilter, AttributeRangeFilter, Bundle, BundleValueType, CompositeFilter, SimpleCoordinates, SortMode
  Bundle: set(key,value); get(key); typeOf(key); forEach(callback); toJSON(); toString()
  [static] exports: AttributeFilter(attrName,matchFlag,matchValue); AttributeRangeFilter(attrName,start,end); CompositeFilter(type,filters); SortMode(attrName,order); SimpleCoordinates(lat,lng)
  [props] this: attributeName, matchFlag, matchValue, initialValue, endValue, type, filters, order, latitude, longitude
### crosswalk__libtizen_account.js
exports: AccountManager
  Account: setExtendedData(); getExtendedData()
  AccountManager: add(); remove(); update(); getAccount(); getAccounts(); getProvider(); getProviders(); addAccountListener(); removeAccountListener(); _getVersion()
  AccountListeners: addListener(callback); removeListener(accountListenerId)
  [props] this: applicationId, displayName, iconUri, smallIconUri, capabilities, isMultipleAccountSupported, id, userName, provider
  [native] AccountGetExtendedData, AccountGetExtendedDataSync, AccountManagerAdd, AccountManagerAddAccountListener, AccountManagerGetAccount, AccountManagerGetAccounts, AccountManagerGetProvider, AccountManagerGetProviders, AccountManagerRemove, AccountManagerRemoveAccountListener, AccountManagerUpdate, AccountSetExtendedData, GetVersion
### crosswalk__libtizen_alarm.js
exports: AlarmManager
  EditManager: allow(); disallow()
  LogManager: allow(); disallow()
  AlarmManager: add(); remove(); removeAll(); get(); getAll(); _getVersion()
  AlarmRelative: getRemainingSeconds()
  AlarmAbsolute: getNextScheduledDate()
  [props] this: PERIOD_MINUTE, PERIOD_HOUR, PERIOD_DAY, PERIOD_WEEK, id, delay, period, date, daysOfTheWeek, profile
  [native] AlarmManagerAdd, AlarmManagerGet, AlarmManagerGetAll, AlarmManagerGetNextScheduledDate, AlarmManagerGetRemainingSeconds, AlarmManagerRemove, AlarmManagerRemoveAll, GetVersion
### crosswalk__libtizen_application.js
exports: ApplicationManager
  ApplicationManager: getCurrentApplication(); kill(); launch(); launchAppControl(); findAppControl(); getAppsContext(); getAppContext(); getAppsInfo(); getAppInfo(); getAppCerts(); getAppSharedURI(); getAppMetaData(); getBatteryUsageInfo(); getAppsUsageInfo(); addAppInfoEventListener(); removeAppInfoEventListener(); addAppStatusChangeListener(); removeAppStatusChangeListener(); _getVersion()
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(watchId)
  StatusListenerManager: onListenerCalled(msg); addListener(callback,appId); removeListener(watchId)
  Application: exit(); hide(); getRequestedAppControl(); addEventListener(event,callback); removeEventListener(watchId); broadcastEvent(event,data); broadcastTrustedEvent(event,data)
  RequestedApplicationControl: replyResult(); replyFailure()
  [props] this: appInfo, contextId, id, name, iconPath, version, show, categories, installDate, size, packageId, appId, key, value, operation, uri, mime, category, data, launchMode, appControl, callerAppId, type, batteryUsage, totalCount, totalDuration, lastTime
  [native] ApplicationAddEventListener, ApplicationBroadcastEvent, ApplicationBroadcastTrustedEvent, ApplicationGetRequestedAppControl, ApplicationInformationGetSize, ApplicationManagerAddAppInfoEventListener, ApplicationManagerAddStatusListener, ApplicationManagerFindAppControl, ApplicationManagerGetAppCerts, ApplicationManagerGetAppContext, ApplicationManagerGetAppInfo, ApplicationManagerGetAppMetaData, ApplicationManagerGetAppSharedURI, ApplicationManagerGetAppsContext, ApplicationManagerGetAppsInfo, ApplicationManagerGetAppsUsageInfo, ApplicationManagerGetBatteryUsageInfo, ApplicationManagerGetCurrentApplication, ApplicationManagerKill, ApplicationManagerLaunch, ApplicationManagerLaunchAppControl, ApplicationManagerRemoveAppInfoEventListener, ApplicationManagerRemoveStatusListener, ApplicationRemoveEventListener, GetVersion, RequestedApplicationControlReplyFailure, RequestedApplicationControlReplyResult, tizen://exit, tizen://hide
### crosswalk__libtizen_archive.js
exports: ArchiveManager
  ArchiveManager: open(); abort(); _getVersion()
  [static] CommonFS: toRealPath(aPath); isVirtualPath(aPath); isPathSupported(aPath)
  [native] ArchiveFetchStorages, ArchiveFileAdd, ArchiveFileClose, ArchiveFileEntryExtract, ArchiveFileExtractAll, ArchiveFileGetEntries, ArchiveFileGetEntryByName, ArchiveManagerAbort, ArchiveManagerOpen, GetVersion
### crosswalk__libtizen_bluetooth.js
exports: BluetoothManager
  BluetoothClass: hasService()
  BluetoothSocketListeners: addListener(socket); removeListener(id)
  BluetoothSocket: writeData(data); readData(); close()
  BluetoothLEDevice: connect(); disconnect(); getService(); getServiceAllUuids(); isConnected(); addConnectStateChangeListener(); removeConnectStateChangeListener(); getAttMtu(); requestAttMtuChange(); addAttMtuChangeListener(); removeAttMtuChangeListener()
  BluetoothDevice: connectToServiceByUUID()
  BluetoothServiceListeners: addListener(service); removeListener(uuid)
  BluetoothServiceHandler: unregister()
  BluetoothHealthApplicationListeners: addListener(app); removeListener(id)
  BluetoothHealthApplication: unregister()
  BluetoothHealthProfileHandler: registerSinkApplication(); connectToSource()
  BluetoothHealthChannel: close(); sendData(); setListener(); unsetListener()
  BluetoothLEAdapter: startScan(); stopScan(); isScanning(); startAdvertise(); stopAdvertise(); addConnectStateChangeListener(); removeConnectStateChangeListener()
  BluetoothGATTServerService: unregister()
  BluetoothAdapter: setName(); setPowered(); setVisible(); setChangeListener(); unsetChangeListener(); discoverDevices(); stopDiscovery(); getKnownDevices(); getDevice(); createBonding(); destroyBonding(); registerRFCOMMServiceByUUID(); getBluetoothProfileHandler()
  BluetoothGATTServer: registerService(); unregisterAllServices(); start(); stop(); getConnectionMtu()
  BluetoothManager: getDefaultAdapter(); getLEAdapter(); toByteArray(data); toDOMString(data); toUint8Array(data); uuidTo128bit(uuid); uuidToShortestPossible(uuid); uuidsEqual(uuid1,uuid2); getGATTServer(); _getVersion()
  [props] this: MISC, COMPUTER, PHONE, NETWORK, AUDIO_VIDEO, PERIPHERAL, IMAGING, WEARABLE, TOY, HEALTH, UNCATEGORIZED, COMPUTER_UNCATEGORIZED, COMPUTER_DESKTOP, COMPUTER_SERVER, COMPUTER_LAPTOP, COMPUTER_HANDHELD_PC_OR_PDA, COMPUTER_PALM_PC_OR_PDA, COMPUTER_WEARABLE, PHONE_UNCATEGORIZED, PHONE_CELLULAR, PHONE_CORDLESS, PHONE_SMARTPHONE, PHONE_MODEM_OR_GATEWAY, PHONE_ISDN, AV_UNRECOGNIZED, AV_WEARABLE_HEADSET, AV_HANDSFREE, AV_MICROPHONE, AV_LOUDSPEAKER, AV_HEADPHONES, AV_PORTABLE_AUDIO, AV_CAR_AUDIO, AV_SETTOP_BOX, AV_HIFI, AV_VCR, AV_VIDEO_CAMERA, AV_CAMCORDER, AV_MONITOR, AV_DISPLAY_AND_LOUDSPEAKER, AV_VIDEO_CONFERENCING, AV_GAMING_TOY, PERIPHERAL_UNCATEGORIZED, PERIPHERAL_KEYBOARD, PERIPHERAL_POINTING_DEVICE, PERIPHERAL_KEYBOARD_AND_POINTING_DEVICE, PERIPHERAL_JOYSTICK, PERIPHERAL_GAMEPAD, PERIPHERAL_REMOTE_CONTROL, PERIPHERAL_SENSING_DEVICE, PERIPHERAL_DEGITIZER_TABLET, PERIPHERAL_CARD_READER, PERIPHERAL_DIGITAL_PEN, PERIPHERAL_HANDHELD_SCANNER, PERIPHERAL_HANDHELD_INPUT_DEVICE, IMAGING_UNCATEGORIZED, IMAGING_DISPLAY, IMAGING_CAMERA, IMAGING_SCANNER, IMAGING_PRINTER, WEARABLE_WRITST_WATCH, WEARABLE_PAGER, WEARABLE_JACKET, WEARABLE_HELMET, WEARABLE_GLASSES, TOY_ROBOT, TOY_VEHICLE, TOY_DOLL, TOY_CONTROLLER, TOY_GAME, HEALTH_UNDEFINED, HEALTH_BLOOD_PRESSURE_MONITOR, HEALTH_THERMOMETER, HEALTH_WEIGHING_SCALE, HEALTH_GLUCOSE_METER, HEALTH_PULSE_OXIMETER, HEALTH_PULSE_RATE_MONITOR, HEALTH_DATA_DISPLAY, HEALTH_STEP_COUNTER, HEALTH_BODY_COMPOSITION_ANALYZER, HEALTH_PEAK_FLOW_MONITOR, HEALTH_MEDICATION_MONITOR, HEALTH_KNEE_PROSTHESIS, HEALTH_ANKLE_PROSTHESIS, LIMITED_DISCOVERABILITY, POSITIONING, NETWORKING, RENDERING, CAPTURING, OBJECT_TRANSFER, AUDIO, TELEPHONY, INFORMATION, uuid, data, includeName, uuids, solicitationuuids, appearance, includeTxPowerLevel, serviceData, servicesData, manufacturerData, id, major, minor, services, state, peer, onmessage, onclose, _id, address, name, txpowerlevel, rssi, deviceClass, isBonded, isTrusted, isConnected, onconnect, dataType, profileType, channelType, application, serviceUuid, characteristics, isPrimary, descriptors, isBroadcast, hasExtendedProperties, isNotify, isIndication, isReadable, isSignedWrite, isWritable, isWriteNoResponse, readPermission, writePermission, encryptedReadPermission, encryptedWritePermission, encryptedSignedReadPermission, encryptedSignedWritePermission, _readValueRequestCallback, _readValueSendResponseSuccessCallback, _readValueSendResponseErrorCallback, _writeValueRequestCallback, _writeValueSendResponseSuccessCallback, _writeValueSendResponseErrorCallback, statusCode, powered, visible, isRunning, deviceMajor, deviceMinor, deviceService, BASE_UUID
  [props] socket: state
  [props] BluetoothGATTServerService.prototype: constructor
  [props] BluetoothGATTServerCharacteristic.prototype: constructor
  [props] BluetoothGATTServerDescriptor.prototype: constructor
  [native] BLUETOOTH_HEALTH_APPLICATION_CHANGED, BLUETOOTH_SERVICE_ONCONNECT, BLUETOOTH_SOCKET_STATE_CHANGED, BluetoothAdapterChangeCallback, BluetoothAdapterCreateBonding, BluetoothAdapterDestroyBonding, BluetoothAdapterDiscoverDevices, BluetoothAdapterGetAddress, BluetoothAdapterGetBluetoothProfileHandler, BluetoothAdapterGetDevice, BluetoothAdapterGetKnownDevices, BluetoothAdapterGetName, BluetoothAdapterGetPowered, BluetoothAdapterGetVisible, BluetoothAdapterIsServiceConnected, BluetoothAdapterRegisterRFCOMMServiceByUUID, BluetoothAdapterSetChangeListener, BluetoothAdapterSetName, BluetoothAdapterSetPowered, BluetoothAdapterSetVisible, BluetoothAdapterStopDiscovery, BluetoothAdapterUnsetChangeListener, BluetoothDeviceConnectToServiceByUUID, BluetoothDeviceGetBoolValue, BluetoothDiscoverDevicesErrorCallback, BluetoothDiscoverDevicesSuccessCallback, BluetoothGATTClientServiceGetCharacteristics, BluetoothGATTClientServiceGetServices, BluetoothGATTClientServiceReadValue, BluetoothGATTClientServiceWriteValue, BluetoothGATTServerCharacteristicNotifyAboutValueChange, BluetoothGATTServerCharacteristicNotifyCallback_, BluetoothGATTServerGetConnectionMtu, BluetoothGATTServerRegisterService, BluetoothGATTServerSendResponse, BluetoothGATTServerSetReadValueRequestCallback, BluetoothGATTServerSetWriteValueRequestCallback, BluetoothGATTServerStart, BluetoothGATTServerStop, BluetoothGATTServerUnregisterService, BluetoothGattServerBluetoothAdapterStateChangeListener, BluetoothGattServerIsRunningChangeListener, BluetoothHealthApplicationUnregister, BluetoothHealthChannelChangeCallback, BluetoothHealthChannelClose, BluetoothHealthChannelSendData, BluetoothHealthProfileHandlerConnectToSource, BluetoothHealthProfileHandlerRegisterSinkApp, BluetoothLEAdapterIsScanning, BluetoothLEAdapterStartAdvertise, BluetoothLEAdapterStartScan, BluetoothLEAdapterStopAdvertise, BluetoothLEAdapterStopScan, BluetoothLEDeviceConnect, BluetoothLEDeviceDisconnect, BluetoothLEDeviceGetAttMtu, BluetoothLEDeviceGetService, BluetoothLEDeviceGetServiceAllUuids, BluetoothLEDeviceIsConnected, BluetoothLEDeviceRequestAttMtuChange, BluetoothServiceHandlerUnregister, BluetoothSocketClose, BluetoothSocketReadData, BluetoothSocketWriteData, GetVersion
### crosswalk__libtizen_content.js
exports: ContentManager
  EditManager: allow(); disallow()
  _ContentListenersManager: addChangeListener(changeCallback); removeChangeListener(listenerId)
  ContentManager: update(); updateBatch(contents,successCallback,errorCallback); getDirectories(successCallback,errorCallback); find(successCallback,errorCallback,directoryId,filter,sortMode,count,offset); scanFile(contentURI,successCallback,errorCallback); scanDirectory(contentDirURI,recursive,successCallback,errorCallback); cancelScanDirectory(contentDirURI); addChangeListener(); removeChangeListener(); setChangeListener(changeCallback); unsetChangeListener(); getPlaylists(successCallback,errorCallback); createPlaylist(name,successCallback,errorCallback,sourcePlaylist); removePlaylist(id,successCallback,errorCallback); createThumbnail(content,successCallback,errorCallback); _getVersion()
  Playlist: add(item); addBatch(items,successCallback,errorCallback); remove(item); removeBatch(items,successCallback,errorCallback); get(successCallback,errorCallback,count,offset); setOrder(items,successCallback,errorCallback); move(item,delta,successCallback,errorCallback)
  [props] this: id, directoryURI, title, storageType, modifiedDate, editableAttributes, name, type, mimeType, contentURI, thumbnailURIs, releaseDate, size, description, rating, isFavorite, geolocation, album, artists, duration, width, height, timestamps, texts, genres, composers, lyrics, copyright, bitrate, trackNumber, orientation, content, numberOfTracks, thumbnailURI
  [native] ContentManagerAddChangeListener, ContentManagerAudioGetLyrics, ContentManagerCancelScanDirectory, ContentManagerChangeCallback_, ContentManagerCreateThumbnail, ContentManagerCreateplaylist, ContentManagerFind, ContentManagerGetdirectories, ContentManagerGetplaylists, ContentManagerPlaylistAdd, ContentManagerPlaylistAddbatch, ContentManagerPlaylistGet, ContentManagerPlaylistMove, ContentManagerPlaylistRemove, ContentManagerPlaylistRemovebatch, ContentManagerPlaylistSetorder, ContentManagerRemoveChangeListener, ContentManagerRemoveplaylist, ContentManagerScanDirectory, ContentManagerScanfile, ContentManagerSetchangelistener, ContentManagerUnsetchangelistener, ContentManagerUpdate, ContentManagerUpdatebatch, GetVersion, PlaylistGetName, PlaylistGetNumberOfTracks, PlaylistGetThumbnailUri, PlaylistSetName, PlaylistSetThumbnailUri
### crosswalk__libtizen_cordova_file.js
exports: FileManager
  FileManager: truncate(uri,length,successCallback,errorCallback)
  [native] File_truncate
### crosswalk__libtizen_cordova_globalization.js
exports: GlobalizationManager
  GlobalizationManager: dateToString(timestamp,formatLength,selector,successCb,errorCb); stringToDate(dateString,formatLength,selector,successCb,errorCb); getDatePattern(formatLength,selector,successCb,errorCb); getDateNames(type,item,successCb,errorCb); getFirstDayOfWeek(successCb,errorCb); numberToString(number,type,successCb,errorCb); stringToNumber(numberStr,type,successCb,errorCb); getNumberPattern(type,successCb,errorCb); getCurrencyPattern(currencyCode,successCb,errorCb)
  [native] CordovaGlobalization_dateToString, CordovaGlobalization_getCurrencyPattern, CordovaGlobalization_getDateNames, CordovaGlobalization_getDatePattern, CordovaGlobalization_getFirstDayOfWeek, CordovaGlobalization_getNumberPattern, CordovaGlobalization_numberToString, CordovaGlobalization_stringToDate, CordovaGlobalization_stringToNumber
### crosswalk__libtizen_datacontrol.js
exports: DataControlManager
  _DataControlListenerManager: addChangeListener(type,providerId,dataId,changeCallback,errorCallback); removeChangeListener(type,providerId,dataId,listenerId)
  DataControlManager: getDataControlConsumer(providerId,dataId,type); _getVersion()
  DataControlConsumerObject: addChangeListener(); removeChangeListener()
  SQLDataControlConsumer: insert(); update(); remove(); select()
  MappedDataControlConsumer: addValue(); removeValue(); getValue(); updateValue()
  [native] DataControlConsumerObjectAddChangeListener, DataControlConsumerObjectRemoveChangeListener, GetVersion, MappedDataControlConsumerAddValue, MappedDataControlConsumerGetValue, MappedDataControlConsumerRemoveValue, MappedDataControlConsumerUpdateValue, SQLDataControlConsumerInsert, SQLDataControlConsumerRemove, SQLDataControlConsumerSelect, SQLDataControlConsumerUpdate
  [privileges] DATACONTROL_CONSUMER
### crosswalk__libtizen_download.js
exports: DownloadManager
  DownloadManager: start(); cancel(); pause(); abandon(); resume(); getState(); getDownloadRequest(); getMIMEType(); setListener(); getLimitRate(); _getVersion()
  [props] this: url, destination, fileName, networkType, httpHeader, verifyHost, rateKbps
  [native] DownloadManagerAbandon, DownloadManagerCancel, DownloadManagerGetLimitRate, DownloadManagerGetMimeType, DownloadManagerGetState, DownloadManagerPause, DownloadManagerResume, DownloadManagerStart, GetVersion
### crosswalk__libtizen_exif.js
exports: ExifManager
  ExifManager: getExifInfo(); saveExifInfo(); getThumbnail(); _getVersion()
  [props] this: uri, width, height, deviceMaker, deviceModel, originalTime, orientation, fNumber, isoSpeedRatings, exposureTime, exposureProgram, flash, focalLength, whiteBalance, gpsLocation, gpsAltitude, gpsProcessingMethod, gpsTime, userComment
  [native] ExifManagerGetExifInfo, ExifManagerGetThumbnail, ExifManagerSaveExifInfo, GetVersion
### crosswalk__libtizen_filesystem.js
exports: FileSystemManager
  FileStream: close(); read(); readBytes(); readBase64(); write(); writeBytes(); writeBase64()
  File: toURI(); listFiles(); openStream(); readAsText(); copyTo(); moveTo(); createDirectory(); createFile(); resolve(); deleteDirectory(); deleteFile()
  FileHandle: seek(); seekNonBlocking(); readString(); readStringNonBlocking(); writeString(); writeStringNonBlocking(); readBlob(); readBlobNonBlocking(); writeBlob(); writeBlobNonBlocking(); readData(); readDataNonBlocking(); writeData(); writeDataNonBlocking(); flush(); flushNonBlocking(); sync(); syncNonBlocking(); close(); closeNonBlocking()
  FileStreamManager: getNextFileHandleId()
  FileSystemManager: openFile(); createDirectory(); deleteFile(); deleteDirectory(); copyFile(); copyDirectory(); moveFile(); moveDirectory(); rename(); listDirectory(); toURI(); isFile(); isDirectory(); pathExists(); getDirName(); resolve(); getStorage(); listStorages(); addStorageStateChangeListener(); removeStorageStateChangeListener(); _getVersion()
  [props] this: eof, position, bytesAvailable, _mode, _encoding, _file, _closed, _truncate, parent, readOnly, isFile, isDirectory, created, modified, path, name, fullPath, fileSize, length, mode, id, state, label, type, maxNameLength, maxPathLength, setVirtualPath
  [native] FileCopyTo, FileCreateSync, FileHandleClose, FileHandleFlush, FileHandleReadData, FileHandleReadString, FileHandleSeek, FileHandleSync, FileHandleWriteData, FileHandleWriteString, FileReadBytes, FileReadDir, FileReadString, FileRemoveDirectory, FileRename, FileStat, FileStatSync, FileSystemManagerAddStorageStateChangeListener, FileSystemManagerCopyDirectory, FileSystemManagerCopyFile, FileSystemManagerCreateDirectory, FileSystemManagerDeleteDirectory, FileSystemManagerDeleteFile, FileSystemManagerFetchStorages, FileSystemManagerGetCanonicalPath, FileSystemManagerGetLimits, FileSystemManagerIsDirectory, FileSystemManagerIsFile, FileSystemManagerListDirectory, FileSystemManagerMakeDirectorySync, FileSystemManagerMoveDirectory, FileSystemManagerMoveFile, FileSystemManagerOpenFile, FileSystemManagerPathExists, FileSystemManagerRemoveStorageStateChangeListener, FileSystemManagerRename, FileUnlinkFile, FileWriteBase64, FileWriteBytes, FileWriteString, FilesystemFetchVirtualRoots, GetVersion, StorageStateChangeListener
  [privileges] FILESYSTEM_READ
### crosswalk__libtizen_iotcon.js
exports: Iotcon
  InternalData: update(dst); decorate(dst)
  Resource: notify(); addResourceTypes(); addResourceInterface(); addChildResource(); removeChildResource(); setRequestListener(); unsetRequestListener()
  Response: send()
  RemoteResource: methodGet(); methodPut(); methodPost(); methodDelete(); startObserving(); stopObserving(); startCaching(); stopCaching(); setResourceStateChangeListener(); unsetResourceStateChangeListener()
  Client: findResource(); addPresenceEventListener(); removePresenceEventListener(); findDeviceInfo(); findPlatformInfo()
  Server: createResource(); removeResource(); getResources(); startPresence(); stopPresence()
  Iotcon: initialize(); getClient(); getServer(); getTimeout(); setTimeout(); addGeneratedPinListener(); removeGeneratedPinListener(); _getVersion()
  [props] this: id, data, uriPath, resourceTypes, resourceInterfaces, attributes, children, observerIds, request, result, representation, options, key, state, cachedRepresentation, timeInterval, deviceName
  [native] IotconAddGeneratedPinListener, IotconClientAddPresenceEventListener, IotconClientFindDeviceInfo, IotconClientFindPlatformInfo, IotconClientFindResource, IotconClientRemovePresenceEventListener, IotconGetTimeout, IotconGetVersion, IotconInitialize, IotconRemoteResourceGetCachedRepresentation, IotconRemoteResourceGetOptions, IotconRemoteResourceGetTimeInterval, IotconRemoteResourceMethodDelete, IotconRemoteResourceMethodGet, IotconRemoteResourceMethodPost, IotconRemoteResourceMethodPut, IotconRemoteResourceSetOptions, IotconRemoteResourceSetResourceStateChangeListener, IotconRemoteResourceSetTimeInterval, IotconRemoteResourceStartCaching, IotconRemoteResourceStartObserving, IotconRemoteResourceStopCaching, IotconRemoteResourceStopObserving, IotconRemoteResourceUnsetResourceStateChangeListener, IotconRemoveGeneratedPinListener, IotconResourceAddChildResource, IotconResourceAddResourceInterface, IotconResourceAddResourceTypes, IotconResourceGetObserverIds, IotconResourceNotify, IotconResourceRemoveChildResource, IotconResourceSetRequestListener, IotconResourceUnsetRequestListener, IotconResponseSend, IotconServerCreateResource, IotconServerRemoveResource, IotconServerStartPresence, IotconServerStopPresence, IotconSetDeviceName, IotconSetTimeout
### crosswalk__libtizen_keymanager.js
exports: KeyManager
  KeyManager: saveData(); removeData(); getData(); getDataAliasList(); setPermission(); _getVersion()
  [native] GetVersion, KeyManagerGetData, KeyManagerGetDataAliasList, KeyManagerRemoveAlias, KeyManagerSaveData, KeyManagerSetPermissions
### crosswalk__libtizen_mediacontroller.js
exports: RequestReply, SearchFilter, MediaControllerManager
  ListenerManager: addListener(callback); addServerInfoListener(callback,name); removeListener(watchId); removeServerInfoListener(watchId)
  EditManager: allow(); disallow()
  MediaControllerManager: getClient(); createServer(); _getVersion()
  MediaControllerMetadata: save()
  MediaControllerSubtitles: addChangeRequestListener(); removeChangeRequestListener()
  MediaControllerMode360: addChangeRequestListener(); removeChangeRequestListener()
  MediaControllerDisplayMode: addChangeRequestListener(); removeChangeRequestListener()
  MediaControllerDisplayRotation: addChangeRequestListener(); removeChangeRequestListener()
  MediaControllerServer: updatePlaybackState(state); updateIconURI(iconURI); updatePlaybackPosition(); updatePlaybackAgeRating(rating); updatePlaybackContentType(contentType); updateShuffleMode(mode); updateRepeatMode(); updateRepeatState(state); updateMetadata(); addChangeRequestPlaybackInfoListener(); removeChangeRequestPlaybackInfoListener(watchId); addCommandListener(); removeCommandListener(); createPlaylist(name); savePlaylist(); deletePlaylist(); updatePlaybackItem(playlistName,index); getAllPlaylists(); setSearchRequestListener(); unsetSearchRequestListener(); getAllClientsInfo()
  MediaControllerClientInfo: sendEvent()
  MediaControllerClient: setCustomEventListener(); unsetCustomEventListener(); findServers(); getLatestServerInfo(); addAbilityChangeListener(); removeAbilityChangeListener(); findSubscribedServers()
  MediaControllerServerInfo: sendPlaybackState(); sendPlaybackPosition(); sendShuffleMode(); sendRepeatMode(); sendRepeatState(); sendCommand(); sendSearchRequest(); addServerStatusChangeListener(); removeServerStatusChangeListener(); addPlaybackInfoChangeListener(listener); removePlaybackInfoChangeListener(watchId); getAllPlaylists(); sendPlaybackItem(); addPlaylistUpdatedListener(); removePlaylistUpdatedListener(watchId)
  MediaControllerPlaylist: addItem(); getItems()
  MediaControllerServerPlaybackInfo: updatePlaybackItem(playlistName,index); addChangeRequestListener(); removeChangeRequestListener(watchId)
  MediaControllerPlaylists: createPlaylist(); savePlaylist(); deletePlaylist(); getAllPlaylists(); getPlaylist()
  [props] this: title, artist, album, author, genre, duration, date, copyright, description, trackNum, picture, seasonNumber, seasonTitle, episodeNumber, episodeTitle, resolutionWidth, resolutionHeight, state, position, ageRating, shuffleMode, repeatMode, repeatState, contentType, metadata, index, playlistName, playback, displayMode, displayRotation, playbackPosition, shuffle, repeat, playlist, clientCustom, search, subtitles, mode360, play, pause, stop, next, prev, forward, rewind, togglePlayPause, letterBox, originSize, fullScreen, croppedFull, rotationNone, rotation90, rotation180, rotation270, enabled, type, playbackInfo, iconURI, playlists, abilities, name, category, keyword, extraData, _serverName
  [native] GetVersion, MediaControllerAbilitiesInfoSubscribe, MediaControllerAbilitiesInfoUnsubscribe, MediaControllerClientAddAbilityChangeListener, MediaControllerClientFindServers, MediaControllerClientFindSubscribedServers, MediaControllerClientGetDisplayModeAbility, MediaControllerClientGetDisplayRotationAbility, MediaControllerClientGetLatestServerInfo, MediaControllerClientGetPlaybackAbility, MediaControllerClientGetPlaybackInfo, MediaControllerClientGetSimpleAbility, MediaControllerClientInfoSendEvent, MediaControllerClientRemoveAbilityChangeListener, MediaControllerClientSendEventReply, MediaControllerClientSetCustomEventListener, MediaControllerClientUnsetCustomEventListener, MediaControllerDisplayModeAddChangeRequestListener, MediaControllerDisplayModeInfoAddModeChangeListener, MediaControllerDisplayModeInfoGetType, MediaControllerDisplayModeInfoRemoveModeChangeListener, MediaControllerDisplayModeInfoSendType, MediaControllerDisplayModeRemoveChangeRequestListener, MediaControllerDisplayModeUpdateType, MediaControllerDisplayRotationAddChangeRequestListener, MediaControllerDisplayRotationInfoAddChangeListener, MediaControllerDisplayRotationInfoGet, MediaControllerDisplayRotationInfoRemoveChangeListener, MediaControllerDisplayRotationInfoSend, MediaControllerDisplayRotationRemoveChangeRequestListener, MediaControllerDisplayRotationUpdate, MediaControllerManagerCreateServer, MediaControllerManagerGetClient, MediaControllerMode360AddChangeRequestListener, MediaControllerMode360InfoAddModeChangeListener, MediaControllerMode360InfoGetEnabled, MediaControllerMode360InfoRemoveModeChangeListener, MediaControllerMode360InfoSendRequest, MediaControllerMode360RemoveChangeRequestListener, MediaControllerMode360UpdateEnabled, MediaControllerPlaylistAddItem, MediaControllerPlaylistGetItems, MediaControllerPlaylistsGetPlaylist, MediaControllerPlaylistsInfoGetPlaylist, MediaControllerPlaylistsInfoSendPlaybackItem, MediaControllerServerAddChangeRequestPlaybackInfoListener, MediaControllerServerAddCommandListener, MediaControllerServerAddSearchRequestListener, MediaControllerServerCreatePlaylist, MediaControllerServerDeletePlaylist, MediaControllerServerGetAllClientsInfo, MediaControllerServerGetAllPlaylists, MediaControllerServerInfoAddPlaybackInfoChangeListener, MediaControllerServerInfoAddPlaylistUpdatedListener, MediaControllerServerInfoAddServerStatusChangeListener, MediaControllerServerInfoGetAllPlaylists, MediaControllerServerInfoGetIconURI, MediaControllerServerInfoRemovePlaybackInfoChangeListener, MediaControllerServerInfoRemovePlaylistUpdatedListener, MediaControllerServerInfoRemoveServerStatusChangeListener, MediaControllerServerInfoSendCommand, MediaControllerServerInfoSendPlaybackItem, MediaControllerServerInfoSendPlaybackPosition, MediaControllerServerInfoSendPlaybackState, MediaControllerServerInfoSendRepeatMode, MediaControllerServerInfoSendRepeatState, MediaControllerServerInfoSendSearchRequest, MediaControllerServerInfoSendShuffleMode, MediaControllerServerRemoveChangeRequestPlaybackInfoListener, MediaControllerServerRemoveCommandListener, MediaControllerServerRemoveSearchRequestListener, MediaControllerServerReplyCommand, MediaControllerServerSavePlaybackAbilities, MediaControllerServerSavePlaylist, MediaControllerServerSetDisplayModeAbility, MediaControllerServerSetDisplayRotationAbility, MediaControllerServerSetSimpleAbility, MediaControllerServerUpdateIconURI, MediaControllerServerUpdateMetadata, MediaControllerServerUpdatePlaybackAgeRating, MediaControllerServerUpdatePlaybackContentType, MediaControllerServerUpdatePlaybackItem, MediaControllerServerUpdatePlaybackPosition, MediaControllerServerUpdatePlaybackState, MediaControllerServerUpdateRepeatMode, MediaControllerServerUpdateRepeatState, MediaControllerServerUpdateShuffleMode, MediaControllerSubtitlesAddChangeRequestListener, MediaControllerSubtitlesInfoAddModeChangeListener, MediaControllerSubtitlesInfoGetEnabled, MediaControllerSubtitlesInfoRemoveModeChangeListener, MediaControllerSubtitlesInfoSendRequest, MediaControllerSubtitlesRemoveChangeRequestListener, MediaControllerSubtitlesUpdateEnabled, SearchRequestListener, _MediaControllerClientEventsListener
### crosswalk__libtizen_mediakey.js
exports: 
  MediaKeyManager: setMediaKeyEventListener(callback); unsetMediaKeyEventListener(); _getVersion()
  [native] GetVersion, SetMediaKeyEventListener, UnsetMediaKeyEventListener
### crosswalk__libtizen_messageport.js
exports: MessagePortManager
  MessagePortManager: requestLocalMessagePort(localMessagePortName); requestTrustedLocalMessagePort(localMessagePortName); requestRemoteMessagePort(appId,remoteMessagePortName); requestTrustedRemoteMessagePort(appId,remoteMessagePortName); _getVersion()
  LocalMessagePort: addMessagePortListener(listener); removeMessagePortListener(watchId)
  RemoteMessagePort: sendMessage()
  [props] this: messagePortName, isTrusted, _id, appId
  [native] GetVersion, MessagePortManagerRequestLocalMessagePort, MessagePortManagerRequestRemoteMessagePort, MessagePortManagerRequestTrustedLocalMessagePort, MessagePortManagerRequestTrustedRemoteMessagePort, RemoteMessagePortSendMessage
### crosswalk__libtizen_metadata.js
exports: MetadataManager
  MetadataManager: createFileHandle(); _getVersion()
  MetadataFileHandle: get(); release(); getArtwork(); getThumbnailFrame(); getFrameAtTime(); getSyncLyrics()
  [props] this: _id, uri, timestamp, lyrics
  [native] GetVersion, MetadataFileHandleGet, MetadataFileHandleGetArtwork, MetadataFileHandleGetFrameAtTime, MetadataFileHandleGetSyncLyrics, MetadataFileHandleGetThumbnailFrame, MetadataFileHandleRelease, MetadataManagerCreateFileHandle
### crosswalk__libtizen_ml.js
exports: TensorsInfo, MachineLearningManager
  TensorsData: getTensorRawData(); setTensorRawData(); dispose()
  TensorsInfo: addTensorInfo(); clone(); equals(); getDimensions(); setDimensions(); getTensorName(); setTensorName(); getTensorType(); setTensorType(); getTensorSize(); getTensorsData(); dispose()
  MachineLearningSingle: openModel(); openModelAsync()
  SingleShot: invoke(); invokeAsync(); getValue(); setValue(); setTimeout(); close()
  Pipeline: start(); stop(); dispose(); getNodeInfo(); getSource(); getSwitch(); getValve(); registerSinkListener(); unregisterSinkListener()
  NodeInfo: getProperty(); setProperty()
  Source: inputData()
  Switch: getPadList(); select()
  Valve: setOpen()
  MachineLearningPipeline: registerCustomFilter(); unregisterCustomFilter()
  Layer: setProperty(); dispose()
  Optimizer: setProperty(); dispose()
  Dataset: setProperty(); dispose()
  Model: compile(); run(); summarize(); _checkMetrics(trainLoss,validLoss,validAccuracy); saveToFile(); load(); addLayer(); setDataset(); setOptimizer(); dispose()
  MachineLearningTrainer: createLayer(); createFileDataset(); createOptimizer(); createModel()
  MachineLearningManager: checkNNFWAvailability(); _getVersion()
  [props] this: data, size, shape, count, tensorsInfo, _id, _tensorsInfo, _disposable, input, output, state, name, _pipeline_id, inputTensorsInfo, type, isOpen, single, pipeline, trainer
  [native] GetVersion, MLCheckNNFWAvailability, MLPipelineDispose, MLPipelineGetInputTensorsInfo, MLPipelineGetNodeInfo, MLPipelineGetSource, MLPipelineGetState, MLPipelineGetSwitch, MLPipelineGetValve, MLPipelineManagerCreatePipeline, MLPipelineManagerCustomFilterOutput, MLPipelineManagerRegisterCustomFilter, MLPipelineManagerUnregisterCustomFilter, MLPipelineNodeInfoGetProperty, MLPipelineNodeInfoSetProperty, MLPipelineRegisterSinkListener, MLPipelineSourceInputData, MLPipelineStart, MLPipelineStop, MLPipelineSwitchGetPadList, MLPipelineSwitchSelect, MLPipelineUnregisterSinkListener, MLPipelineValveIsOpen, MLPipelineValveSetOpen, MLSingleManagerOpenModel, MLSingleShotClose, MLSingleShotGetTensorsInfo, MLSingleShotGetValue, MLSingleShotInvoke, MLSingleShotSetInputInfo, MLSingleShotSetTimeout, MLSingleShotSetValue, MLTensorsDataDispose, MLTensorsDataGetTensorType, MLTensorsInfoAddTensorInfo, MLTensorsInfoClone, MLTensorsInfoCountGetter, MLTensorsInfoCreate, MLTensorsInfoDispose, MLTensorsInfoEquals, MLTensorsInfoGetDimensions, MLTensorsInfoGetTensorName, MLTensorsInfoGetTensorSize, MLTensorsInfoGetTensorType, MLTensorsInfoGetTensorsData, MLTensorsInfoSetDimensions, MLTensorsInfoSetTensorName, MLTensorsInfoSetTensorType, MLTrainerDatasetCreateFromFile, MLTrainerDatasetDispose, MLTrainerDatasetSetProperty, MLTrainerLayerCreate, MLTrainerLayerDispose, MLTrainerLayerGetName, MLTrainerLayerSetProperty, MLTrainerModelAddLayer, MLTrainerModelCheckMetrics, MLTrainerModelCompile, MLTrainerModelCreate, MLTrainerModelDispose, MLTrainerModelLoad, MLTrainerModelRun, MLTrainerModelSave, MLTrainerModelSetDataset, MLTrainerModelSetOptimizer, MLTrainerModelSummarize, MLTrainerOptimizerCreate, MLTrainerOptimizerDispose, MLTrainerOptimizerSetProperty
### crosswalk__libtizen_package.js
exports: PackageManager
  PackageManager: install(packageFileURI,progressCallback); uninstall(id,progressCallback); getPackagesInfo(successCallback,errorCallback); getPackageInfo(); setPackageInfoEventListener(eventCallback); unsetPackageInfoEventListener(); _getVersion()
  [props] this: totalSize, dataSize
  [native] GetVersion, PackageManagerGetDataSize, PackageManagerGetPackageInfo, PackageManagerGetPackagesInfo, PackageManagerGetTotalSize, PackageManagerInstall, PackageManagerSetPackageInfoEventListener, PackageManagerUninstall, PackageManagerUnsetPackageInfoEventListener
### crosswalk__libtizen_push.js
exports: PushManager
  PushManager: registerService(); register(); unregisterService(); unregister(); connectService(notificationCallback); connect(notificationCallback); disconnectService(); disconnect(); getRegistrationId(); getUnreadNotifications(); getPushMessage(); _getVersion()
  [native] GetVersion, PushConnect, PushConnectService, PushDisconnect, PushDisconnectService, PushGetPushMessage, PushGetRegistrationId, PushGetUnreadNotifications, PushRegisterApplication, PushRegisterService, PushUnregisterApplication, PushUnregisterService
### crosswalk__libtizen_systeminfo.js
exports: SystemInfo
  SystemInfoCameraFlash: setBrightness(brightness)
  SystemInfo: getCapabilities(); getCapability(); getPropertyValue(); getPropertyValueArray(); removePropertyValueChangeListener(); getTotalMemory(); getAvailableMemory(); getDeviceUptime(); getCount(); _getVersion()
  [props] this: bluetooth, nfc, nfcReservedPush, multiTouchCount, inputKeyboard, inputKeyboardLayout, wifi, wifiDirect, opengles, openglestextureFormat, openglesVersion1_1, openglesVersion2_0, fmRadio, platformVersion, webApiVersion, nativeApiVersion, platformName, camera, cameraFront, cameraFrontFlash, cameraBack, cameraBackFlash, location, locationGps, locationWps, microphone, usbHost, usbAccessory, screenOutputRca, screenOutputHdmi, platformCoreCpuArch, platformCoreFpuArch, sipVoip, duid, speechRecognition, speechSynthesis, accelerometer, accelerometerWakeup, barometer, barometerWakeup, gyroscope, gyroscopeWakeup, magnetometer, magnetometerWakeup, photometer, photometerWakeup, proximity, proximityWakeup, tiltmeter, tiltmeterWakeup, dataEncryption, graphicsAcceleration, push, telephony, telephonyMms, telephonySms, screenSizeNormal, screenSize480_800, screenSize720_1280, autoRotation, shellAppWidget, visionImageRecognition, visionQrcodeGeneration, visionQrcodeRecognition, visionFaceRecognition, secureElement, nativeOspCompatible, profile, level, isCharging, timeToDischarge, timeToFullCharge, load, type, capacity, availableCapacity, isRemovable, isRemoveable, units, resolutionWidth, resolutionHeight, dotsPerInchWidth, dotsPerInchHeight, physicalWidth, physicalHeight, brightness, panelWidth, panelHeight, status, isAutoRotation, model, manufacturer, buildVersion, language, country, networkType, ssid, ipAddress, ipv6Address, macAddress, signalStrength, securityMode, encryptionType, ipMode, subnetMask, gateway, dns, cable, apn, mcc, mnc, cellId, lac, isRoaming, isFlightMode, imei, state, operatorName, msisdn, iccid, msin, spn, isVideoOutputOn, number, signal, editName, connected, disconnected, levels, id, serviceCountry
  [native] GetVersion, SystemInfoAddPropertyValueChangeListener, SystemInfoGetAvailableMemory, SystemInfoGetBrightness, SystemInfoGetCapabilities, SystemInfoGetCapability, SystemInfoGetCount, SystemInfoGetDeviceUptime, SystemInfoGetMaxBrightness, SystemInfoGetTotalMemory, SystemInfoRemovePropertyValueChangeListener, SystemInfoSetBrightness, SysteminfoCommonListenerLabel, tizen://api/systeminfo/getDisplayResolution
### crosswalk__libtizen_time.js
exports: _getVersion, getAvailableTimezones, getCurrentDateTime, getDateFormat, getLocalTimezone, getTimeFormat, isLeapYear, setDateTimeChangeListener, setTimezoneChangeListener, unsetDateTimeChangeListener, unsetTimezoneChangeListener
  TZDate: getDate(); setDate(); getDay(); getFullYear(); setFullYear(); getHours(); setHours(); getMilliseconds(); setMilliseconds(); getMinutes(); setMinutes(); getMonth(); setMonth(); getSeconds(); setSeconds(); getUTCDate(); setUTCDate(); getUTCDay(); getUTCFullYear(); setUTCFullYear(); getUTCHours(); setUTCHours(); getUTCMilliseconds(); setUTCMilliseconds(); getUTCMinutes(); setUTCMinutes(); getUTCMonth(); setUTCMonth(); getUTCSeconds(); setUTCSeconds(); getTimezone(); toTimezone(); toLocalTimezone(); toUTC(); difference(); equalsTo(); earlierThan(); laterThan(); addDuration(); toLocaleDateString(); toLocaleTimeString(); toLocaleString(); toDateString(); toTimeString(); toString(); getTimezoneAbbreviation(); secondsFromUTC(); isDST(); getPreviousDSTTransition(); getNextDSTTransition()
  TimeDuration: difference(); equalsTo(); lessThan(); greaterThan()
  [static] exports: getCurrentDateTime(); getLocalTimezone(); getAvailableTimezones(); getDateFormat(); getTimeFormat(); isLeapYear(); setDateTimeChangeListener(); unsetDateTimeChangeListener(); setTimezoneChangeListener(); unsetTimezoneChangeListener(); _getVersion()
  [props] this: ts, tzId, o, length, unit
  [props] obj: _utcTimestamp, _shiftedTimestamp, _timezoneName, _timezoneOffset
  [native] DateTimeChangeListener, GetVersion, TZDateGetLocalTimezone, TZDateGetNextDSTTransition, TZDateGetPreviousDSTTransition, TZDateGetTimezoneAbbreviation, TZDateGetTimezoneOffset, TZDateIsDST, TZDateToDateString, TZDateToLocaleDateString, TZDateToLocaleString, TZDateToLocaleTimeString, TZDateToString, TZDateToTimeString, TimeUtilGetAvailableTimezones, TimeUtilGetDateFormat, TimeUtilGetTimeFormat, TimeUtilSetDateTimeChangeListener, TimeUtilSetTimezoneChangeListener, TimeUtilUnsetDateTimeChangeListener, TimeUtilUnsetTimezoneChangeListener, TimezoneChangeListener
### crosswalk__libtizen_tvaudio.js
exports: AudioControlManager
  AudioControlManager: setMute(mute); isMute(); setVolume(volume); setVolumeUp(); setVolumeDown(); getVolume(); setVolumeChangeListener(listener); unsetVolumeChangeListener(); getOutputMode(); playSound(beep); _getVersion()
  [native] AudioControlManager_getOutputMode, AudioControlManager_getVolume, AudioControlManager_isMute, AudioControlManager_playSound, AudioControlManager_setMute, AudioControlManager_setVolume, AudioControlManager_setVolumeChangeListener, AudioControlManager_setVolumeDown, AudioControlManager_setVolumeUp, AudioControlManager_unsetVolumeChangeListener, GetVersion
### crosswalk__libtizen_tvchannel.js
exports: TVChannelManager
  FavoriteList: addChannel(channel,successCallback,errorCallback); removeChannel(channel,successCallback,errorCallback); getChannels(successCallback,errorCallback,nStart,number)
  ListenerManager: onListenerCalled(msg); addListener(callback); removeListener(watchId)
  TVChannelManager: tune(tuneOption,successCallback,errorCallback,windowType); tuneUp(callback,errorCallback,tuneMode,windowType); tuneDown(successCallback,errorCallback,tuneMode,windowType); findChannel(major,minor,successCallback,errorCallback); getChannelList(successCallback,errorCallback,tuneMode,start,number); getCurrentChannel(windowType); getProgramList(channelInfo,startTime,successCallback,errorCallback,duration); getCurrentProgram(windowType); addChannelChangeListener(callback,windowType); removeChannelChangeListener(listenerId); addSignalStateChangeListener(callback); removeSignalStateChangeListener(listenerId); addProgramChangeListener(successCallback,windowType); removeProgramChangeListener(listenerId); getNumOfAvailableTuner(); getFavorites(); getBroadcastStandard(type); _getVersion()
  [props] this: id
  [native] GetVersion, TVChannelManager_GetBroadcastStandard, TVChannelManager_GetChannelListFavorite, TVChannelManager_GetFavorites, TVChannelManager_UpdateFavorites, TVChannelManager_findChannel, TVChannelManager_getChannelList, TVChannelManager_getCurrentChannel, TVChannelManager_getCurrentProgram, TVChannelManager_getNumOfAvailableTuner, TVChannelManager_getProgramList, TVChannelManager_tune
  [privileges] TV_CHANNEL
### crosswalk__libtizen_tvdisplay.js
exports: TVDisplay
  TVDisplay: is3DModeEnabled(); get3DEffectMode(); getSupported3DEffectModeList(successCallback,errorCallback); _getVersion()
  [native] GetVersion, TVDisplay_get3DEffectMode, TVDisplay_getSupported3DEffectModeList, TVDisplay_is3DModeEnabled
### crosswalk__libtizen_tvinfo.js
exports: TVInfoManager
  TVInfoManager: getCaptionValue(key); addCaptionValueChangeListener(key,callback); removeCaptionValueChangeListener(listenerId); _getVersion()
  ListenerManager: onListenerCalled(msg); addListener(callback,watchId); removeListener(watchId)
  [native] GetVersion, TVInfoManager_AddCaptionValueChangeListener, TVInfoManager_GetCaptionValue, TVInfoManager_RemoveCaptionValueChangeListener
### crosswalk__libtizen_tvinputdevice.js
exports: TVInputDeviceManager
  TVInputDeviceManager: getSupportedKeys(); getKey(keyName); registerKey(keyName); unregisterKey(keyName); registerKeyBatch(); unregisterKeyBatch(); _getVersion()
  [native] GetVersion, tizen://api/inputdevice/registerKey, tizen://api/inputdevice/registerKeyBatch, tizen://api/inputdevice/unregisterKey, tizen://api/inputdevice/unregisterKeyBatch
  [privileges] TV_INPUT_DEVICE
### crosswalk__libtizen_tvwindow.js
exports: TVWindowManager
  ListenerManager: onListenerCalled(data); addListener(callback); removeListener(watchId)
  TVWindowManager: getAvailableWindows(successCallback,errorCallback); setSource(videosource,successCallback,errorCallback,type); getSource(type); show(successCallback,errorCallback,rectangle,type,zPosition); rotateSource(); hide(successCallback,errorCallback,type); getRect(successCallback,errorCallback,unit,type); getVideoResolution(type); addVideoResolutionChangeListener(callback,type); removeVideoResolutionChangeListener(listenerId); _getVersion()
  [props] this: width, height, frequency, aspectRatio, pictureSizeType
  [native] GetVersion, TVWindow_GetSource, TVWindow_GetVideoResolution, TVWindow_IsSourceActive, TVWindow_SetSource, tizen://api/systeminfo/getDisplayResolution, tizen://tvwindow/hide, tizen://tvwindow/reposition, tizen://tvwindow/rotateSource, tizen://tvwindow/show
  [privileges] TV_WINDOW
### crosswalk__libtizen_utils.js
exports: JSON, utils
  CommonListenerManager: onListenerCalled(msg); addListener(callback); removeListener(watchId)
  DateConverter: toTZDate(v,isAllDay); fromTZDate(v)
  Utils: deprecationWarn(msg,deprecationVersion); assert(); repackFilter(filter); getPkgApiVersion(); checkPrivilegeAccess(privilege); fillArrayWithValue(array,length,value); versionCompare(lhs,rhs); isAppVersionEarlierThan(ver); checkPrivilegeAccess4Ver(new_ver,new_priv,old_priv); checkBackwardCompabilityPrivilegeAccess(current_privilege,previous_privilege); checkProfile(); printDeprecationWarningFor(name,replacement); ArrayToString(data); StringToArray(str,type)
  Type: isBoolean(obj); isObject(obj); isArray(obj); isOctet(value); isByteStream(value); isByteStreamArray(value); isLegacyByteStream(value); isLegacyByteStreamArray(value); isFunction(obj); isNumber(obj); isString(obj); isStringArray(value); isDate(obj); isNull(obj); isNullOrUndefined(obj); isUndefined(obj); isA(obj,type); isEmptyObject(obj); hasProperty(obj,prop); arrayContains(arr,value); getValues(obj)
  Converter: toBoolean(val,nullable); toLong(val,nullable); toLongLong(val,nullable); toUnsignedLong(val,nullable); toUnsignedLongLong(val,nullable); toShort(val,nullable); toUnsignedShort(val,nullable); toByte(val,nullable); toOctet(val,nullable); toDouble(val,nullable); toString(val,nullable); toPlatformObject(val,types,nullable); toFunction(val,nullable); toArray(val,nullable); toDictionary(val,nullable); toEnum(val,e,nullable)
  Validator: validateArgs(a,d); validateArgsStrict(a,d,undefinedCompatibilityMode); isConstructorCall(obj,instance); validateConstructorCall(obj,instance)
  NativeManager: call(cmd,args,callback); callSync(cmd,args); callSyncWithBinaryAnswer(cmd,args); callSyncBinaryWithJSONAnswer(uint8array_data); sendRuntimeMessage(msg,body); sendRuntimeAsyncMessage(msg,body,callback); sendRuntimeSyncMessage(msg,body); addListener(name,callback); removeListener(name); isListenerSet(name); isSuccess(result); isFailure(result); getResultObject(result); getErrorObject(result); getErrorObjectAndValidate(result,valid_error_names,default_error); callIfPossible(callback); callIfPossibleAndReturn(callback)
  WebAPIException: toString()
  ArrayBufferParser: getJSON(); getData(ArrayType)
  [props] this: privilege, nextReplyId, extension, code, name, message
  [props] obj: _previouslyConstructed
  [native] UtilsCheckBackwardCompabilityPrivilegeAccess, UtilsCheckPrivilegeAccess, UtilsCheckProfile, UtilsGetPkgApiVersion, UtilsSetWorkerScope, UtilsToLongLong, UtilsToUnsignedLongLong
### crosswalk__libtizen_voicecontrol.js
exports: VoiceControlClientManager
  ListenerManager: addListener(callback,nativeCall,data); removeListener(watchId,nativeCall); removeAllListeners()
  VoiceControlClientManager: getVoiceControlClient(); _getVersion()
  VoiceControlClient: getCurrentLanguage(); setCommandList(list,type); unsetCommandList(type); addResultListener(listener); removeResultListener(id); addLanguageChangeListener(listener); removeLanguageChangeListener(id); release()
  [props] this: command, type
  [native] GetVersion, VoiceControlClientGetCurrentLanguage, VoiceControlClientManagerGetVoiceControlClient, VoiceControlClientRelease, VoiceControlClientSetCommandList, VoiceControlClientUnsetCommandList
### crosswalk__libtizen_websetting.js
exports: removeAllCookies, setUserAgentString
  [static] exports: setUserAgentString(); removeAllCookies()
  [native] tizen://changeUA, tizen://deleteAllCookies
### crosswalk__libwidget_plugin.js
exports: 
  Widget: toString(); setQuarterPosition(section); move(left, top); resize(width, height); getDownloadedWebapis(); getPackageId(); getApplicationId(); setSuspendDelay(timeout); enableFocus(); setFocus(enable); setWindowStackMode(mode); setTransparent(transparent); getGlobalResourceId(); getScreenOrientation(); setScreenOrientation(orientation); setFlipMode(flipEnable)
  [props] this: author, description, name, shortName, version, id, authorEmail, authorHref, height, width, preferences
### crosswalk__libsplash_screen_plugin.js
exports:
```

## 3. Remote-control keys

### 3.1 `tizen.tvinputdevice` (OBSERVED: JS embedded in `/usr/lib64/tizen-extensions-crosswalk/libtizen_tvinputdevice.so`)

Interface: `getSupportedKeys() -> InputDeviceKey[]`, `getKey(keyName) -> InputDeviceKey|null`, `registerKey(keyName)`, `unregisterKey(keyName)`, `registerKeyBatch(keyNames, successCallback?, errorCallback?)`, `unregisterKeyBatch(keyNames, successCallback?, errorCallback?)`. `InputDeviceKey = { name, code }` (read-only). Privilege checked: `http://tizen.org/privilege/tv.inputdevice`.

**Mandatory keys** - always delivered, never need `registerKey`. `getKey()` returns them, they are *not* in `getSupportedKeys()`, and `registerKey()`/`unregisterKey()` on them throws `InvalidValuesError`:

| API name | Platform (Ecore/XF86) name | `keyCode` |
|---|---|---|
| `ArrowLeft` | `Left` | 37 |
| `ArrowUp` | `Up` | 38 |
| `ArrowRight` | `Right` | 39 |
| `ArrowDown` | `Down` | 40 |
| `Enter` | `Return` | 13 |
| `Back` | `XF86Back` | 10009 |

**Registerable keys** (`getSupportedKeys()` order as in the image):

| API name | Platform name | `keyCode` | API name | Platform name | `keyCode` |
|---|---|---|---|---|---|
| `VolumeUp` | `XF86AudioRaiseVolume` | 447 | `MediaStop` | `XF86AudioStop` | 413 |
| `VolumeDown` | `XF86AudioLowerVolume` | 448 | `MediaPlayPause` | `XF86PlayBack` | 10252 |
| `VolumeMute` | `XF86AudioMute` | 449 | `MediaTrackPrevious` | `XF86PreviousChapter` | 10232 |
| `ChannelUp` | `XF86RaiseChannel` | 427 | `MediaTrackNext` | `XF86NextChapter` | 10233 |
| `ChannelDown` | `XF86LowerChannel` | 428 | `Source` | `XF86Display` | 10072 |
| `ColorF0Red` | `XF86Red` | 403 | `PictureSize` | `XF86PictureSize` | 10140 |
| `ColorF1Green` | `XF86Green` | 404 | `PreviousChannel` | `XF86PreviousChannel` | 10190 |
| `ColorF2Yellow` | `XF86Yellow` | 405 | `ChannelList` | `XF86ChannelList` | 10073 |
| `ColorF3Blue` | `XF86Blue` | 406 | `E-Manual` | `XF86EManual` | 10146 |
| `Menu` | `XF86SysMenu` | 10133 | `MTS` | `XF86MTS` | 10195 |
| `Tools` | `XF86SimpleMenu` | 10135 | `3D` | `XF863D` | 10199 |
| `Info` | `XF86Info` | 457 | `Soccer` | `XF86SoccerMode` | 10228 |
| `Exit` | `XF86Exit` | 10182 | `Caption` | `XF86Caption` | 10221 |
| `Search` | `XF86Search` | 10225 | `Teletext` | `XF86TTXMIX` | 10200 |
| `Guide` | `XF86ChannelGuide` | 458 | `Extra` | `XF86ExtraApp` | 10253 |
| `MediaRewind` | `XF86AudioRewind` | 412 | `0`..`9` | `0`..`9` | 48..57 |
| `MediaPause` | `XF86AudioPause` | 19 | `Minus` | `minus` | 189 |
| `MediaFastForward` | `XF86AudioNext` | 417 | | | |
| `MediaRecord` | `XF86AudioRecord` | 416 | | | |
| `MediaPlay` | `XF86AudioPlay` | 415 | | | |

Behaviour (OBSERVED in the JS):
- `registerKey(name)`: unknown name -> `InvalidValuesError`; otherwise a **synchronous** runtime message `tizen://api/inputdevice/registerKey` carrying the *platform* name; a reply of `"error"` -> `UnknownError`. `unregisterKey` mirrors it.
- Batch variants take an array, validate every name first, send `registerKeyBatch` with the comma-joined platform names, and call back asynchronously.
- **INFERRED** emulator rule: before `registerKey`, the page receives only the six mandatory keys (plus plain keyboard keys when a keyboard is attached); every other remote key produces no `keydown` until registered. Registration is per app and is dropped on app exit.

### 3.2 Native key pipeline

- **OBSERVED** Wayland keycode -> key name: `/usr/share/X11/xkb/tizen_key_layout.txt.tv` (446 lines `Name <linux keycode> [keyboard|no_priv]`; `XF86Back 1`, `XF86Home 63`, `XF86PowerOff 116`, `XF86Exit 174`, `XF86AudioPlayPause 520 no_priv`). The 4th column of the table in 3.3 is this code (xkb code = value + 8).
- **OBSERVED** key name -> web `keyCode`: a 449-entry map built by an initializer inside libchromium-impl.so (EFL event handler area), reproduced in 3.3.
- **OBSERVED** `KeyboardEvent.key`: Chromium's DOM key table in this build contains the XF86 names, so remote keys report e.g. `key === "XF86Back"`, `"XF86AudioPlay"`, `"XF86Red"`; arrows/Enter report the standard `ArrowLeft`.../`Enter`. **INFERRED** `event.code` is empty for remote-only keys.
- **OBSERVED** key grabbing: WRT `input_device_manager.cc` ("Initialize keyrouter") uses the `tizen_keyrouter` Wayland protocol / `ecore_wl2_window_keygrab_set`; `registerKey` = grab that key for the app window. Policy files: `/usr/apps/keyrouter-tv/{key_config,linux_key_config,function_key,exhibition_key,number_key,multipress_key_config,mass_test_key}.txt`. Metadata keys `http://samsung.com/tv/metadata/keyrouter.long.press` and `.../use.keyboardfunckey` alter delivery.
- **OBSERVED** test injection inside the guest: `/usr/bin/input_keyevent` sends D-Bus `org.enlightenment.wm.Test.EventKey` with `uint32:1` (down) / `uint32:0` (up) and `string:<key name>`.

**Back (10009)**: delivered to the page as an ordinary `keydown`/`keyup` with `keyCode 10009`, `key "XF86Back"`; no default action - the app must call `tizen.application.getCurrentApplication().exit()` or `history.back()` itself (OBSERVED: it is in the mandatory map; INFERRED: no default exit, consistent with Samsung docs and with WRT only special-casing it on its own error page, whose script installs a `window.onkeydown` keyCode handler). WRT also has `OnHWBackKey`/`OnHWMoreKey` (`WRTNativeWindow`) which dispatch a `tizenhwkey` `CustomEvent` with `keyName` `"back"`/`"menu"`; this is gated by `tizen:setting hwkey-event` and is the mobile/wearable path (OBSERVED names; INFERRED that TV apps normally see only the keydown).

**Exit (10182)**: a registerable key in the API table, but the platform handles `XF86Exit` itself when the app has not registered it: the app is terminated/hidden and the user returns to the launcher (INFERRED from Samsung behaviour; OBSERVED only that libchromium-impl.so compares the incoming key name against `XF86Back` and `XF86Exit` in one WRT handler). After `registerKey("Exit")` the page receives keyCode 10182.

### 3.3 Full platform key name -> `keyCode` table (OBSERVED, 449 entries)

Columns: platform key name (what the compositor delivers and what `event.key` shows for non-standard keys), web `keyCode`, linux keycode from `tizen_key_layout.txt.tv` when the name is listed there, flag from that file.

| Platform key name | keyCode | linux keycode | flag |
|---|---|---|---|
| `BackSpace` | 8 |  |  |
| `ISO_Left_Tab` | 9 |  |  |
| `Tab` | 9 |  |  |
| `Return` | 13 | 28 | keyboard |
| `Select` | 13 |  |  |
| `Shift_L` | 16 |  |  |
| `Shift_R` | 16 |  |  |
| `Control_L` | 17 |  |  |
| `Control_R` | 17 |  |  |
| `Alt_L` | 18 |  |  |
| `Alt_R` | 18 |  |  |
| `Meta_L` | 18 |  |  |
| `Meta_R` | 18 |  |  |
| `Pause` | 19 |  |  |
| `XF86AudioPause` | 19 | 201 | no_priv |
| `Caps_Lock` | 20 |  |  |
| `Hangul` | 21 |  |  |
| `Kana_Lock` | 21 |  |  |
| `Kana_Shift` | 21 |  |  |
| `Hangul_Hanja` | 25 |  |  |
| `Kanji` | 25 |  |  |
| `Escape` | 27 |  |  |
| `Henkan` | 28 |  |  |
| `Muhenkan` | 29 |  |  |
| `space` | 32 |  |  |
| `KP_Prior` | 33 |  |  |
| `Prior` | 33 |  |  |
| `KP_Next` | 34 |  |  |
| `Next` | 34 |  |  |
| `End` | 35 |  |  |
| `KP_End` | 35 |  |  |
| `Home` | 36 |  |  |
| `KP_Home` | 36 |  |  |
| `KP_Left` | 37 |  |  |
| `Left` | 37 | 105 | keyboard repeat |
| `KP_Up` | 38 |  |  |
| `Up` | 38 | 103 | keyboard repeat |
| `KP_Right` | 39 |  |  |
| `Right` | 39 | 106 | keyboard repeat |
| `Down` | 40 | 108 | keyboard repeat |
| `KP_Down` | 40 |  |  |
| `Print` | 42 |  |  |
| `Execute` | 43 |  |  |
| `Insert` | 45 |  |  |
| `KP_Insert` | 45 |  |  |
| `Delete` | 46 |  |  |
| `)` | 48 |  |  |
| `0` | 48 | 11 | keyboard |
| `parenright` | 48 |  |  |
| `!` | 49 |  |  |
| `1` | 49 | 2 | keyboard |
| `exclam` | 49 |  |  |
| `2` | 50 | 3 | keyboard |
| `@` | 50 |  |  |
| `at` | 50 |  |  |
| `#` | 51 |  |  |
| `3` | 51 | 4 | keyboard |
| `numbersign` | 51 |  |  |
| `$` | 52 |  |  |
| `4` | 52 | 5 | keyboard |
| `dollar` | 52 |  |  |
| `%` | 53 |  |  |
| `5` | 53 | 6 | keyboard |
| `percent` | 53 |  |  |
| `6` | 54 | 7 | keyboard |
| `^` | 54 |  |  |
| `asciicircum` | 54 |  |  |
| `&` | 55 |  |  |
| `7` | 55 | 8 | keyboard |
| `ampersand` | 55 |  |  |
| `*` | 56 |  |  |
| `8` | 56 | 9 | keyboard |
| `asterisk` | 56 |  |  |
| `(` | 57 |  |  |
| `9` | 57 | 10 | keyboard |
| `parenleft` | 57 |  |  |
| `A` | 65 |  |  |
| `a` | 65 |  |  |
| `B` | 66 |  |  |
| `b` | 66 |  |  |
| `C` | 67 |  |  |
| `c` | 67 |  |  |
| `D` | 68 |  |  |
| `d` | 68 |  |  |
| `E` | 69 |  |  |
| `e` | 69 |  |  |
| `F` | 70 |  |  |
| `f` | 70 |  |  |
| `G` | 71 |  |  |
| `g` | 71 |  |  |
| `H` | 72 |  |  |
| `h` | 72 |  |  |
| `I` | 73 |  |  |
| `i` | 73 |  |  |
| `J` | 74 |  |  |
| `j` | 74 |  |  |
| `K` | 75 |  |  |
| `k` | 75 |  |  |
| `L` | 76 |  |  |
| `l` | 76 |  |  |
| `M` | 77 |  |  |
| `m` | 77 |  |  |
| `N` | 78 |  |  |
| `n` | 78 |  |  |
| `O` | 79 |  |  |
| `o` | 79 |  |  |
| `P` | 80 |  |  |
| `p` | 80 |  |  |
| `Q` | 81 |  |  |
| `q` | 81 |  |  |
| `R` | 82 |  |  |
| `r` | 82 |  |  |
| `S` | 83 |  |  |
| `s` | 83 |  |  |
| `T` | 84 |  |  |
| `t` | 84 |  |  |
| `U` | 85 |  |  |
| `u` | 85 |  |  |
| `V` | 86 |  |  |
| `v` | 86 |  |  |
| `W` | 87 |  |  |
| `w` | 87 |  |  |
| `X` | 88 |  |  |
| `x` | 88 |  |  |
| `Y` | 89 |  |  |
| `y` | 89 |  |  |
| `z` | 90 |  |  |
| `Super_L` | 91 |  |  |
| `Super_R` | 92 |  |  |
| `Menu` | 93 |  |  |
| `KP_0` | 96 |  |  |
| `KP_1` | 97 |  |  |
| `KP_2` | 98 |  |  |
| `KP_3` | 99 |  |  |
| `KP_4` | 100 |  |  |
| `KP_5` | 101 |  |  |
| `KP_6` | 102 |  |  |
| `KP_7` | 103 |  |  |
| `KP_8` | 104 |  |  |
| `KP_9` | 105 |  |  |
| `KP_Multiply` | 106 |  |  |
| `KP_Add` | 107 |  |  |
| `KP_Separator` | 108 |  |  |
| `KP_Subtract` | 109 |  |  |
| `KP_Decimal` | 110 |  |  |
| `KP_Divide` | 111 |  |  |
| `F1` | 112 |  |  |
| `KP_F1` | 112 |  |  |
| `F2` | 113 |  |  |
| `KP_F2` | 113 |  |  |
| `F3` | 114 |  |  |
| `KP_F3` | 114 |  |  |
| `F4` | 115 |  |  |
| `KP_F4` | 115 |  |  |
| `F5` | 116 |  |  |
| `F6` | 117 |  |  |
| `F7` | 118 |  |  |
| `F8` | 119 |  |  |
| `F9` | 120 |  |  |
| `F10` | 121 |  |  |
| `F11` | 122 |  |  |
| `F12` | 123 |  |  |
| `F13` | 124 |  |  |
| `F14` | 125 |  |  |
| `F15` | 126 |  |  |
| `F16` | 127 |  |  |
| `F17` | 128 |  |  |
| `F18` | 129 |  |  |
| `F19` | 130 |  |  |
| `F20` | 131 |  |  |
| `F21` | 132 |  |  |
| `F22` | 133 |  |  |
| `F23` | 134 |  |  |
| `F24` | 135 |  |  |
| `Num_Lock` | 144 |  |  |
| `Scroll_Lock` | 145 |  |  |
| `XF86WLAN` | 151 |  |  |
| `XF86Forward` | 167 |  |  |
| `XF86Reload` | 168 |  |  |
| `XF86Stop` | 169 | 393 |  |
| `XF86Favorites` | 171 |  |  |
| `XF86HomePage` | 172 | 172 |  |
| `XF86Mail` | 180 |  |  |
| `XF86LaunchA` | 182 |  |  |
| `XF86Calculator` | 183 |  |  |
| `XF86LaunchB` | 183 |  |  |
| `:` | 186 |  |  |
| `;` | 186 |  |  |
| `colon` | 186 |  |  |
| `semicolon` | 186 |  |  |
| `+` | 187 |  |  |
| `=` | 187 |  |  |
| `equal` | 187 |  |  |
| `plus` | 187 |  |  |
| `,` | 188 |  |  |
| `<` | 188 |  |  |
| `comma` | 188 |  |  |
| `less` | 188 |  |  |
| `-` | 189 |  |  |
| `_` | 189 |  |  |
| `minus` | 189 | 12 | keyboard |
| `underscore` | 189 |  |  |
| `.` | 190 |  |  |
| `>` | 190 |  |  |
| `greater` | 190 |  |  |
| `period` | 190 |  |  |
| `/` | 191 |  |  |
| `?` | 191 |  |  |
| `question` | 191 |  |  |
| `slash` | 191 |  |  |
| ``` | 192 |  |  |
| `asciitilde` | 192 |  |  |
| `grave` | 192 |  |  |
| `quoteleft` | 192 |  |  |
| `~` | 192 |  |  |
| `XF86MonBrightnessDown` | 216 |  |  |
| `XF86MonBrightnessUp` | 217 |  |  |
| `XF86KbdBrightnessDown` | 218 |  |  |
| `[` | 219 |  |  |
| `braceleft` | 219 |  |  |
| `bracketleft` | 219 |  |  |
| `{` | 219 |  |  |
| `\` | 220 |  |  |
| `backslash` | 220 |  |  |
| `bar` | 220 |  |  |
| `\|` | 220 |  |  |
| `]` | 221 |  |  |
| `braceright` | 221 |  |  |
| `bracketright` | 221 |  |  |
| `}` | 221 |  |  |
| `"` | 222 |  |  |
| `'` | 222 |  |  |
| `apostrophe` | 222 |  |  |
| `quotedbl` | 222 |  |  |
| `quoteright` | 222 |  |  |
| `ISO_Level5_Shift` | 223 |  |  |
| `ISO_Level3_Shift` | 225 |  |  |
| `Mode_switch` | 225 |  |  |
| `Ugrave` | 226 |  |  |
| `brokenbar` | 226 |  |  |
| `degree` | 226 |  |  |
| `guillemotleft` | 226 |  |  |
| `guillemotright` | 226 |  |  |
| `ugrave` | 226 |  |  |
| `Multi_key` | 230 |  |  |
| `XF86KbdBrightnessUp` | 232 |  |  |
| `Zenkaku_Hankaku` | 244 |  |  |
| `XF86Red` | 403 | 59 |  |
| `XF86Green` | 404 | 60 |  |
| `XF86Yellow` | 405 | 61 |  |
| `XF86Blue` | 406 | 62 |  |
| `XF86Grey` | 407 |  |  |
| `XF86Brown` | 408 |  |  |
| `XF86AudioRewind` | 412 | 168 | no_priv |
| `XF86AudioStop` | 413 | 166 | no_priv |
| `XF86AudioPlay` | 415 | 200 | no_priv |
| `XF86AudioRecord` | 416 | 167 |  |
| `XF86AudioNext` | 417 | 208 | no_priv |
| `XF86RaiseChannel` | 427 | 88 | repeat |
| `XF86LowerChannel` | 428 | 87 | repeat |
| `XF86ChannelAddDel` | 429 | 148 |  |
| `XF86FavoriteChannel` | 433 | 183 |  |
| `XF86ChannelAutoTune` | 441 | 162 |  |
| `XF86DualView` | 443 | 202 |  |
| `XF86AudioRaiseVolume` | 447 | 68 | repeat |
| `XF86AudioLowerVolume` | 448 | 67 | repeat |
| `XF86AudioMute` | 449 | 66 |  |
| `XF86Info` | 457 | 188 |  |
| `XF86ChannelGuide` | 458 | 130 |  |
| `XF86Subtitle` | 460 | 207 |  |
| `XF86Back` | 10009 | 1 |  |
| `XF86Home` | 10071 | 63 |  |
| `XF86Display` | 10072 | 64 |  |
| `XF86ChannelList` | 10073 | 65 |  |
| `XF86VoiceGuide` | 10093 | 85 |  |
| `XF86CCDivision` | 10097 | 89 |  |
| `XF86SignLanguageZoom` | 10103 | 95 |  |
| `XF86SignLanguageZoomPlus` | 10121 | 113 |  |
| `XF86SignLanguageZoomMinus` | 10122 | 114 |  |
| `XF86CCPreset` | 10123 | 115 |  |
| `XF86CCPosition` | 10132 | 124 |  |
| `XF86SysMenu` | 10133 | 125 |  |
| `XF86SimpleMenu` | 10135 | 127 |  |
| `XF86CCSize` | 10136 | 128 |  |
| `XF86MBRRepeat` | 10137 | 129 |  |
| `XF86PictureSize` | 10140 | 132 |  |
| `XF86PictureMode` | 10141 | 133 |  |
| `XF86Hdmi` | 10143 | 135 |  |
| `XF86UsbHub` | 10144 | 136 |  |
| `XF86EManual` | 10146 | 138 |  |
| `XF86LFDScreenLock` | 10147 | 139 |  |
| `XF86More` | 10148 | 140 |  |
| `XF86FactoryMode` | 10149 | 141 |  |
| `XF86TV` | 10153 | 145 |  |
| `XF86DTV` | 10154 | 146 |  |
| `XF86PanelDown` | 10157 | 149 |  |
| `XF86WWW` | 10158 | 150 |  |
| `XF86BTColorMecha` | 10159 | 151 |  |
| `XF86StillPicture` | 10160 | 152 |  |
| `XF86BTPairing` | 10161 | 153 |  |
| `XF86BTHotkey` | 10162 | 154 |  |
| `XF86BTDevice` | 10163 | 233 |  |
| `XF86BTContentsBar` | 10164 | 156 |  |
| `XF86Game` | 10165 | 157 |  |
| `XF86LFDUnset` | 10166 | 158 |  |
| `XF86PIPChannelUp` | 10167 | 159 |  |
| `XF86PIPChannelDown` | 10168 | 160 |  |
| `XF86Antena` | 10169 | 161 |  |
| `XF86PanelEnter` | 10171 | 163 |  |
| `XF86MBRLink` | 10172 | 164 |  |
| `XF86PanelUp` | 10173 | 165 |  |
| `XF86Game3D` | 10177 | 169 |  |
| `XF86WheelLeftKey` | 10178 | 170 |  |
| `XF86WheelRightKey` | 10179 | 171 |  |
| `XF86PanelExit` | 10181 | 173 |  |
| `XF86Exit` | 10182 | 174 |  |
| `XF86MBRTV` | 10183 | 175 |  |
| `XF86MBRSTBGuide` | 10184 | 176 |  |
| `XF86MBRBDPopup` | 10185 | 177 |  |
| `XF86MBRBDDVDPower` | 10186 | 178 |  |
| `XF86MBRSetupFailure` | 10187 | 179 |  |
| `XF86MBRSetup` | 10188 | 180 |  |
| `XF86MBRWatchTV` | 10189 | 181 |  |
| `XF86PreviousChannel` | 10190 | 182 |  |
| `XF86Recommend` | 10192 | 184 |  |
| `XF86NumberPad` | 10193 | 185 |  |
| `XF86AspectRatio169` | 10194 | 186 |  |
| `XF86MTS` | 10195 | 187 |  |
| `XF86SoundMode` | 10197 | 189 |  |
| `XF863XSpeed` | 10198 | 190 |  |
| `XF863D` | 10199 | 191 |  |
| `XF86TTXMIX` | 10200 | 192 |  |
| `XF86SRSSXT` | 10201 | 193 |  |
| `XF86WIFIPairing` | 10202 | 194 |  |
| `XF86BTApps` | 10211 | 203 |  |
| `XF86EnergySaving` | 10213 | 205 |  |
| `XF86MBRClear` | 10214 | 206 |  |
| `XF86TVSNS` | 10217 | 209 |  |
| `XF86DVR` | 10218 | 210 |  |
| `XF86Apps` | 10219 | 211 |  |
| `XF86Camera` | 10220 | 212 |  |
| `XF86Caption` | 10221 | 213 |  |
| `XF86ZoomIn` | 10222 | 214 |  |
| `XF86PanelPlus` | 10223 | 215 |  |
| `XF86BTVoice` | 10224 | 216 |  |
| `XF86Search` | 10225 | 217 |  |
| `XF86PanelMinus` | 10227 | 219 |  |
| `XF86SoccerMode` | 10228 | 220 |  |
| `XF86Amazon` | 10229 | 221 |  |
| `XF86AudioDescription` | 10230 | 222 |  |
| `XF86PreviousChapter` | 10232 | 224 |  |
| `XF86NextChapter` | 10233 | 225 |  |
| `XF86Netflix` | 10234 | 226 |  |
| `XF86PIP` | 10235 | 227 |  |
| `XF86MBRWatchMovie` | 10236 | 228 |  |
| `XF86MBRMenu` | 10237 | 229 |  |
| `XF86MBRConfirm` | 10238 | 230 |  |
| `XF86FamilyHub` | 10239 | 231 |  |
| `XF86HDMICEC` | 10240 | 232 |  |
| `XF86SoftWakeup` | 10244 | 236 |  |
| `XF86LFDSet` | 10245 | 237 |  |
| `XF86LeftPage` | 10249 | 241 |  |
| `XF86RightPage` | 10250 | 242 |  |
| `XF86VGBackground` | 10251 | 243 |  |
| `XF86PlayBack` | 10252 | 244 |  |
| `XF86ExtraApp` | 10253 | 245 |  |
| `XF86CurrentTime` | 10254 | 246 |  |
| `XF86VoiceGender` | 10255 | 247 |  |
| `XF86VoicePitch` | 10256 | 248 |  |
| `XF86VoiceSpeed` | 10362 | 354 |  |
| `XF86UserGuideAccessibility` | 10363 | 355 |  |
| `XF86AccessibilityShortcut` | 10364 | 356 |  |
| `XF86Color` | 10385 | 377 |  |
| `XF86CCColor` | 10395 | 387 |  |
| `XF86Alarm` | 10418 | 410 |  |
| `XF86SrdChSelect` | 10452 | 444 |  |
| `XF86BatteryAlarm` | 10486 | 478 |  |
| `XF86STBPower` | 10487 | 479 |  |
| `XF86QuickAccess` | 10488 | 480 |  |
| `XF86HotelSolution` | 10489 | 481 |  |
| `XF86Focus` | 10490 | 482 |  |
| `XF86HotelMovies` | 10494 | 486 |  |
| `XF86HotelLanguage` | 10495 | 487 |  |
| `XF86HotelTVGuide` | 10496 | 488 |  |
| `XF86HotelAppsGuest` | 10497 | 489 |  |
| `XF86MultiView` | 10505 | 497 |  |
| `XF86LaunchApp1` | 10507 | 499 |  |
| `XF86LaunchApp2` | 10508 | 500 |  |
| `XF86KeyZee5` | 10509 | 501 |  |
| `XF86KeyGlobo` | 10510 | 502 |  |
| `XF86RussiaCP1` | 10511 | 503 |  |
| `XF86RussiaCP2` | 10512 | 504 |  |
| `XF86RussiaCP3` | 10513 | 505 |  |
| `XF86NoiseReduction` | 10519 | 511 |  |
| `Help` | 10520 |  |  |
| `XF86Help` | 10520 | 512 |  |
| `XF86NR` | 10521 | 513 |  |
| `XF86HotelRoomControl` | 10522 | 514 |  |
| `XF86BTPairingGuide` | 10523 | 515 |  |
| `XF86InTileBShow` | 10524 | 516 |  |
| `XF86InTileBHide` | 10525 | 517 |  |
| `XF86AudioPrev` | 10526 | 518 | no_priv |
| `XF86AudioForward` | 10527 | 519 | no_priv |
| `XF86AudioPlayPause` | 10528 | 520 | no_priv |
| `XF86AudioMedia` | 10529 | 521 | no_priv |
| `XF86Ambient` | 10530 | 522 |  |
| `XF86KeyAmbientLong` | 10535 | 527 |  |
| `XF86KeyYouTube` | 10537 | 529 |  |
| `XF86KeyBtFarVoice` | 10538 | 530 |  |
| `XF86KeyAgingMode` | 10540 | 532 |  |
| `XF86KeyLuxTrigger` | 10543 | 535 |  |
| `Xf86MyContent` | 10545 | 537 |  |
| `XF86KeyAiSpeakerTrigger` | 10546 | 538 |  |
| `XF86KeyAboutThisTVQRcode` | 10548 | 540 |  |
| `XF86KeyTVPlus` | 10568 | 560 |  |
| `XF86KeyRotatePanel` | 10569 | 561 |  |
| `XF86KeyAod` | 10570 | 562 |  |
| `XF86PlayBackGame` | 10571 | 563 |  |
| `XF86GamepadHomekey` | 10572 | 564 |  |
| `XF86KeyHighContrast` | 10584 | 576 |  |
| `XF86KeyEnlarge` | 10585 | 577 |  |
| `XF86KeyGrayScale` | 10586 | 578 |  |
| `XF86KeyColorInversion` | 10587 | 579 |  |
| `XF86KeyLearnRemote` | 10588 | 580 |  |
| `XF86KeyLearnMenu` | 10589 | 581 |  |
| `XF86KeyRepeatDelay` | 10590 | 582 |  |
| `XF86VietnamCP` | 10591 | 583 |  |
| `XF86MenaCP` | 10592 | 584 |  |
| `XF86KeyARKVolume` | 10593 | 585 |  |
| `XF86AndroidMenu` | 10595 | 587 |  |
| `XF86KeyGraphicZoom` | 10600 | 592 |  |
| `XF86VisualImpaired` | 10601 | 593 |  |
| `XF86KeyUniversalSwitch` | 10602 | 594 |  |
| `XF86VoiceGuidePlayPause` | 10603 | 595 |  |
| `XF86KeyVoiceGuideRepeat` | 10604 | 596 |  |
| `XF86KeySweetTV` | 10605 | 597 |  |
| `XF86CCOnOff` | 10616 | 608 |  |
| `XF86KeyAutoCC` | 10617 | 609 |  |
| `XF86KeyAvatarSignLanguage` | 10618 | 610 |  |
| `XF86KeySpokenCC` | 10619 | 611 |  |
| `XF86KeyPictureOff` | 10620 | 612 |  |
| `XF86KeySelectableVoiceGuide` | 10621 | 613 |  |
| `XF86Tving` | 10632 | 624 |  |
| `XF86Hotstar` | 10633 | 625 |  |
| `XF86Disney` | 10634 | 626 |  |
| `XF86Kinopoisk` | 10635 | 627 |  |
| `XF86KeyVtvgo` | 10667 | 659 |  |
| `XF86KeyFptPlay` | 10668 | 660 |  |
| `XF86KeyAIMenu` | 10669 | 661 |  |

Rows: 449. Names without a linux keycode come from keyboards / other layouts.

## 6. Device identity defaults

### 6.1 Static files (OBSERVED)

| Item | Value | Source |
|---|---|---|
| Model name | `Emulator` | `/etc/config/model-config.xml` `tizen.org/system/model_name` |
| Product info | `Model=E-EMULAKUC`, `Version=E-EMULAKUC-0000.00`, `BuildType=debug` | `/etc/prd_info.ini` (read by `/prd/usr/lib64/libsystem-info-external-plugin.so`, which serves `tizen.org/system/model_code`, `serial_number`, `custom/sw_version`...) |
| Firmware marker | file named `E-EMUL64WWC-0807.90` | `p2:/etc/systemd/` |
| Tizen ID | 28-char base64 value | `p2:/etc/tizenid` |
| Platform | name `Tizen`, version `10.0`, version name `Poppy`, processor `SDP1404`, native/web API version `3.0`, profile `tv` | model-config.xml |
| Screen | 1920 x 1080, bpp 32, dpi 72; rewritten at boot from kernel cmdline `video=` / `dpi=` by `/etc/emulator/prerun.d/set-model-config.sh` | model-config.xml + script |
| CPU | `x86_64` | model-config.xml |
| Capabilities | `input.keyboard=false`, `network.wifi=false`, `bluetooth=false`, `telephony=false`; `tv.audio`, `tv.display`, `tv.inputdevice`, `tv.information` = true | model-config.xml |

### 6.2 Settings database defaults (OBSERVED `/etc/buxton2/system.db`, vconf keys)

| Key | Default |
|---|---|
| `db/menu_widget/language` | `en_US.UTF-8` |
| `db/menu_widget/regionformat` | `en_US.UTF-8` |
| `db/setting/languages` | `en_US:en_GB:en` |
| `db/setting/timezone_id` | `Asia/Seoul` |
| `db/setting/device_name` | `Tizen` |
| `db/comss/duid` | empty string |
| `db/comss/hwduid` | empty string |
| `db/comss/modelid` | empty string |
| `db/comss/countrycode` | empty string |
| `db/comss/infolinkversion` | `NULL` (literal 4-char string) |
| `db/adagent/psid` | 32 x `9` |
| `db/adagent/ad_id` (TIFA) | all-zero UUID |
| `db/sdk/can_launch` | `tv-samsung-public_-_tv-samsung-partner` |
| `db/sdk/develop/ip` | `0.0.0.0` |

### 6.3 What the web APIs read (OBSERVED identifiers in `libwebapis_productinfo.so`)

- `getDuid()` <- vconf `db/comss/duid`; `getModelCode()` <- `db/comss/modelid`; `getBaseModelCode()` <- `db/comss/base_modelid`; `getSmartTVServerVersion()`/`getFirmware()` family <- `db/comss/infolink*`; country <- `db/comss/countrycode`, `db/system/pnp_country`; feature booleans <- system-info `com.samsung/featureconf/*`. The library also contains the literal `T-GFPAKUL` (INFERRED: fallback firmware/model prefix).
- **INFERRED** on a freshly booted emulator the DUID/model id vconf keys are populated at first boot by a Samsung daemon (the static defaults are empty), so the real emulator's `getDuid()` value cannot be read from the image. The emulator-mac project should generate a stable fake DUID (12 upper-case base32-like characters, as on TVs) and report model `Emulator` / model code derived from `E-EMULAKUC`; mark both configurable.
- Language/country seen by the page: `navigator.language` follows `db/menu_widget/language` -> `en-US` (INFERRED mapping; default OBSERVED).

### 6.4 Full `model-config.xml` (OBSERVED, 241 keys)

| Key | Type | Value |
|---|---|---|
| `tizen.org/system/model_name` | string | `Emulator` |
| `tizen.org/system/platform.name` | string | `Tizen` |
| `tizen.org/feature/platform.version` | string | `10.0` |
| `tizen.org/feature/platform.version.name` | string | `Poppy` |
| `tizen.org/system/platform.processor` | string | `SDP1404` |
| `tizen.org/system/platform.communication_processor` | string | `none` |
| `tizen.org/feature/archive` | bool | `true` |
| `tizen.org/feature/badge` | bool | `false` |
| `tizen.org/feature/bookmark` | bool | `false` |
| `tizen.org/feature/calendar` | bool | `true` |
| `tizen.org/feature/camera` | bool | `false` |
| `tizen.org/feature/camera.back` | bool | `false` |
| `tizen.org/feature/camera.back.flash` | bool | `false` |
| `tizen.org/feature/camera.front` | bool | `false` |
| `tizen.org/feature/camera.front.flash` | bool | `false` |
| `tizen.org/feature/contact` | bool | `false` |
| `tizen.org/feature/container` | bool | `false` |
| `tizen.org/feature/database.encryption` | bool | `false` |
| `tizen.org/feature/datacontrol` | bool | `true` |
| `tizen.org/feature/datasync` | bool | `false` |
| `tizen.org/feature/download` | bool | `true` |
| `tizen.org/feature/email` | bool | `false` |
| `tizen.org/feature/exif` | bool | `true` |
| `tizen.org/feature/fmradio` | bool | `false` |
| `tizen.org/feature/graphics.acceleration` | bool | `true` |
| `tizen.org/feature/humanactivitymonitor` | bool | `false` |
| `tizen.org/feature/input.keyboard` | bool | `false` |
| `tizen.org/feature/input.keyboard.layout` | string | `none` |
| `tizen.org/feature/input.rotating_bezel` | bool | `false` |
| `tizen.org/feature/location` | bool | `false` |
| `tizen.org/feature/location.gps` | bool | `false` |
| `tizen.org/feature/location.wps` | bool | `false` |
| `tizen.org/feature/location.batch` | bool | `false` |
| `tizen.org/feature/location.companion` | bool | `false` |
| `tizen.org/feature/location.geofence` | bool | `false` |
| `tizen.org/feature/microphone` | bool | `true` |
| `tizen.org/feature/multi_point_touch.pinch_zoom` | bool | `false` |
| `tizen.org/feature/multi_point_touch.point_count` | int | `0` |
| `tizen.org/feature/multimedia.transcoder` | bool | `false` |
| `tizen.org/feature/multimedia.player.stream_info` | bool | `false` |
| `tizen.org/feature/multimedia.player.spherical_video` | bool | `false` |
| `tizen.org/feature/multimedia.media_codec` | bool | `false` |
| `tizen.org/feature/network.bluetooth` | bool | `false` |
| `tizen.org/capability/network.bluetooth.always_on` | bool | `false` |
| `tizen.org/feature/network.bluetooth.audio.media` | bool | `false` |
| `tizen.org/feature/network.bluetooth.health` | bool | `false` |
| `tizen.org/feature/network.bluetooth.hid` | bool | `false` |
| `tizen.org/feature/network.bluetooth.le` | bool | `false` |
| `tizen.org/feature/network.bluetooth.le.5_0` | bool | `false` |
| `tizen.org/feature/network.bluetooth.opp` | bool | `false` |
| `tizen.org/feature/network.nfc` | bool | `false` |
| `tizen.org/feature/network.nfc.card_emulation` | bool | `false` |
| `tizen.org/feature/network.nfc.reserved_push` | bool | `false` |
| `tizen.org/feature/network.push` | bool | `true` |
| `tizen.org/feature/network.secure_element` | bool | `false` |
| `tizen.org/feature/network.secure_element.ese` | bool | `false` |
| `tizen.org/feature/network.secure_element.uicc` | bool | `false` |
| `tizen.org/feature/network.telephony` | bool | `false` |
| `tizen.org/feature/network.telephony.sms.cbs` | bool | `false` |
| `tizen.org/feature/network.telephony.sms` | bool | `false` |
| `tizen.org/feature/network.telephony.mms` | bool | `false` |
| `tizen.org/feature/network.telephony.service.cdma` | bool | `false` |
| `tizen.org/feature/network.telephony.service.edge` | bool | `false` |
| `tizen.org/feature/network.telephony.service.gprs` | bool | `false` |
| `tizen.org/feature/network.telephony.service.gsm` | bool | `false` |
| `tizen.org/feature/network.telephony.service.hsdpa` | bool | `false` |
| `tizen.org/feature/network.telephony.service.hspa` | bool | `false` |
| `tizen.org/feature/network.telephony.service.hsupa` | bool | `false` |
| `tizen.org/feature/network.telephony.service.lte` | bool | `false` |
| `tizen.org/feature/network.telephony.service.umts` | bool | `false` |
| `tizen.org/feature/network.tethering.bluetooth` | bool | `false` |
| `tizen.org/feature/network.tethering.usb` | bool | `false` |
| `tizen.org/feature/network.vpn` | bool | `false` |
| `tizen.org/feature/network.wifi` | bool | `false` |
| `tizen.org/feature/network.wifi.aware` | bool | `false` |
| `tizen.org/feature/network.wifi.direct` | bool | `false` |
| `tizen.org/feature/network.wifi.direct.display` | bool | `false` |
| `tizen.org/feature/network.wifi.direct.service_discovery` | bool | `false` |
| `tizen.org/feature/notification` | bool | `false` |
| `tizen.org/feature/opengles` | bool | `true` |
| `tizen.org/feature/opengles.texture_format.3dc` | bool | `true` |
| `tizen.org/feature/opengles.texture_format.atc` | bool | `false` |
| `tizen.org/feature/opengles.texture_format.etc` | bool | `true` |
| `tizen.org/feature/opengles.texture_format.ptc` | bool | `false` |
| `tizen.org/feature/opengles.texture_format.pvrtc` | bool | `false` |
| `tizen.org/feature/opengles.texture_format.utc` | bool | `false` |
| `tizen.org/feature/opengles.version.1_1` | bool | `true` |
| `tizen.org/feature/opengles.version.2_0` | bool | `true` |
| `tizen.org/feature/platform.core.cpu.arch` | string | `x86_64` |
| `tizen.org/feature/platform.core.cpu.arch.armv6` | bool | `false` |
| `tizen.org/feature/platform.core.cpu.arch.armv7` | bool | `false` |
| `tizen.org/feature/platform.core.cpu.arch.x86_64` | bool | `true` |
| `tizen.org/feature/platform.core.fpu.arch.sse2` | bool | `false` |
| `tizen.org/feature/platform.core.fpu.arch.sse3` | bool | `false` |
| `tizen.org/feature/platform.core.fpu.arch.ssse3` | bool | `false` |
| `tizen.org/feature/platform.core.fpu.arch.vfpv2` | bool | `false` |
| `tizen.org/feature/platform.core.fpu.arch.vfpv3` | bool | `true` |
| `tizen.org/feature/platform.native.api.version` | string | `3.0` |
| `tizen.org/feature/platform.native.osp_compatible` | bool | `false` |
| `tizen.org/feature/platform.web.api.version` | string | `3.0` |
| `tizen.org/feature/profile` | string | `tv` |
| `tizen.org/feature/screen.bpp` | int | `32` |
| `tizen.org/feature/screen.coordinate_system.size.large` | bool | `false` |
| `tizen.org/feature/screen.coordinate_system.size.normal` | bool | `true` |
| `tizen.org/feature/screen.dpi` | int | `72` |
| `tizen.org/feature/screen.height` | int | `1080` |
| `tizen.org/feature/screen.output.hdmi` | bool | `false` |
| `tizen.org/feature/screen.output.rca` | bool | `false` |
| `tizen.org/feature/screen.shape.circle` | bool | `false` |
| `tizen.org/feature/screen.shape.rectangle` | bool | `true` |
| `tizen.org/feature/screen.size.all` | bool | `true` |
| `tizen.org/feature/screen.size.large` | bool | `false` |
| `tizen.org/feature/screen.size.normal` | bool | `true` |
| `tizen.org/feature/screen.size.normal.240.400` | bool | `false` |
| `tizen.org/feature/screen.size.normal.320.320` | bool | `false` |
| `tizen.org/feature/screen.size.normal.320.480` | bool | `false` |
| `tizen.org/feature/screen.size.normal.360.360` | bool | `false` |
| `tizen.org/feature/screen.size.normal.360.480` | bool | `false` |
| `tizen.org/feature/screen.size.normal.480.800` | bool | `false` |
| `tizen.org/feature/screen.size.normal.540.960` | bool | `false` |
| `tizen.org/feature/screen.size.normal.600.1024` | bool | `false` |
| `tizen.org/feature/screen.size.normal.720.1280` | bool | `false` |
| `tizen.org/feature/screen.size.normal.1080.1920` | bool | `false` |
| `tizen.org/feature/screen.width` | int | `1920` |
| `tizen.org/feature/sensor.accelerometer.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.activity_recognition` | bool | `false` |
| `tizen.org/feature/sensor.barometer` | bool | `false` |
| `tizen.org/feature/sensor.barometer.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.bio` | bool | `false` |
| `tizen.org/feature/sensor.gesture_recognition` | bool | `false` |
| `tizen.org/feature/sensor.gravity` | bool | `false` |
| `tizen.org/feature/sensor.gyroscope` | bool | `false` |
| `tizen.org/feature/sensor.gyroscope.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.heart_rate_monitor` | bool | `false` |
| `tizen.org/feature/sensor.heart_rate_monitor.led_green` | bool | `false` |
| `tizen.org/feature/sensor.heart_rate_monitor.led_ir` | bool | `false` |
| `tizen.org/feature/sensor.heart_rate_monitor.led_red` | bool | `false` |
| `tizen.org/feature/sensor.humidity` | bool | `false` |
| `tizen.org/feature/sensor.linear_acceleration` | bool | `false` |
| `tizen.org/feature/sensor.magnetometer` | bool | `false` |
| `tizen.org/feature/sensor.magnetometer.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.pedometer` | bool | `false` |
| `tizen.org/feature/sensor.photometer` | bool | `false` |
| `tizen.org/feature/sensor.photometer.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.proximity` | bool | `false` |
| `tizen.org/feature/sensor.proximity.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.rotation_vector` | bool | `false` |
| `tizen.org/feature/sensor.temperature` | bool | `false` |
| `tizen.org/feature/sensor.tiltmeter` | bool | `false` |
| `tizen.org/feature/sensor.tiltmeter.wakeup` | bool | `false` |
| `tizen.org/feature/sensor.ultraviolet` | bool | `false` |
| `tizen.org/feature/sensor.wrist_up` | bool | `false` |
| `tizen.org/feature/shell.appwidget` | bool | `true` |
| `tizen.org/feature/sip.voip` | bool | `false` |
| `tizen.org/feature/sound` | bool | `false` |
| `tizen.org/feature/speech.control` | bool | `false` |
| `tizen.org/feature/speech.recognition` | bool | `true` |
| `tizen.org/feature/speech.synthesis` | bool | `true` |
| `tizen.org/feature/storage.external` | bool | `true` |
| `tizen.org/feature/systemsetting` | bool | `true` |
| `tizen.org/feature/systemsetting.home_screen` | bool | `false` |
| `tizen.org/feature/systemsetting.lock_screen` | bool | `false` |
| `tizen.org/feature/systemsetting.incoming_call` | bool | `false` |
| `tizen.org/feature/systemsetting.notification_email` | bool | `false` |
| `tizen.org/feature/tv.audio` | bool | `true` |
| `tizen.org/feature/tv.display` | bool | `true` |
| `tizen.org/feature/tv.inputdevice` | bool | `true` |
| `tizen.org/feature/usb.accessory` | bool | `false` |
| `tizen.org/feature/usb.host` | bool | `false` |
| `tizen.org/feature/vision.face_recognition` | bool | `true` |
| `tizen.org/feature/vision.image_recognition` | bool | `true` |
| `tizen.org/feature/vision.barcode_detection` | bool | `true` |
| `tizen.org/feature/vision.barcode_generation` | bool | `true` |
| `tizen.org/feature/vision.barcode_recognition` | bool | `true` |
| `tizen.org/feature/vision.qrcode_generation` | bool | `false` |
| `tizen.org/feature/vision.qrcode_recognition` | bool | `false` |
| `tizen.org/feature/web.ime` | bool | `false` |
| `tizen.org/feature/web.service` | bool | `false` |
| `tizen.org/feature/websetting` | bool | `true` |
| `tizen.org/system/sound.media.volume.resolution.max` | int | `15` |
| `tizen.org/system/sound.notification.volume.resolution.max` | int | `15` |
| `tizen.org/system/sound.ringtone.volume.resolution.max` | int | `15` |
| `tizen.org/feature/network.internet` | bool | `true` |
| `tizen.org/feature/network.nfc.card_emulation.hce` | bool | `false` |
| `tizen.org/feature/network.nfc.p2p` | bool | `false` |
| `tizen.org/feature/network.nfc.tag` | bool | `false` |
| `tizen.org/feature/iot.ocf` | bool | `false` |
| `tizen.org/feature/network.service_discovery.dnssd` | bool | `true` |
| `tizen.org/feature/network.service_discovery.ssdp` | bool | `true` |
| `tizen.org/feature/maps` | bool | `true` |
| `tizen.org/feature/network.bluetooth.audio.controller` | bool | `false` |
| `tizen.org/feature/network.bluetooth.hid_device` | bool | `false` |
| `tizen.org/feature/network.bluetooth.phonebook.client` | bool | `false` |
| `tizen.org/feature/multimedia.custom_audio_effect` | bool | `false` |
| `tizen.org/feature/multimedia.raw_video` | bool | `false` |
| `tizen.org/feature/multimedia.stream_recorder` | bool | `false` |
| `tizen.org/feature/location.gps.satellite` | bool | `false` |
| `tizen.org/feature/network.wifi.tdls` | bool | `false` |
| `tizen.org/feature/network.bluetooth.le.gatt.server` | bool | `false` |
| `tizen.org/feature/network.bluetooth.le.gatt.client` | bool | `false` |
| `tizen.org/feature/network.bluetooth.oob` | bool | `false` |
| `tizen.org/feature/content.filter.pinyin` | bool | `false` |
| `tizen.org/feature/content.scanning.others` | bool | `false` |
| `tizen.org/feature/fido.uaf` | bool | `true` |
| `tizen.org/feature/media.audio_recording` | bool | `false` |
| `tizen.org/feature/media.video_recording` | bool | `false` |
| `tizen.org/custom/extra_color_key_support` | bool | `true` |
| `tizen.org/custom/accelerator` | bool | `true` |
| `tizen.org/feature/network.mtp` | bool | `true` |
| `tizen.org/feature/consumer_ir` | bool | `false` |
| `tizen.org/feature/convergence.d2d` | bool | `true` |
| `tizen.org/feature/tv.information` | bool | `true` |
| `tizen.org/feature/platform.core.fpu.arch.vfpv4` | bool | `true` |
| `tizen.org/feature/network.traffic_control` | bool | `true` |
| `tizen.org/feature/network.bluetooth.le.ipsp` | bool | `false` |
| `tizen.org/feature/systemsetting.font` | bool | `false` |
| `tizen.org/feature/security.privacy_privilege` | bool | `false` |
| `tizen.org/feature/display.state` | bool | `false` |
| `tizen.org/feature/nlp` | bool | `false` |
| `tizen.org/feature/display` | bool | `true` |
| `tizen.org/feature/feedback.vibration` | bool | `false` |
| `tizen.org/feature/machine_learning` | bool | `true` |
| `tizen.org/feature/machine_learning.inference` | bool | `true` |
| `tizen.org/feature/machine_learning.training` | bool | `false` |
| `tizen.org/feature/vision.inference` | bool | `false` |
| `tizen.org/feature/vision.inference.image` | bool | `false` |
| `tizen.org/feature/vision.inference.face` | bool | `false` |
| `tizen.org/feature/accessibility.grayscale` | bool | `false` |
| `tizen.org/feature/accessibility.negative` | bool | `false` |
| `tizen.org/custom/religious_tv_support` | bool | `false` |
| `tizen.org/feature/opengles.surfaceless_context` | bool | `true` |
| `tizen.org/feature/user_awareness` | bool | `true` |
| `tizen.org/feature/user_awareness.location` | bool | `false` |
| `tizen.org/feature/network.route` | bool | `true` |
| `tizen.org/feature/security.device_certificate` | bool | `true` |
| `tizen.org/feature/speech.control_manager` | bool | `true` |
| `tizen.org/feature/network.bluetooth.le.adv_ext` | bool | `false` |
| `tizen.org/feature/platform.core.cpu.arch.riscv32` | bool | `false` |
| `tizen.org/feature/platform.core.cpu.arch.riscv64` | bool | `false` |
| `tizen.org/feature/platform.core.abi` | string | `x86_64` |
| `tizen.org/feature/peripheral_io.gpio` | bool | `true` |

Rows: 241. Keys are addressed as `http://<key>` by system-info and `tizen.systeminfo.getCapability`.

## 7. WRT handling of `config.xml`

Evidence: `widget_config_*` accessor names and literal strings in libchromium-impl.so, `/usr/share/wrt/app/src/runtime.js` and siblings, `/usr/bin/wgt-backend`, `libvd-wgt-installer.so`.

### 7.1 Elements/attributes consumed (OBSERVED accessor names)

| Group | Fields |
|---|---|
| `<widget>` | `id`, `version`, `width`, `height`, `viewmodes`, `defaultlocale`, name / short name, description, author, `<preference>` list |
| `<content>` | `src`, `type`, `encoding`; default start files when absent: `index.htm`, `index.html`, `index.svg`, `index.xhtml`, `index.xht` |
| `<tizen:application>` | `id`, `package`, `required_version` |
| `<tizen:privilege>` | list -> permissions, checked through cynara at API call time |
| `<access>` | `origin`, `subdomains` -> WARP access map |
| `<tizen:allow-navigation>` | host list |
| `<tizen:content-security-policy>`, `...-report-only` | CSP rule strings |
| `<tizen:setting>` | accessor fields `screen_orientation`, `context_menu`, `background_support`, `encryption`, `hwkey`, `backbutton_presence`, `background_vibration`, `long_polling`, `sound_mode`, `pointing_device` (XML attribute spellings `screen-orientation`, `context-menu`, `background-support`, `hwkey-event`, ... INFERRED from the public Tizen schema) |
| `<tizen:metadata>` | key/value, see 7.4 |
| `<tizen:app-control>`, `<tizen:service>`, `<tizen:category>`, `<tizen:profile>`, launch screen (`<tizen:launch_screen>`) | parsed and stored |

Package layout after install (OBSERVED strings in `wgt-backend`): web content under `<pkg root>/res/wgt/` (`res/wgt/config.xml`), shared resources `shared/res`, signature file `author-signature.xml` (and distributor signatures, INFERRED) validated at install ("Check config.xml | - Current certificate signature level = %s").

### 7.2 Network / navigation policy

- **OBSERVED** two modes: CSP mode (when a CSP element exists) and WARP mode (legacy `<access>` list). Messages: `request[...] was blocked by WARP`; navigation check `ShouldAllowNavigation` with log `URL is blocked. send launch request` (a blocked top-level navigation is handed to the system as a launch request, i.e. external browser).
- **OBSERVED** schemes always allowed for navigation: `https:`, `widget:`, `about:`, `appcontrol:`, `chrome-extension:`; app content itself is loaded from the app's install dir (file/`widget`/`app` scheme).
- **OBSERVED** default CSP literal in the renderer: `default-src *; script-src 'self'; style-src 'self'; object-src 'none';`. **INFERRED** it is applied only when CSP mode is on without an explicit rule; an app with neither CSP nor `<access>` gets WARP with an empty allow-list for *sub-resources from foreign origins* unless `<access origin="*" subdomains="true"/>` is declared (the usual template contents).
- **OBSERVED** privilege names referenced by WRT: `internet`, `fullscreen`, `unlimitedstorage`, `location`, `notification`, `mediacapture`, `camera`, `recorder`, `screenshot` (all under `http://tizen.org/privilege/`), plus the Samsung-specific names `hostedapp_deviceapi_allow`, `smartcontroller.microphone` and `spatial.navigation.support` (full URL prefixes not recorded).

### 7.3 Window / viewport

- **OBSERVED** (`runtime.js`): the app window is created hidden (`show: false`), not fullscreen at Electron level, TV background colour `#0000` (transparent); shown on `ready-to-show` or after a 2000 ms timeout; `contextIsolation`/`nodeIntegration` are only altered when an addon is active.
- **OBSERVED** fallback strings: `Cannot determine screen resolution, assume 1920x1080`, `hardcode size as 1920 * 1080 for invalid size`.
- **OBSERVED** visibility: on suspend/resume the page gets a `tizenvisibilitychange` `CustomEvent` with `detail.visible` (in addition to the standard `visibilitychange`); on suspend WRT disables the window and **quits** the app if multitasking is unsupported for it.
- **OBSERVED** debugging: when the launch bundle has `__AUL_DEBUG__ == "1"` WRT starts the inspector server and replies with `{port}`; system debug port constant `TZ_SYS_DEBUG_PORT=9222` (`/etc/tizen-platform.conf`).
- 1280x720 apps: metadata keys `screen.resolution` / `viewport.scale.support` exist (7.4) but the scaling rule itself was not recovered (UNKNOWN). INFERRED from Samsung documentation: logical viewport width stays 1920 unless `<meta name="viewport" content="width=1280">` is used, in which case the page is scaled x1.5.

### 7.4 Metadata keys recognised (OBSERVED literals, prefix `http://samsung.com/tv/metadata/`)

`screen.resolution`, `viewport.scale.support`, `multitasking.support`, `background.execution.support`, `allow.mixedcontent`, `use.tvwindow`, `transparent.support`, `error.page`, `suspend.delay`, `keyrouter.long.press`, `use.keyboardfunckey`, plus `http://tizen.org/metadata/settings/background.rendering.support`. (The image contains more keys with this prefix; only those whose handling was looked at are listed.)

## UNKNOWNS

1. Default UA was derived from template + argument order, not captured from a live guest; whether WRT windows (vs. plain EWK webviews) append the Electron-style `WRT/33.3.0` token is not proven.
2. Exit-key default action (terminate vs. hide) and exactly which WRT function consumes `XF86Exit` when unregistered.
3. Whether `Back` on TV also emits `tizenhwkey` (believed no).
4. `event.code` values for remote keys; key repeat rate; long-press semantics (`keyrouter.long.press`).
5. Real emulator values of DUID, model code, firmware as returned by `webapis.productinfo` after first boot (static defaults are empty strings).
6. Viewport/zoom rule for 1280x720 apps and the effect of `viewport.scale.support`.
7. Exact semantics when neither CSP nor `<access>` is declared (which default applies in this WRT generation).
8. Return shapes/values of most `webapis.*` natives (only names and arity were recovered; native handlers were not decompiled).
9. `tizen.systeminfo.getCapability` full key list as exposed to JS was not tabulated separately (the source of truth is the model-config table in 6.4 plus the external plugin).
10. Modules absent as extensions here (`billing`, `sso` page side, `systemcontrol`, `voiceinteraction`, `security`, `syncplay`): whether the real emulator supplies them through downloaded pepper plugins.
