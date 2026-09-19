import { contextBridge, ipcRenderer } from 'electron';
import type { HttpRequest, HttpResponse } from '@httpreq/shared';

contextBridge.exposeInMainWorld('httpreq', {
  executeHttp: (request: HttpRequest): Promise<HttpResponse> =>
    ipcRenderer.invoke('http:execute', request),
});
