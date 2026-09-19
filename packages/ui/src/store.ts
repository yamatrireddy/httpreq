import { create } from 'zustand';
import type { HttpRequest, HttpResponse, Workspace } from '@httpreq/shared';
import { createEmptyRequest } from '@httpreq/shared';
import { createDefaultWorkspace } from '@httpreq/workspace';

interface WorkbenchState {
  workspace: Workspace;
  activeRequestId: string;
  responses: Record<string, HttpResponse | undefined>;
  setWorkspace: (workspace: Workspace) => void;
  setActiveRequest: (id: string) => void;
  updateRequest: (id: string, patch: Partial<HttpRequest>) => void;
  addRequest: () => void;
  closeRequest: (id: string) => void;
  setResponse: (id: string, response: HttpResponse) => void;
}

const initial = createDefaultWorkspace();

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  workspace: initial,
  activeRequestId: initial.requests[0]!.id,
  responses: {},
  setWorkspace: (workspace) => set({ workspace, activeRequestId: workspace.requests[0]?.id ?? '' }),
  setActiveRequest: (activeRequestId) => set({ activeRequestId }),
  updateRequest: (id, patch) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        updatedAt: new Date().toISOString(),
        requests: state.workspace.requests.map((request) =>
          request.id === id ? { ...request, ...patch } : request,
        ),
      },
    })),
  addRequest: () =>
    set((state) => {
      const request = createEmptyRequest();
      return {
        workspace: {
          ...state.workspace,
          updatedAt: new Date().toISOString(),
          requests: [...state.workspace.requests, request],
        },
        activeRequestId: request.id,
      };
    }),
  closeRequest: (id) =>
    set((state) => {
      if (state.workspace.requests.length === 1) return state;
      const index = state.workspace.requests.findIndex((request) => request.id === id);
      const requests = state.workspace.requests.filter((request) => request.id !== id);
      return {
        workspace: { ...state.workspace, requests, updatedAt: new Date().toISOString() },
        activeRequestId:
          state.activeRequestId === id
            ? (requests[Math.max(index - 1, 0)]?.id ?? requests[0]!.id)
            : state.activeRequestId,
      };
    }),
  setResponse: (id, response) =>
    set((state) => ({ responses: { ...state.responses, [id]: response } })),
}));
