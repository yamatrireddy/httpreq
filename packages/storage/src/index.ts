import type { Workspace, WorkspaceRepository } from '@httpreq/shared';
import { validateWorkspace } from '@httpreq/workspace';

const PREFIX = 'httpreq.workspace.';

const withoutSecrets = (workspace: Workspace): Workspace => ({
  ...workspace,
  requests: workspace.requests.map((request) => ({
    ...request,
    auth:
      request.auth.type === 'basic'
        ? { ...request.auth, password: '' }
        : request.auth.type === 'bearer'
          ? { ...request.auth, token: '' }
          : request.auth.type === 'api-key'
            ? { ...request.auth, value: '' }
            : request.auth,
  })),
});

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  async getWorkspace(id: string): Promise<Workspace | null> {
    const raw = this.storage.getItem(`${PREFIX}${id}`);
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return validateWorkspace(value) ? value : null;
    } catch {
      return null;
    }
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.storage.setItem(`${PREFIX}${workspace.id}`, JSON.stringify(withoutSecrets(workspace)));
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.storage.removeItem(`${PREFIX}${id}`);
  }
}
