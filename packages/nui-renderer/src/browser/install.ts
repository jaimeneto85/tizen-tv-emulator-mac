import { installNuiRenderer } from './nui-renderer.js';

const api = installNuiRenderer(window, document);
(window as unknown as Record<string, unknown>).__tvemuNui = api;
