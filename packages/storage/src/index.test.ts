import { describe, expect, it } from 'vitest';
import { LocalWorkspaceRepository } from './index';
import { createDefaultWorkspace } from '@httpreq/workspace';

describe('LocalWorkspaceRepository', () => {
  it('round trips workspace data', async () => {
    const storage = new Map<string, string>();
    const adapter: Storage = {
      length: 0,
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => void storage.delete(key),
      setItem: (key, value) => void storage.set(key, value),
    };
    const repository = new LocalWorkspaceRepository(adapter);
    const workspace = createDefaultWorkspace();
    await repository.saveWorkspace(workspace);
    expect(await repository.getWorkspace(workspace.id)).toEqual(workspace);
  });

  it('never persists authentication secrets', async () => {
    const values = new Map<string, string>();
    const storage = {
      length: 0,
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: () => null,
      removeItem: (key: string) => void values.delete(key),
      setItem: (key: string, value: string) => void values.set(key, value),
    } satisfies Storage;
    const repository = new LocalWorkspaceRepository(storage);
    const workspace = createDefaultWorkspace();
    workspace.requests[0]!.auth = { type: 'bearer', token: 'never-write-this' };
    await repository.saveWorkspace(workspace);
    expect([...values.values()][0]).not.toContain('never-write-this');
  });
});
