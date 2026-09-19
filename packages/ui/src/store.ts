import { create } from 'zustand';
import type { HttpRequest, HttpResponse, Workspace } from '@httpreq/shared';
import { createEmptyRequest, createId } from '@httpreq/shared';
import { createDefaultWorkspace } from '@httpreq/workspace';

interface WorkbenchState {
  workspace: Workspace;
  activeRequestId: string;
  responses: Record<string, HttpResponse | undefined>;
  /** Requests edited since their last successful write to the repository. */
  unsavedIds: ReadonlySet<string>;
  setWorkspace: (workspace: Workspace) => void;
  setActiveRequest: (id: string) => void;
  /** Activates the tab `offset` positions away from the active one, wrapping around. */
  cycleRequest: (offset: number) => void;
  updateRequest: (id: string, patch: Partial<HttpRequest>) => void;
  addRequest: () => void;
  duplicateRequest: (id: string) => void;
  moveRequest: (id: string, toIndex: number) => void;
  closeRequest: (id: string) => void;
  setResponse: (id: string, response: HttpResponse) => void;
  /** Clears the unsaved marker of requests that are unchanged since `saved` was written. */
  markSaved: (saved: Workspace) => void;
}

const initial = createDefaultWorkspace();

const withUnsaved = (ids: ReadonlySet<string>, id: string) => {
  if (ids.has(id)) return ids;
  const next = new Set(ids);
  next.add(id);
  return next;
};

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  workspace: initial,
  activeRequestId: initial.requests[0]!.id,
  responses: {},
  unsavedIds: new Set(),
  setWorkspace: (workspace) =>
    set({ workspace, activeRequestId: workspace.requests[0]?.id ?? '', unsavedIds: new Set() }),
  setActiveRequest: (activeRequestId) => set({ activeRequestId }),
  cycleRequest: (offset) =>
    set((state) => {
      const { requests } = state.workspace;
      const index = requests.findIndex((request) => request.id === state.activeRequestId);
      const next =
        requests[(((index + offset) % requests.length) + requests.length) % requests.length];
      return next ? { activeRequestId: next.id } : state;
    }),
  updateRequest: (id, patch) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        updatedAt: new Date().toISOString(),
        requests: state.workspace.requests.map((request) =>
          request.id === id ? { ...request, ...patch } : request,
        ),
      },
      unsavedIds: withUnsaved(state.unsavedIds, id),
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
  duplicateRequest: (id) =>
    set((state) => {
      const index = state.workspace.requests.findIndex((request) => request.id === id);
      const source = state.workspace.requests[index];
      if (!source) return state;
      const copy: HttpRequest = {
        ...structuredClone(source),
        id: createId(),
        name: `${source.name} (copy)`,
        params: source.params.map((item) => ({ ...item, id: createId() })),
        headers: source.headers.map((item) => ({ ...item, id: createId() })),
      };
      const requests = [...state.workspace.requests];
      requests.splice(index + 1, 0, copy);
      return {
        workspace: { ...state.workspace, requests, updatedAt: new Date().toISOString() },
        activeRequestId: copy.id,
        unsavedIds: withUnsaved(state.unsavedIds, copy.id),
      };
    }),
  moveRequest: (id, toIndex) =>
    set((state) => {
      const from = state.workspace.requests.findIndex((request) => request.id === id);
      const target = Math.max(0, Math.min(toIndex, state.workspace.requests.length - 1));
      if (from < 0 || from === target) return state;
      const requests = [...state.workspace.requests];
      const [moved] = requests.splice(from, 1);
      requests.splice(target, 0, moved!);
      return {
        workspace: { ...state.workspace, requests, updatedAt: new Date().toISOString() },
      };
    }),
  closeRequest: (id) =>
    set((state) => {
      if (state.workspace.requests.length === 1) return state;
      const index = state.workspace.requests.findIndex((request) => request.id === id);
      const requests = state.workspace.requests.filter((request) => request.id !== id);
      const unsavedIds = new Set(state.unsavedIds);
      unsavedIds.delete(id);
      return {
        workspace: { ...state.workspace, requests, updatedAt: new Date().toISOString() },
        activeRequestId:
          state.activeRequestId === id
            ? (requests[Math.max(index - 1, 0)]?.id ?? requests[0]!.id)
            : state.activeRequestId,
        unsavedIds,
      };
    }),
  setResponse: (id, response) =>
    set((state) => ({ responses: { ...state.responses, [id]: response } })),
  markSaved: (saved) =>
    set((state) => {
      if (state.unsavedIds.size === 0) return state;
      const savedById = new Map(saved.requests.map((request) => [request.id, request]));
      const current = new Map(state.workspace.requests.map((request) => [request.id, request]));
      // Requests are immutable, so identity tells whether an edit happened after the snapshot.
      const unsavedIds = new Set(
        [...state.unsavedIds].filter((id) => current.get(id) !== savedById.get(id)),
      );
      return unsavedIds.size === state.unsavedIds.size ? state : { unsavedIds };
    }),
}));
