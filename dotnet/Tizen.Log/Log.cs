using System.Runtime.CompilerServices;
using Tvemu.Runtime;

namespace Tizen;

public class Log
{
    public static void Verbose(string tag, string message, [CallerFilePath] string file = "", [CallerMemberName] string func = "", [CallerLineNumber] int line = 0) => RuntimeEngine.Send(new { t = "log", level = "debug", tag, msg = message });
    public static void Debug(string tag, string message, [CallerFilePath] string file = "", [CallerMemberName] string func = "", [CallerLineNumber] int line = 0) => RuntimeEngine.Send(new { t = "log", level = "debug", tag, msg = message });
    public static void Info(string tag, string message, [CallerFilePath] string file = "", [CallerMemberName] string func = "", [CallerLineNumber] int line = 0) => RuntimeEngine.Send(new { t = "log", level = "info", tag, msg = message });
    public static void Warn(string tag, string message, [CallerFilePath] string file = "", [CallerMemberName] string func = "", [CallerLineNumber] int line = 0) => RuntimeEngine.Send(new { t = "log", level = "warn", tag, msg = message });
    public static void Error(string tag, string message, [CallerFilePath] string file = "", [CallerMemberName] string func = "", [CallerLineNumber] int line = 0) => RuntimeEngine.Send(new { t = "log", level = "error", tag, msg = message });
    public static void Fatal(string tag, string message, [CallerFilePath] string file = "", [CallerMemberName] string func = "", [CallerLineNumber] int line = 0) => RuntimeEngine.Send(new { t = "log", level = "fatal", tag, msg = message });
}
