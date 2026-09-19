import type {
  HistoryEntry,
  HistoryRepository,
  HttpRequest,
  KeyValueItem,
  Workspace,
  WorkspaceRepository,
} from '@httpreq/shared';
import { deserializeAuth, isTemplateOnly, serializeAuth } from '@httpreq/api-client';
import { migrateWorkspace, normalizeRequest } from '@httpreq/workspace';

const PREFIX = 'httpreq.workspace.';
const DRAFTS_PREFIX = 'httpreq.drafts.';
const HISTORY_PREFIX = 'httpreq.history.';

/** Maximum number of history entries kept per workspace. */
export const HISTORY_LIMIT = 200;

/** A literal secret is dropped; a `{{variable}}` reference is kept (the secret lives elsewhere). */
const withoutSecretValue = <T extends { value: string; secret?: boolean }>(item: T): T =>
  item.secret && item.value && !isTemplateOnly(item.value) ? { ...item, value: '' } : item;

const sanitizeRequest = (request: HttpRequest): HttpRequest => ({
  ...request,
  auth: serializeAuth(request.auth),
  headers: request.headers.map((item: KeyValueItem) => withoutSecretValue(item)),
});

/**
 * Workspace data as it may be written to disk: no passwords, tokens, API-key values, secret
 * headers or secret environment values. A future Electron repository should keep those in the OS
 * credential vault and persist only references.
 */
export const sanitizeWorkspace = (workspace: Workspace): Workspace => ({
  ...workspace,
  collections: workspace.collections.map((item) => ({ ...item, auth: serializeAuth(item.auth) })),
  folders: workspace.folders.map((item) => ({ ...item, auth: serializeAuth(item.auth) })),
  requests: workspace.requests.map(sanitizeRequest),
  environments: workspace.environments.map((environment) => ({
    ...environment,
    variables: environment.variables.map(withoutSecretValue),
  })),
});

const read = (storage: Storage, key: string): unknown => {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  async getWorkspace(id: string): Promise<Workspace | null> {
    return migrateWorkspace(read(this.storage, `${PREFIX}${id}`), deserializeAuth);
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.storage.setItem(`${PREFIX}${workspace.id}`, JSON.stringify(sanitizeWorkspace(workspace)));
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.storage.removeItem(`${PREFIX}${id}`);
    this.storage.removeItem(`${DRAFTS_PREFIX}${id}`);
    this.storage.removeItem(`${HISTORY_PREFIX}${id}`);
  }

  async getDrafts(workspaceId: string): Promise<Record<string, HttpRequest>> {
    const value = read(this.storage, `${DRAFTS_PREFIX}${workspaceId}`);
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
    const key = `${DRAFTS_PREFIX}${workspaceId}`;
    if (Object.keys(drafts).length === 0) {
      this.storage.removeItem(key);
      return;
    }
    const sanitized = Object.fromEntries(
      Object.entries(drafts).map(([id, draft]) => [id, sanitizeRequest(draft)]),
    );
    this.storage.setItem(key, JSON.stringify(sanitized));
  }
}

const isHistoryEntry = (value: unknown): value is HistoryEntry =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as HistoryEntry).id === 'string' &&
  typeof (value as HistoryEntry).requestId === 'string' &&
  typeof (value as HistoryEntry).timestamp === 'string';

/** Request history, newest first. Only unresolved URLs are recorded, never resolved secrets. */
export class LocalHistoryRepository implements HistoryRepository {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly limit = HISTORY_LIMIT,
  ) {}

  async list(workspaceId: string): Promise<HistoryEntry[]> {
    const value = read(this.storage, `${HISTORY_PREFIX}${workspaceId}`);
    return Array.isArray(value) ? value.filter(isHistoryEntry) : [];
  }

  async add(workspaceId: string, entry: HistoryEntry): Promise<HistoryEntry[]> {
    const entries = [entry, ...(await this.list(workspaceId))].slice(0, this.limit);
    this.storage.setItem(`${HISTORY_PREFIX}${workspaceId}`, JSON.stringify(entries));
    return entries;
  }

  async clear(workspaceId: string): Promise<void> {
    this.storage.removeItem(`${HISTORY_PREFIX}${workspaceId}`);
  }
}
