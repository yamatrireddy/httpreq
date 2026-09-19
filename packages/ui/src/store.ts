import { create } from 'zustand';
import {
  createCollection,
  createEmptyRequest,
  createEnvironment,
  createFolder,
  createId,
  type AuthConfig,
  type Environment,
  type HistoryEntry,
  type HttpRequest,
  type HttpResponse,
  type Workspace,
} from '@httpreq/shared';
import {
  createDefaultWorkspace,
  deleteNode as deleteTreeNode,
  duplicateNode as duplicateTreeNode,
  findNode,
  getAncestors,
  moveNode as moveTreeNode,
  renameNode as renameTreeNode,
} from '@httpreq/workspace';

export const EDITOR_TABS = [
  'overview',
  'params',
  'body',
  'headers',
  'authorization',
  'scripts',
  'sharing',
  'settings',
] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

export type SidebarView = 'collections' | 'environments' | 'history';

/** Only in-flight and failed saves are tracked; "saved" and "modified" derive from drafts. */
export type SaveStatus = 'saving' | 'failed';

interface WorkbenchState {
  /** Durable data: exactly what was last committed (and is being persisted). */
  workspace: Workspace;
  /**
   * Unsaved edits, keyed by request id. The editor always shows `drafts[id] ?? saved`; a draft
   * is dropped as soon as it matches the saved request again. Name and parent are structural
   * and are written to the saved request and its draft together, so they never diverge.
   */
  drafts: Record<string, HttpRequest>;
  activeRequestId: string | null;
  responses: Record<string, HttpResponse | undefined>;
  saveStatus: Record<string, SaveStatus | undefined>;
  history: HistoryEntry[];
  /* Explorer state (ephemeral). */
  selectedNodeId: string | null;
  expandedIds: ReadonlySet<string>;
  renamingId: string | null;
  /** Incremented to ask the explorer to scroll the selected node into view and focus it. */
  revealNonce: number;
  sidebarView: SidebarView;
  editorTabs: Record<string, EditorTab | undefined>;

  load: (workspace: Workspace, drafts: Record<string, HttpRequest>, history: HistoryEntry[]) => void;
  /* Tabs */
  openRequest: (id: string) => void;
  closeRequest: (id: string) => void;
  setActiveRequest: (id: string) => void;
  cycleRequest: (offset: number) => void;
  moveTab: (id: string, toIndex: number) => void;
  /* Request editing */
  editRequest: (id: string, patch: Partial<HttpRequest>) => void;
  discardDraft: (id: string) => void;
  /** Applies a successful save of `committed` (the draft snapshot that was written). */
  commitSaved: (committed: HttpRequest, draft: HttpRequest, written: Workspace, base: Workspace) => void;
  setSaveStatus: (id: string, status: SaveStatus | undefined) => void;
  setResponse: (id: string, response: HttpResponse) => void;
  setEditorTab: (id: string, tab: EditorTab) => void;
  /* Tree */
  createCollection: () => string;
  createFolder: (parentId: string) => string;
  createRequest: (parentId: string | null) => string;
  renameNode: (id: string, name: string) => void;
  moveNode: (id: string, parentId: string | null, beforeId?: string | null) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  updateContainer: (id: string, patch: { auth?: AuthConfig; description?: string }) => void;
  /** Adopts a workspace that gained imported nodes and reveals the imported root. */
  applyImport: (workspace: Workspace, rootId: string, kind: 'collection' | 'request') => void;
  selectNode: (id: string | null) => void;
  toggleExpanded: (id: string, expanded?: boolean) => void;
  revealNode: (id: string) => void;
  setRenaming: (id: string | null) => void;
  setSidebarView: (view: SidebarView) => void;
  /* Environments */
  createEnvironment: () => string;
  updateEnvironment: (id: string, patch: Partial<Omit<Environment, 'id'>>) => void;
  duplicateEnvironment: (id: string) => void;
  deleteEnvironment: (id: string) => void;
  setActiveEnvironment: (id: string | null) => void;
  /** Creates or updates a variable in the active environment (e.g. a retrieved OAuth token). */
  setEnvironmentVariable: (key: string, value: string, secret: boolean) => boolean;
  setHistory: (history: HistoryEntry[]) => void;
}

const touch = (workspace: Workspace, patch: Partial<Workspace>): Workspace => ({
  ...workspace,
  ...patch,
  updatedAt: new Date().toISOString(),
});

