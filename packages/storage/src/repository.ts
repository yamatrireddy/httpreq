import type {
  HistoryEntry,
  HistoryRepository,
  HttpRequest,
  Workspace,
  WorkspaceMeta,
  WorkspaceRepository,
} from '@httpreq/shared';
import { workspaceMeta } from '@httpreq/shared';
import { migrateWorkspace, normalizeRequest, sortWorkspaces } from '@httpreq/workspace';
import { deserializeAuth, sanitizeRequest, sanitizeWorkspace } from './sanitize';
import type { KeyValueStore } from './store';

/** Maximum number of history entries kept per workspace. */
export const HISTORY_LIMIT = 200;

export const WORKSPACE_KEY = (id: string) => `workspace.${id}`;
export const DRAFTS_KEY = (id: string) => `drafts.${id}`;
export const HISTORY_KEY = (id: string) => `history.${id}`;
/** Index of every workspace, so the switcher does not have to read them all. */
export const INDEX_KEY = 'workspaces';
/** The workspace to restore on the next start. */
export const ACTIVE_KEY = 'activeWorkspace';

const isMeta = (value: unknown): value is WorkspaceMeta =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as WorkspaceMeta).id === 'string' &&
  typeof (value as WorkspaceMeta).name === 'string';

/**
 * Every workspace in one key/value store, on both platforms.
 *
 * Isolation is by key: a workspace's tree, drafts and history live under keys derived from its
 * id, and nothing reads across them. The index is a derived cache — if it ever disagrees with the
 * stored workspaces, {@link listWorkspaces} rebuilds it from the keys that actually exist.
 */
export class KeyValueWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly store: KeyValueStore) {}

  async listWorkspaces(): Promise<WorkspaceMeta[]> {
    const stored = await this.store.get(INDEX_KEY);
    const index = Array.isArray(stored) ? stored.filter(isMeta) : [];
    const keys = await this.store.keys('workspace.');
    const ids = new Set(keys.map((key) => key.slice('workspace.'.length)));
    const live = index.filter((meta) => ids.has(meta.id));
    // Workspaces written by another tab (or recovered from a backup) are picked up here.
    const missing = [...ids].filter((id) => !live.some((meta) => meta.id === id));
    for (const id of missing) {
      const workspace = await this.getWorkspace(id);
      if (workspace) live.push(workspaceMeta(workspace));
    }
    if (missing.length || live.length !== index.length) await this.writeIndex(live);
    return sortWorkspaces(live);
  }

  private async writeIndex(items: WorkspaceMeta[]): Promise<void> {
    await this.store.set(INDEX_KEY, sortWorkspaces(items));
  }

  private async updateIndex(meta: WorkspaceMeta): Promise<void> {
    const stored = await this.store.get(INDEX_KEY);
    const index = (Array.isArray(stored) ? stored.filter(isMeta) : []).filter(
      (item) => item.id !== meta.id,
    );
    await this.writeIndex([...index, meta]);
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return migrateWorkspace(await this.store.get(WORKSPACE_KEY(id)), deserializeAuth);
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    await this.store.set(WORKSPACE_KEY(workspace.id), sanitizeWorkspace(workspace));
    await this.updateIndex(workspaceMeta(workspace));
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.store.delete(WORKSPACE_KEY(id));
    await this.store.delete(DRAFTS_KEY(id));
    await this.store.delete(HISTORY_KEY(id));
    const stored = await this.store.get(INDEX_KEY);
    const index = Array.isArray(stored) ? stored.filter(isMeta) : [];
    await this.writeIndex(index.filter((item) => item.id !== id));
    if ((await this.getActiveWorkspaceId()) === id) await this.store.delete(ACTIVE_KEY);
  }

  async getActiveWorkspaceId(): Promise<string | null> {
    const value = await this.store.get(ACTIVE_KEY);
    return typeof value === 'string' && value ? value : null;
  }

  async setActiveWorkspaceId(id: string): Promise<void> {
    await this.store.set(ACTIVE_KEY, id);
  }

  async getDrafts(workspaceId: string): Promise<Record<string, HttpRequest>> {
    const value = await this.store.get(DRAFTS_KEY(workspaceId));
    if (!value || typeof value !== 'object') return {};
    const drafts: Record<string, HttpRequest> = {};
    for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const parentId = (raw as { parentId?: unknown }).parentId;
      drafts[id] = normalizeRequest(
        { ...(raw as Record<string, unknown>), id },
        typeof parentId === 'string' ? parentId : null,
        deserializeAuth,
      );
    }
    return drafts;
  }

  async saveDrafts(workspaceId: string, drafts: Record<string, HttpRequest>): Promise<void> {
    const key = DRAFTS_KEY(workspaceId);
    if (Object.keys(drafts).length === 0) {
      await this.store.delete(key);
      return;
    }
    await this.store.set(
      key,
      Object.fromEntries(Object.entries(drafts).map(([id, draft]) => [id, sanitizeRequest(draft)])),
    );
  }
}

const isHistoryEntry = (value: unknown): value is HistoryEntry =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as HistoryEntry).id === 'string' &&
  typeof (value as HistoryEntry).requestId === 'string' &&
  typeof (value as HistoryEntry).timestamp === 'string';

/** Request history, newest first, per workspace. Only unresolved URLs are recorded. */
export class KeyValueHistoryRepository implements HistoryRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly limit = HISTORY_LIMIT,
  ) {}

  async list(workspaceId: string): Promise<HistoryEntry[]> {
    const value = await this.store.get(HISTORY_KEY(workspaceId));
    return Array.isArray(value) ? value.filter(isHistoryEntry) : [];
  }

  async add(workspaceId: string, entry: HistoryEntry): Promise<HistoryEntry[]> {
    const entries = [entry, ...(await this.list(workspaceId))].slice(0, this.limit);
    await this.store.set(HISTORY_KEY(workspaceId), entries);
    return entries;
  }

  async clear(workspaceId: string): Promise<void> {
    await this.store.delete(HISTORY_KEY(workspaceId));
  }
}
