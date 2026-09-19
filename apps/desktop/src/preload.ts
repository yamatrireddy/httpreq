import { contextBridge, ipcRenderer } from 'electron';
import type { HttpReqBridge } from '@httpreq/shared';

const bridge: HttpReqBridge = {
  executeHttp: (request, executionId) => ipcRenderer.invoke('http:execute', request, executionId),
  cancelHttp: (executionId) => ipcRenderer.send('http:cancel', executionId),
};

contextBridge.exposeInMainWorld('httpreq', bridge);
