import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HistoryEntry,
  HistoryRepository,
  Workspace,
  WorkspaceMeta,
  WorkspaceRepository,
} from '@httpreq/shared';
import { workspaceMeta } from '@httpreq/shared';
import {
  createDefaultWorkspace,
  createWorkspace,
  duplicateWorkspace,
  sortWorkspaces,
  uniqueWorkspaceName,
} from '@httpreq/workspace';
import { useWorkbenchStore } from './store';

/** Structural changes (tree, tabs, environments, profiles) are written shortly after they happen. */
const WORKSPACE_DEBOUNCE_MS = 400;
/** Unsaved request edits are kept across reloads, but written at most about once a second. */
const DRAFTS_DEBOUNCE_MS = 1000;

export interface WorkspaceActions {
  create: (name?: string) => Promise<string>;
  duplicate: (id: string, name?: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Loads another workspace. The caller has already released the outgoing one's connections. */
  switchTo: (id: string) => Promise<boolean>;
}

/**
 * Connects the workbench store to the repositories, for the active workspace.
 *
 * Only one workspace is in memory at a time: switching writes the current one, then loads the
 * next and replaces the whole store, which is what makes workspaces isolated rather than merely
 * filtered. Request edits never write the workspace — they live in drafts until the user saves —
 * so typing costs at most one debounced draft write.
 */
export function usePersistence(
  repository: WorkspaceRepository,
  historyRepository: HistoryRepository,
) {
  const [loaded, setLoaded] = useState(false);
  const persisted = useRef<Workspace | null>(null);
  /** The workspace the debounced writers belong to; a switch must not write to the old id. */
  const activeId = useRef<string>('');

  const refreshIndex = useCallback(
    async (fallback?: Workspace) => {
      const list = await repository.listWorkspaces().catch(() => [] as WorkspaceMeta[]);
      const items = list.length || !fallback ? list : [workspaceMeta(fallback)];
      useWorkbenchStore.getState().setWorkspaces(sortWorkspaces(items));
    },
    [repository],
  );

  /** Reads a workspace and its drafts and history, and installs it as the active one. */
  const install = useCallback(
    async (workspace: Workspace) => {
      const [drafts, history] = await Promise.all([
        repository.getDrafts(workspace.id).catch(() => ({})),
        historyRepository.list(workspace.id).catch(() => [] as HistoryEntry[]),
      ]);
      activeId.current = workspace.id;
      persisted.current = workspace;
      useWorkbenchStore.getState().load(workspace, drafts, history);
      await repository.setActiveWorkspaceId(workspace.id).catch(() => undefined);
      await refreshIndex(workspace);
    },
    [historyRepository, refreshIndex, repository],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await repository.listWorkspaces().catch(() => [] as WorkspaceMeta[]);
      const preferred = await repository.getActiveWorkspaceId().catch(() => null);
      // The last active workspace, else the most recently updated, else a first-run workspace.
      const target =
        (preferred && list.some((item) => item.id === preferred) ? preferred : null) ??
        sortWorkspaces(list)[0]?.id ??
        null;
      const stored = target ? await repository.getWorkspace(target).catch(() => null) : null;
      if (cancelled) return;
      const workspace = stored ?? createDefaultWorkspace();
      if (!stored) {
        // A brand-new installation: write the starter workspace so it appears in the index.
        await repository.saveWorkspace(workspace).catch(() => undefined);
      }
      await install(workspace);
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [install, repository]);

  const writeWorkspace = useCallback(
    async (workspace: Workspace) => {
      if (persisted.current === workspace) return;
      await repository.saveWorkspace(workspace);
      persisted.current = workspace;
    },
    [repository],
  );

  useEffect(() => {
    if (!loaded) return;
    let workspaceTimer: ReturnType<typeof setTimeout> | undefined;
    let draftsTimer: ReturnType<typeof setTimeout> | undefined;
    const flushWorkspace = () => {
      clearTimeout(workspaceTimer);
      // A failed background write is retried by the next change or an explicit save.
      void writeWorkspace(useWorkbenchStore.getState().workspace).catch(() => undefined);
    };
    const flushDrafts = () => {
      clearTimeout(draftsTimer);
      const state = useWorkbenchStore.getState();
      void repository.saveDrafts(state.workspace.id, state.drafts).catch(() => undefined);
    };
    const unsubscribe = useWorkbenchStore.subscribe((state, previous) => {
      if (state.workspace !== previous.workspace) {
        clearTimeout(workspaceTimer);
        workspaceTimer = setTimeout(flushWorkspace, WORKSPACE_DEBOUNCE_MS);
      }
      if (state.drafts !== previous.drafts) {
        clearTimeout(draftsTimer);
        draftsTimer = setTimeout(flushDrafts, DRAFTS_DEBOUNCE_MS);
      }
    });
    const flushAll = () => {
      flushWorkspace();
      flushDrafts();
    };
    window.addEventListener('beforeunload', flushAll);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', flushAll);
      flushAll();
    };
  }, [loaded, repository, writeWorkspace]);

