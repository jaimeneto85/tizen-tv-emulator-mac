export class VisibilityController {
    private overrideValue: 'visible' | 'hidden' | null = null;
    private installed = false;

    install(documentObject: Document): void {
        if (this.installed) {
            return;
        }
        this.installed = true;
        const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(documentObject, 'hidden');
        const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(documentObject, 'visibilityState');
        const controller = this;
        Object.defineProperty(documentObject, 'hidden', {
            configurable: true,
            get() {
                if (controller.overrideValue !== null) {
                    return controller.overrideValue === 'hidden';
                }
                return originalHiddenDescriptor && originalHiddenDescriptor.get
                    ? originalHiddenDescriptor.get.call(this)
                    : false;
            }
        });
        Object.defineProperty(documentObject, 'visibilityState', {
            configurable: true,
            get() {
                if (controller.overrideValue !== null) {
                    return controller.overrideValue;
                }
                return originalVisibilityDescriptor && originalVisibilityDescriptor.get
                    ? originalVisibilityDescriptor.get.call(this)
                    : 'visible';
            }
        });
        Object.defineProperty(documentObject, 'PAGE_HIDDEN', { value: 'hidden', configurable: true });
        Object.defineProperty(documentObject, 'PAGE_VISIBLE', { value: 'visible', configurable: true });
        Object.defineProperty(documentObject, 'PAGE_PREVIEW', { value: 'preview', configurable: true });
    }

    setState(state: 'visible' | 'hidden', documentObject: Document): void {
        this.overrideValue = state;
        documentObject.dispatchEvent(new Event('visibilitychange'));
    }

    clearOverride(): void {
        this.overrideValue = null;
    }
}
