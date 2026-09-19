import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  isMenuCommand,
  type DesktopBridge,
  type DesktopWindowState,
  type HttpReqBridge,
  type MenuCommand,
} from '@httpreq/shared';

// Each subscription wraps the listener so the renderer never receives the raw IpcRendererEvent
// (which exposes `sender`), and returns an unsubscribe function.
const subscribe = <T>(
  channel: string,
  listener: (value: T) => void,
  accept: (value: unknown) => value is T,
) => {
  const handler = (_event: IpcRendererEvent, value: unknown) => {
    if (accept(value)) listener(value);
  };
  ipcRenderer.on(channel, handler);
  return () => void ipcRenderer.removeListener(channel, handler);
};

const isWindowState = (value: unknown): value is DesktopWindowState =>
  !!value &&
  typeof (value as DesktopWindowState).maximized === 'boolean' &&
  typeof (value as DesktopWindowState).fullscreen === 'boolean';

const desktop: DesktopBridge = {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  performAction: (action) => ipcRenderer.send('window:action', action),
  setTitleBarTheme: (theme) => ipcRenderer.send('window:title-bar-theme', theme),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  checkConnectivity: () => ipcRenderer.invoke('net:check'),
  onWindowStateChange: (listener) => subscribe('window:state-changed', listener, isWindowState),
  onMenuCommand: (listener) => subscribe<MenuCommand>('menu:command', listener, isMenuCommand),
};

const bridge: HttpReqBridge = {
  executeHttp: (request, executionId) => ipcRenderer.invoke('http:execute', request, executionId),
  cancelHttp: (executionId) => ipcRenderer.send('http:cancel', executionId),
  desktop,
};

contextBridge.exposeInMainWorld('httpreq', bridge);
