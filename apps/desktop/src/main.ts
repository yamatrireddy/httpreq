import { app, BrowserWindow, ipcMain, net, session } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HttpResponse, IpcResult } from '@httpreq/shared';
import { executeHttp } from './http';

const currentDir = dirname(fileURLToPath(import.meta.url));
const devServer = process.env.VITE_DEV_SERVER_URL;

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
      return await executeHttp(request, controller.signal, (url, init) => net.fetch(url, init));
    } finally {
      if (inFlight.get(key) === controller) inFlight.delete(key);
    }
  },
);

ipcMain.on('http:cancel', (event, executionId: unknown) => {
  if (typeof executionId === 'string') inFlight.get(inFlightKey(event, executionId))?.abort();
});

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#18181b',
    show: false,
    webPreferences: {
      preload: join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (devServer) await window.loadURL(devServer);
  else await window.loadFile(join(currentDir, '../../../web/dist/index.html'));
};

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    });
  });
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
