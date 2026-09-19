import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryEntry, HistoryRepository, Workspace, WorkspaceRepository } from '@httpreq/shared';
import { createDefaultWorkspace, DEFAULT_WORKSPACE_ID } from '@httpreq/workspace';
import { useWorkbenchStore } from './store';

/** Structural changes (tree, tabs, environments) are written shortly after they happen. */
const WORKSPACE_DEBOUNCE_MS = 400;
/** Unsaved request edits are kept across reloads, but written at most about once a second. */
const DRAFTS_DEBOUNCE_MS = 1000;

/**
 * Connects the workbench store to the repositories. Request edits never write the workspace:
 * they live in drafts until the user saves, so typing costs at most one debounced draft write.
 */
export function usePersistence(repository: WorkspaceRepository, historyRepository: HistoryRepository) {
  const [loaded, setLoaded] = useState(false);
  const persisted = useRef<Workspace | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      repository.getWorkspace(DEFAULT_WORKSPACE_ID).catch(() => null),
      repository.getDrafts(DEFAULT_WORKSPACE_ID).catch(() => ({})),
      historyRepository.list(DEFAULT_WORKSPACE_ID).catch(() => [] as HistoryEntry[]),
    ]).then(([workspace, drafts, history]) => {
      if (cancelled) return;
      const initial = workspace ?? createDefaultWorkspace();
      persisted.current = workspace;
      useWorkbenchStore.getState().load(initial, drafts, history);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [repository, historyRepository]);

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
      void repository
        .saveDrafts(DEFAULT_WORKSPACE_ID, useWorkbenchStore.getState().drafts)
        .catch(() => undefined);
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
        .add(DEFAULT_WORKSPACE_ID, entry)
        .then((entries) => useWorkbenchStore.getState().setHistory(entries))
        .catch(() => undefined),
    [historyRepository],
  );

  const clearHistory = useCallback(
    () =>
      void historyRepository
        .clear(DEFAULT_WORKSPACE_ID)
        .then(() => useWorkbenchStore.getState().setHistory([]))
        .catch(() => undefined),
    [historyRepository],
  );

  return { loaded, saveRequest, recordHistory, clearHistory };
}
