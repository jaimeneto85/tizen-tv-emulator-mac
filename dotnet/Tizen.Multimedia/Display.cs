namespace Tizen.Multimedia;

public class Display
{
    public Display(Tizen.NUI.Window window) => ArgumentNullException.ThrowIfNull(window);
    public Display(Tizen.NUI.Window window, bool uiSync)
    {
        ArgumentNullException.ThrowIfNull(window);
        if (uiSync) throw new NotSupportedException("Synchronized multimedia UI rendering is not supported.");
    }
}