const same = (a: HttpRequest, b: HttpRequest) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The version of a request the editor shows: its draft if it has unsaved edits. */
export const editableRequest = (
  state: Pick<WorkbenchState, 'workspace' | 'drafts'>,
  id: string | null,
): HttpRequest | undefined =>
  id ? (state.drafts[id] ?? state.workspace.requests.find((request) => request.id === id)) : undefined;

export const activeEnvironment = (workspace: Workspace) =>
  workspace.environments.find((environment) => environment.id === workspace.activeEnvironmentId) ??
  null;

const isPristineDraft = (request: HttpRequest) =>
  request.parentId === null &&
  !request.url &&
  request.name === 'Untitled Request' &&
  request.body.mode === 'none' &&
  request.headers.length === 0;

const without = <T>(record: Record<string, T>, ids: Iterable<string>) => {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};

const withExpanded = (ids: ReadonlySet<string>, add: Iterable<string>) => {
  const next = new Set(ids);
  for (const id of add) next.add(id);
  return next;
};

const initial = createDefaultWorkspace();

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  workspace: initial,
  drafts: {},
  activeRequestId: initial.openRequestIds[0] ?? null,
  responses: {},
  saveStatus: {},
  history: [],
  selectedNodeId: null,
  expandedIds: new Set(initial.collections.map((collection) => collection.id)),
  renamingId: null,
  revealNonce: 0,
  sidebarView: 'collections',
  editorTabs: {},

  load: (workspace, drafts, history) => {
    const requestIds = new Set(workspace.requests.map((request) => request.id));
    const liveDrafts = Object.fromEntries(
      Object.entries(drafts)
        .filter(([id]) => requestIds.has(id))
        .map(([id, draft]) => {
          const saved = workspace.requests.find((request) => request.id === id)!;
          return [id, { ...draft, name: saved.name, parentId: saved.parentId }];
        }),
    );
    const active = workspace.openRequestIds[0] ?? null;
    set({
      workspace,
      drafts: liveDrafts,
      history,
      activeRequestId: active,
      responses: {},
      saveStatus: {},
      selectedNodeId: active,
      expandedIds: new Set([
        ...workspace.collections.map((collection) => collection.id),
        ...(active ? getAncestors(workspace, active).map((item) => item.node.id) : []),
      ]),
    });
  },

  openRequest: (id) =>
    set((state) => {
      if (!state.workspace.requests.some((request) => request.id === id)) return state;
      const open = state.workspace.openRequestIds;
      if (open.includes(id)) return { activeRequestId: id, selectedNodeId: id };
      const index = state.activeRequestId ? open.indexOf(state.activeRequestId) : -1;
      const openRequestIds = [...open];
      openRequestIds.splice(index >= 0 ? index + 1 : open.length, 0, id);
      return {
        workspace: touch(state.workspace, { openRequestIds }),
        activeRequestId: id,
        selectedNodeId: id,
      };
    }),

  closeRequest: (id) =>
    set((state) => {
      const open = state.workspace.openRequestIds;
      const index = open.indexOf(id);
      if (index < 0) return state;
      const openRequestIds = open.filter((openId) => openId !== id);
      const saved = state.workspace.requests.find((request) => request.id === id);
      // A blank scratch request that was never used disappears with its tab.
      const discard = saved && !state.drafts[id] && isPristineDraft(saved);
      return {
        workspace: touch(state.workspace, {
          openRequestIds,
          ...(discard ? { requests: state.workspace.requests.filter((request) => request.id !== id) } : {}),
        }),
        drafts: without(state.drafts, [id]),
        saveStatus: without(state.saveStatus, [id]),
        activeRequestId:
          state.activeRequestId === id
            ? (openRequestIds[Math.max(index - 1, 0)] ?? null)
            : state.activeRequestId,
      };
    }),

  setActiveRequest: (activeRequestId) => set({ activeRequestId, selectedNodeId: activeRequestId }),

  cycleRequest: (offset) =>
    set((state) => {
      const open = state.workspace.openRequestIds;
      if (!open.length) return state;
      const index = state.activeRequestId ? open.indexOf(state.activeRequestId) : 0;
      const next = open[(((index + offset) % open.length) + open.length) % open.length];
      return next ? { activeRequestId: next, selectedNodeId: next } : state;
    }),

  moveTab: (id, toIndex) =>
    set((state) => {
      const open = [...state.workspace.openRequestIds];
      const from = open.indexOf(id);
      const target = Math.max(0, Math.min(toIndex, open.length - 1));
      if (from < 0 || from === target) return state;
      open.splice(from, 1);
      open.splice(target, 0, id);
      return { workspace: touch(state.workspace, { openRequestIds: open }) };
    }),

  editRequest: (id, patch) =>
    set((state) => {
      const saved = state.workspace.requests.find((request) => request.id === id);
      if (!saved) return state;
      const base = state.drafts[id] ?? saved;
      // Structural fields are changed through tree actions only.
      const next: HttpRequest = { ...base, ...patch, id, name: saved.name, parentId: saved.parentId };
      if (same(next, saved)) {
        return state.drafts[id] ? { drafts: without(state.drafts, [id]) } : state;
      }
      return {
        drafts: { ...state.drafts, [id]: next },
        saveStatus: state.saveStatus[id] === 'failed' ? without(state.saveStatus, [id]) : state.saveStatus,
      };
    }),

  discardDraft: (id) =>
    set((state) => ({
      drafts: without(state.drafts, [id]),
      saveStatus: without(state.saveStatus, [id]),
    })),

  commitSaved: (committed, draft, written, base) =>
    set((state) => {
      // If nothing else changed while writing, adopt the written snapshot so it is not re-saved.
      const workspace =
        state.workspace === base
          ? written
          : touch(state.workspace, {
              requests: state.workspace.requests.map((request) =>
                request.id === committed.id ? { ...committed, name: request.name, parentId: request.parentId } : request,
              ),
            });
      const current = state.drafts[committed.id];
      const drafts =
        current === draft || (current && same(current, committed))
          ? without(state.drafts, [committed.id])
          : state.drafts;
      return { workspace, drafts, saveStatus: without(state.saveStatus, [committed.id]) };
    }),

  setSaveStatus: (id, status) =>
    set((state) => ({
      saveStatus: status ? { ...state.saveStatus, [id]: status } : without(state.saveStatus, [id]),
    })),

  setResponse: (id, response) => set((state) => ({ responses: { ...state.responses, [id]: response } })),

  setEditorTab: (id, tab) => set((state) => ({ editorTabs: { ...state.editorTabs, [id]: tab } })),

  createCollection: () => {
    const collection = createCollection();
    set((state) => ({
      workspace: touch(state.workspace, { collections: [...state.workspace.collections, collection] }),
      selectedNodeId: collection.id,
      renamingId: collection.id,
      sidebarView: 'collections',
    }));
    return collection.id;
  },

  createFolder: (parentId) => {
    const folder = createFolder(parentId);
    set((state) => ({
      workspace: touch(state.workspace, { folders: [...state.workspace.folders, folder] }),
      expandedIds: withExpanded(state.expandedIds, [parentId]),
      selectedNodeId: folder.id,
      renamingId: folder.id,
    }));
    return folder.id;
  },

  createRequest: (parentId) => {
    const request = createEmptyRequest(parentId);
    set((state) => ({
      workspace: touch(state.workspace, { requests: [...state.workspace.requests, request] }),
      expandedIds: parentId ? withExpanded(state.expandedIds, [parentId]) : state.expandedIds,
      renamingId: parentId ? request.id : null,
    }));
    get().openRequest(request.id);
    return request.id;
  },

  renameNode: (id, name) =>
    set((state) => {
      const workspace = renameTreeNode(state.workspace, id, name);
      if (workspace === state.workspace) return { renamingId: null };
      const draft = state.drafts[id];
      return {
        workspace,
        drafts: draft ? { ...state.drafts, [id]: { ...draft, name: name.trim() } } : state.drafts,
        renamingId: null,
      };
    }),

  moveNode: (id, parentId, beforeId = null) =>
    set((state) => {
      const workspace = moveTreeNode(state.workspace, id, parentId, beforeId);
      if (workspace === state.workspace) return state;
      const draft = state.drafts[id];
      return {
        workspace,
        drafts: draft ? { ...state.drafts, [id]: { ...draft, parentId } } : state.drafts,
        expandedIds: parentId ? withExpanded(state.expandedIds, [parentId]) : state.expandedIds,
      };
    }),

  duplicateNode: (id) => {
    const { workspace, id: copyId } = duplicateTreeNode(get().workspace, id);
    if (!copyId) return;
    set({ workspace, selectedNodeId: copyId });
    if (findNode(workspace, copyId)?.kind === 'request') get().openRequest(copyId);
  },

  deleteNode: (id) =>
    set((state) => {
      const { workspace, removedRequestIds } = deleteTreeNode(state.workspace, id);
      if (workspace === state.workspace) return state;
      const open = workspace.openRequestIds;
      const activeGone = state.activeRequestId !== null && removedRequestIds.has(state.activeRequestId);
      const previousIndex = state.activeRequestId ? state.workspace.openRequestIds.indexOf(state.activeRequestId) : 0;
      return {
        workspace,
        drafts: without(state.drafts, removedRequestIds),
        responses: without(state.responses, removedRequestIds),
        saveStatus: without(state.saveStatus, removedRequestIds),
        activeRequestId: activeGone ? (open[Math.min(previousIndex, open.length - 1)] ?? null) : state.activeRequestId,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      };
    }),

  updateContainer: (id, patch) =>
    set((state) => {
      const update = <T extends { id: string }>(items: T[]) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item));
      return {
        workspace: touch(state.workspace, {
          collections: update(state.workspace.collections),
          folders: update(state.workspace.folders),
        }),
      };
    }),

  applyImport: (workspace, rootId, kind) => {
    set((state) => ({
      workspace,
      selectedNodeId: rootId,
      sidebarView: 'collections',
      expandedIds: withExpanded(state.expandedIds, [rootId]),
    }));
    if (kind === 'request') get().openRequest(rootId);
  },

  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  toggleExpanded: (id, expanded) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      const open = expanded ?? !next.has(id);
      if (open) next.add(id);
      else next.delete(id);
      return { expandedIds: next };
    }),

  revealNode: (id) =>
    set((state) => ({
      selectedNodeId: id,
      sidebarView: 'collections',
      expandedIds: withExpanded(
        state.expandedIds,
        getAncestors(state.workspace, id).map((item) => item.node.id),
      ),
      revealNonce: state.revealNonce + 1,
    })),

  setRenaming: (renamingId) => set({ renamingId }),

  setSidebarView: (sidebarView) => set({ sidebarView }),

  createEnvironment: () => {
    const environment = createEnvironment();
    set((state) => ({
      workspace: touch(state.workspace, {
        environments: [...state.workspace.environments, environment],
        activeEnvironmentId: state.workspace.activeEnvironmentId ?? environment.id,
      }),
    }));
    return environment.id;
  },

  updateEnvironment: (id, patch) =>
    set((state) => ({
      workspace: touch(state.workspace, {
        environments: state.workspace.environments.map((environment) =>
          environment.id === id ? { ...environment, ...patch } : environment,
        ),
      }),
    })),

  duplicateEnvironment: (id) =>
    set((state) => {
      const index = state.workspace.environments.findIndex((environment) => environment.id === id);
      const source = state.workspace.environments[index];
      if (!source) return state;
      const copy: Environment = {
        id: createId(),
        name: `${source.name} (copy)`,
        variables: source.variables.map((variable) => ({ ...variable, id: createId() })),
      };
      const environments = [...state.workspace.environments];
      environments.splice(index + 1, 0, copy);
      return { workspace: touch(state.workspace, { environments }) };
    }),

  deleteEnvironment: (id) =>
    set((state) => ({
      workspace: touch(state.workspace, {
        environments: state.workspace.environments.filter((environment) => environment.id !== id),
        activeEnvironmentId:
          state.workspace.activeEnvironmentId === id ? null : state.workspace.activeEnvironmentId,
      }),
    })),

  setActiveEnvironment: (activeEnvironmentId) =>
    set((state) => ({ workspace: touch(state.workspace, { activeEnvironmentId }) })),

  setEnvironmentVariable: (key, value, secret) => {
    const environment = activeEnvironment(get().workspace);
    if (!environment || !key) return false;
    const existing = environment.variables.find((variable) => variable.key === key);
    get().updateEnvironment(environment.id, {
      variables: existing
        ? environment.variables.map((variable) =>
            variable === existing ? { ...variable, value, enabled: true } : variable,
          )
        : [...environment.variables, { id: createId(), key, value, enabled: true, secret }],
    });
    return true;
  },

  setHistory: (history) => set({ history }),
}));