  /** Commits a request's draft and writes the workspace now. Resolves whether it succeeded. */
  const saveRequest = useCallback(
    async (id: string): Promise<boolean> => {
      const store = useWorkbenchStore.getState();
      const draft = store.drafts[id];
      const base = store.workspace;
      if (!draft) {
        // Nothing to commit; still make sure pending structural changes are on disk.
        try {
          await writeWorkspace(base);
          return true;
        } catch {
          return false;
        }
      }
      const saved = base.requests.find((request) => request.id === id);
      if (!saved) return false;
      const committed = { ...draft, name: saved.name, parentId: saved.parentId };
      const written: Workspace = {
        ...base,
        requests: base.requests.map((request) => (request.id === id ? committed : request)),
        updatedAt: new Date().toISOString(),
      };
      store.setSaveStatus(id, 'saving');
      try {
        await repository.saveWorkspace(written);
        persisted.current = written;
        useWorkbenchStore.getState().commitSaved(committed, draft, written, base);
        return true;
      } catch {
        useWorkbenchStore.getState().setSaveStatus(id, 'failed');
        return false;
      }
    },
    [repository, writeWorkspace],
  );

  const recordHistory = useCallback(
    (entry: HistoryEntry) =>
      void historyRepository
        .add(useWorkbenchStore.getState().workspace.id, entry)
        .then((entries) => useWorkbenchStore.getState().setHistory(entries))
        .catch(() => undefined),
    [historyRepository],
  );

  const clearHistory = useCallback(
    () =>
      void historyRepository
        .clear(useWorkbenchStore.getState().workspace.id)
        .then(() => useWorkbenchStore.getState().setHistory([]))
        .catch(() => undefined),
    [historyRepository],
  );

  /* ---------- Workspace management ---------- */

  /** Writes whatever is in memory before it is replaced or left behind. */
  const flushCurrent = useCallback(async () => {
    const state = useWorkbenchStore.getState();
    await writeWorkspace(state.workspace).catch(() => undefined);
    await repository.saveDrafts(state.workspace.id, state.drafts).catch(() => undefined);
  }, [repository, writeWorkspace]);

  const switchTo = useCallback(
    async (id: string): Promise<boolean> => {
      const store = useWorkbenchStore.getState();
      if (id === store.workspace.id) return true;
      store.setSwitching(true);
      try {
        await flushCurrent();
        const next = await repository.getWorkspace(id);
        if (!next) {
          // Gone (deleted in another window): drop it from the index instead of hanging.
          await refreshIndex();
          return false;
        }
        await install(next);
        return true;
      } finally {
        useWorkbenchStore.getState().setSwitching(false);
      }
    },
    [flushCurrent, install, refreshIndex, repository],
  );

  const create = useCallback(
    async (name?: string) => {
      const existing = useWorkbenchStore.getState().workspaces;
      const workspace = createWorkspace(uniqueWorkspaceName(existing, name ?? 'New Workspace'));
      await flushCurrent();
      await repository.saveWorkspace(workspace);
      await install(workspace);
      return workspace.id;
    },
    [flushCurrent, install, repository],
  );

  const duplicate = useCallback(
    async (id: string, name?: string) => {
      await flushCurrent();
      const source =
        id === useWorkbenchStore.getState().workspace.id
          ? useWorkbenchStore.getState().workspace
          : await repository.getWorkspace(id);
      if (!source) return null;
      const existing = useWorkbenchStore.getState().workspaces;
      const copy = duplicateWorkspace(
        source,
        uniqueWorkspaceName(existing, name ?? `${source.name} (copy)`),
      );
      await repository.saveWorkspace(copy);
      await refreshIndex();
      return copy.id;
    },
    [flushCurrent, refreshIndex, repository],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const store = useWorkbenchStore.getState();
      if (id === store.workspace.id) {
        store.renameWorkspace(name);
        await writeWorkspace(useWorkbenchStore.getState().workspace).catch(() => undefined);
      } else {
        const workspace = await repository.getWorkspace(id);
        const trimmed = name.trim();
        if (!workspace || !trimmed) return;
        await repository.saveWorkspace({
          ...workspace,
          name: trimmed,
          updatedAt: new Date().toISOString(),
        });
      }
      await refreshIndex();
    },
    [refreshIndex, repository, writeWorkspace],
  );

  const remove = useCallback(
    async (id: string) => {
      const store = useWorkbenchStore.getState();
      const wasActive = id === store.workspace.id;
      await repository.deleteWorkspace(id);
      const remaining = (await repository.listWorkspaces().catch(() => [])).filter(
        (item) => item.id !== id,
      );
      if (!wasActive) {
        await refreshIndex();
        return;
      }
      // The active workspace went away, so something has to take its place immediately.
      const next = remaining[0] ? await repository.getWorkspace(remaining[0].id) : null;
      if (next) {
        await install(next);
        return;
      }
      const fresh = createWorkspace('My Workspace');
      await repository.saveWorkspace(fresh);
      await install(fresh);
    },
    [install, refreshIndex, repository],
  );

  const workspaceActions: WorkspaceActions = { create, duplicate, rename, remove, switchTo };

  return { loaded, saveRequest, recordHistory, clearHistory, workspaceActions };
}
