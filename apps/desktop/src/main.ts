import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONNECTIVITY_PROBE_URL,
  isWindowAction,
  type AppInfo,
  type DesktopWindowState,
  type HttpResponse,
  type IpcResult,
  type MenuCommand,
  type WindowAction,
} from '@httpreq/shared';
import { executeHttp } from './http';
import { buildMacMenu } from './menu';
import {
  isAllowedExternalUrl,
  isAuthorizationUrl,
  isTitleBarTheme,
  isTrustedRendererUrl,
  nextZoomLevel,
  TITLE_BAR_HEIGHT,
} from './shell';

const currentDir = dirname(fileURLToPath(import.meta.url));
const devServer = process.env.VITE_DEV_SERVER_URL;
const isMac = process.platform === 'darwin';

app.setName('HttpReq');
// Groups taskbar entries and notifications under the installed app on Windows.
if (process.platform === 'win32') app.setAppUserModelId('dev.httpreq.desktop');

// `resources/` sits next to `dist/` both in the repository and inside the packaged app.asar.
const windowIcon = join(currentDir, '../../resources/icon.png');
const rendererEntry = app.isPackaged
  ? join(process.resourcesPath, 'renderer/index.html')
  : join(currentDir, '../../../web/dist/index.html');

// Vite's React Fast Refresh injects an inline preamble script, so dev mode must allow inline
// scripts. Production keeps the strict policy.
const scriptSrc = devServer ? "script-src 'self' 'unsafe-inline' blob:" : "script-src 'self' blob:";
const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSrc,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self' http: https: ws: wss:",
].join('; ');

/** Matches the renderer's body colour, so the window can be shown before the page paints. */
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#242424' : '#ffffff');

const titleBarColors = () =>
  nativeTheme.shouldUseDarkColors
    ? { color: '#141414', symbolColor: '#c9c9c9' }
    : { color: '#f1f3f5', symbolColor: '#343a40' };

// Only the top-level document of the app may use shell IPC; subframes have a parent frame.
const isTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent) =>
  !!event.senderFrame &&
  event.senderFrame.parent === null &&
  isTrustedRendererUrl(event.senderFrame.url, devServer);

const windowFor = (event: IpcMainEvent | IpcMainInvokeEvent) =>
  BrowserWindow.fromWebContents(event.sender);

const windowState = (window: BrowserWindow): DesktopWindowState => ({
  maximized: window.isMaximized(),
  fullscreen: window.isFullScreen(),
});

/**
 * API requests run in their own sessions rather than the app's default session: they keep a
 * separate cookie jar, and the app's CSP header injection never touches API responses. Requests
 * that opt out of TLS verification use a second session whose certificate check accepts
 * everything, so the relaxed check can never leak into verified requests.
 */
let verifiedSession: Electron.Session | undefined;
let unverifiedSession: Electron.Session | undefined;
const apiSession = (verifyTls: boolean): Electron.Session => {
  if (verifyTls) return (verifiedSession ??= session.fromPartition('persist:httpreq-api'));
  if (!unverifiedSession) {
    unverifiedSession = session.fromPartition('persist:httpreq-api-insecure');
    unverifiedSession.setCertificateVerifyProc((_request, callback) => callback(0));
  }
  return unverifiedSession;
};

// In-flight native requests, keyed by sender so one window cannot cancel another's requests.
const inFlight = new Map<string, AbortController>();
const inFlightKey = (event: { sender: { id: number } }, executionId: string) =>
  `${event.sender.id}:${executionId}`;

ipcMain.handle(
  'http:execute',
  async (event, request: unknown, executionId: unknown): Promise<IpcResult<HttpResponse>> => {
    if (typeof executionId !== 'string' || !executionId) {
      return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Missing execution id.' } };
    }
    const key = inFlightKey(event, executionId);
    const controller = new AbortController();
    inFlight.set(key, controller);
    try {
      return await executeHttp(request, controller.signal, (url, init, options) =>
        apiSession(options.verifyTls).fetch(url, init),
      );
    } finally {
      if (inFlight.get(key) === controller) inFlight.delete(key);
    }
  },
);

