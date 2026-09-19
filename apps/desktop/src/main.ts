import { app, BrowserWindow, ipcMain, net, session } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { prepareRequest } from '@httpreq/api-client';
import { AppError, type HttpRequest, type HttpResponse } from '@httpreq/shared';

const currentDir = dirname(fileURLToPath(import.meta.url));

const isHttpRequest = (value: unknown): value is HttpRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HttpRequest>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.url === 'string' &&
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(candidate.method ?? '') &&
    Array.isArray(candidate.params) &&
    Array.isArray(candidate.headers)
  );
};

ipcMain.handle('http:execute', async (_event, request: unknown): Promise<HttpResponse> => {
  if (!isHttpRequest(request)) throw new AppError('INVALID_REQUEST', 'Invalid request payload.');
  const prepared = prepareRequest(request);
  const parsedUrl = new URL(prepared.url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new AppError('INVALID_REQUEST', 'Only HTTP and HTTPS URLs are permitted.');
  }
  const startedAt = performance.now();
  try {
    const response = await net.fetch(prepared.url, prepared);
    const body = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      contentType: response.headers.get('content-type') ?? 'text/plain',
      durationMs: Math.round(performance.now() - startedAt),
      sizeBytes: Buffer.byteLength(body),
    };
  } catch (cause) {
    throw new AppError('NETWORK_ERROR', 'The native request could not be completed.', { cause });
  }
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
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) await window.loadURL(devServer);
  else await window.loadFile(join(currentDir, '../../../web/dist/index.html'));
};

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' http: https: ws: wss:",
        ],
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
