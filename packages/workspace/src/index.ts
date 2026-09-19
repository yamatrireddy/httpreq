import { createEmptyRequest, type Workspace } from '@httpreq/shared';

export const DEFAULT_WORKSPACE_ID = 'default';

export const createDefaultWorkspace = (): Workspace => ({
  id: DEFAULT_WORKSPACE_ID,
  name: 'My Workspace',
  requests: [createEmptyRequest()],
  updatedAt: new Date().toISOString(),
});

export const validateWorkspace = (value: unknown): value is Workspace => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Workspace>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.requests) &&
    typeof candidate.updatedAt === 'string'
  );
};