ipcMain.on('http:cancel', (event, executionId: unknown) => {
  if (typeof executionId === 'string') inFlight.get(inFlightKey(event, executionId))?.abort();
});

ipcMain.handle('app:info', (event): AppInfo | null => {
  if (!isTrustedSender(event)) return null;
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  };
});

ipcMain.handle('window:state', (event): DesktopWindowState | null => {
  const window = windowFor(event);
  return window && isTrustedSender(event) ? windowState(window) : null;
});

const performAction = (window: BrowserWindow, action: WindowAction) => {
  const contents = window.webContents;
  switch (action) {
    case 'undo':
      return contents.undo();
    case 'redo':
      return contents.redo();
    case 'cut':
      return contents.cut();
    case 'copy':
      return contents.copy();
    case 'paste':
      return contents.paste();
    case 'select-all':
      return contents.selectAll();
    case 'zoom-in':
      return contents.setZoomLevel(nextZoomLevel(contents.getZoomLevel(), 'in'));
    case 'zoom-out':
      return contents.setZoomLevel(nextZoomLevel(contents.getZoomLevel(), 'out'));
    case 'zoom-reset':
      return contents.setZoomLevel(0);
    case 'toggle-fullscreen':
      return window.setFullScreen(!window.isFullScreen());
    case 'toggle-devtools':
      return contents.toggleDevTools();
    case 'quit':
      return app.quit();
  }
};

ipcMain.on('window:action', (event, action: unknown) => {
  const window = windowFor(event);
  if (window && isTrustedSender(event) && isWindowAction(action)) performAction(window, action);
});

ipcMain.on('window:title-bar-theme', (event, theme: unknown) => {
  const window = windowFor(event);
  if (!window || isMac || !isTrustedSender(event) || !isTitleBarTheme(theme)) return;
  window.setTitleBarOverlay({ ...theme, height: TITLE_BAR_HEIGHT });
});

ipcMain.on('shell:open-external', (event, url: unknown) => {
  if (isTrustedSender(event) && isAllowedExternalUrl(url)) void shell.openExternal(url);
});

ipcMain.on('shell:open-authorization-url', (event, url: unknown) => {
  if (isTrustedSender(event) && isAuthorizationUrl(url)) void shell.openExternal(url);
});

ipcMain.handle('net:check', async (event): Promise<boolean> => {
  if (!isTrustedSender(event) || !net.isOnline()) return false;
  try {
    const response = await net.fetch(CONNECTIVITY_PROBE_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    // Captive portals answer with a redirect or a login page instead of the expected 204.
    return response.status === 204;
  } catch {
    return false;
  }
});

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'HttpReq',
    icon: isMac ? undefined : windowIcon,
    backgroundColor: windowBackground(),
    // Shown immediately rather than on `ready-to-show`: on Windows each Chromium child process
    // (GPU, renderer) can take over a second to start, and a window that appears at once in the
    // app's colours feels far faster than one that appears only when the page has painted.
    show: true,
    // The React title bar hosts the menu; the OS keeps drawing the real window controls.
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 11 } }
      : { titleBarOverlay: { ...titleBarColors(), height: TITLE_BAR_HEIGHT } }),
    webPreferences: {
      preload: join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const notifyState = () => {
    if (!window.isDestroyed()) window.webContents.send('window:state-changed', windowState(window));
  };
  window.on('maximize', notifyState);
  window.on('unmaximize', notifyState);
  window.on('enter-full-screen', notifyState);
  window.on('leave-full-screen', notifyState);

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The renderer is a single-page app; never let it navigate away from the bundled UI.
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, devServer)) event.preventDefault();
  });
  if (devServer) await window.loadURL(devServer);
  else await window.loadFile(rendererEntry);
};

const sendMenuCommand = (command: MenuCommand) =>
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', command);

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    });
  });
  // Windows and Linux render the menu inside the React title bar instead of a native menu bar.
  Menu.setApplicationMenu(
    isMac
      ? buildMacMenu({
          command: sendMenuCommand,
          openExternal: (url) => void shell.openExternal(url),
        })
      : null,
  );
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
