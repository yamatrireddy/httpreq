import {
  createCollection,
  createEmptyBody,
  createEmptyRequest,
  createEnvironment,
  createId,
  DEFAULT_REQUEST_SETTINGS,
  isHttpMethod,
  TEXT_CONTENT_TYPES,
  BODY_MODES,
  WORKSPACE_VERSION,
  type AuthConfig,
  type Collection,
  type Environment,
  type EnvironmentVariable,
  type FileReference,
  type Folder,
  type HttpRequest,
  type KeyValueItem,
  type MultipartField,
  type RequestBody,
  type RequestSettings,
  type Workspace,
} from '@httpreq/shared';
import { urlWithParams } from './query';

export * from './query';
export * from './tree';

export const DEFAULT_WORKSPACE_ID = 'default';

/** A first-run workspace with one example collection, request and environment. */
export const createDefaultWorkspace = (): Workspace => {
  const collection = createCollection('Sample API');
  const request: HttpRequest = {
    ...createEmptyRequest(collection.id),
    name: 'Get request',
    url: '{{base_url}}/get',
  };
  const environment: Environment = {
    ...createEnvironment('Development'),
    variables: [
      { id: createId(), key: 'base_url', value: 'https://httpbin.org', enabled: true, secret: false },
    ],
  };
  return {
    version: WORKSPACE_VERSION,
    id: DEFAULT_WORKSPACE_ID,
    name: 'My Workspace',
    collections: [collection],
    folders: [],
    requests: [request],
    environments: [environment],
    activeEnvironmentId: environment.id,
    openRequestIds: [request.id],
    updatedAt: new Date().toISOString(),
  };
};

/* ---------- Normalization of untrusted stored or imported data ---------- */

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === 'object';
const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const id = (value: unknown) => (typeof value === 'string' && value ? value : createId());
const list = (value: unknown) => (Array.isArray(value) ? value.filter(isObject) : []);

/** Validates an auth object; storage passes the provider registry's stricter deserializer. */
export type AuthNormalizer = (value: unknown) => AuthConfig | null;

const basicAuthNormalizer: AuthNormalizer = (value) =>
  isObject(value) && typeof value.type === 'string' ? (value as AuthConfig) : null;

const normalizeKeyValue = (value: Json): KeyValueItem => ({
  id: id(value.id),
  key: str(value.key),
  value: str(value.value),
  enabled: bool(value.enabled, true),
  ...(typeof value.description === 'string' && value.description
    ? { description: value.description }
    : {}),
  ...(value.secret === true ? { secret: true } : {}),
});

const normalizeFile = (value: unknown): FileReference | null =>
  isObject(value) && typeof value.name === 'string'
    ? { id: id(value.id), name: value.name, size: num(value.size, 0), type: str(value.type) }
    : null;

const normalizeBody = (value: unknown): RequestBody => {
  const body = createEmptyBody();
  if (!isObject(value)) return body;
  // Version 1 stored `{ type: 'none' | 'json', content }`.
  if (typeof value.type === 'string' && !('mode' in value)) {
    return value.type === 'json' ? { ...body, mode: 'json', json: str(value.content) } : body;
  }
  const mode = (BODY_MODES as readonly string[]).includes(str(value.mode))
    ? (value.mode as RequestBody['mode'])
    : 'none';
  const textContentType = (TEXT_CONTENT_TYPES as readonly string[]).includes(
    str(value.textContentType),
  )
    ? (value.textContentType as RequestBody['textContentType'])
    : 'text/plain';
  return {
    mode,
    json: str(value.json),
    text: str(value.text),
    textContentType,
    formUrlEncoded: list(value.formUrlEncoded).map(normalizeKeyValue),
    multipart: list(value.multipart).map(
      (field): MultipartField => ({
        ...normalizeKeyValue(field),
        kind: field.kind === 'file' ? 'file' : 'text',
        file: normalizeFile(field.file),
      }),
    ),
    binary: normalizeFile(value.binary),
  };
};

const normalizeSettings = (value: unknown): RequestSettings => {
  const settings = isObject(value) ? value : {};
  const defaults = DEFAULT_REQUEST_SETTINGS;
  return {
    timeoutMs: num(settings.timeoutMs, defaults.timeoutMs),
    followRedirects: bool(settings.followRedirects, defaults.followRedirects),
    verifyTls: bool(settings.verifyTls, defaults.verifyTls),
    sendCookies: bool(settings.sendCookies, defaults.sendCookies),
    responseSizeLimitMb: num(settings.responseSizeLimitMb, defaults.responseSizeLimitMb),
  };
};

export const normalizeRequest = (
  value: Json,
  parentId: string | null,
  normalizeAuth: AuthNormalizer = basicAuthNormalizer,
): HttpRequest => {
  const scripts = isObject(value.scripts) ? value.scripts : {};
  return {
    id: id(value.id),
    name: str(value.name).trim() || 'Untitled Request',
    parentId,
    method: isHttpMethod(value.method) ? value.method : 'GET',
    url: str(value.url),
    params: list(value.params).map(normalizeKeyValue),
    headers: list(value.headers).map(normalizeKeyValue),
    body: normalizeBody(value.body),
    auth: normalizeAuth(value.auth) ?? (parentId ? { type: 'inherit' } : { type: 'none' }),
    settings: normalizeSettings(value.settings),
    scripts: {
      preRequest: str(scripts.preRequest),
      postResponse: str(scripts.postResponse),
      tests: str(scripts.tests),
    },
    description: str(value.description),
  };
};

const normalizeVariable = (value: Json): EnvironmentVariable => ({
  id: id(value.id),
  key: str(value.key),
  value: str(value.value),
  enabled: bool(value.enabled, true),
  secret: bool(value.secret, false),
});

/**
 * Turns stored or imported JSON into a valid current-version workspace, migrating version 1 (a
 * flat list of open requests) and repairing dangling references. Returns `null` when the value
 * is not a workspace at all.
 */
export const migrateWorkspace = (
  value: unknown,
  normalizeAuth: AuthNormalizer = basicAuthNormalizer,
): Workspace | null => {
  if (!isObject(value) || typeof value.id !== 'string' || !Array.isArray(value.requests)) {
    return null;
  }
  const collections: Collection[] = list(value.collections).map((item) => ({
    id: id(item.id),
    name: str(item.name).trim() || 'Collection',
    description: str(item.description),
    auth: normalizeAuth(item.auth) ?? { type: 'none' },
  }));
  // Keep only folders reachable from a collection (orphaned chains are dropped).
  const reachable = new Set(collections.map((item) => item.id));
  const rawFolders = list(value.folders).filter((item) => typeof item.id === 'string');
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of rawFolders) {
      if (!reachable.has(str(item.id)) && reachable.has(str(item.parentId))) {
        reachable.add(str(item.id));
        grew = true;
      }
    }
  }
  const folders: Folder[] = rawFolders
    .filter((item) => reachable.has(str(item.id)) && str(item.id) !== str(item.parentId))
    .map((item) => ({
      id: str(item.id),
      name: str(item.name).trim() || 'Folder',
      parentId: str(item.parentId),
      description: str(item.description),
      auth: normalizeAuth(item.auth) ?? { type: 'inherit' },
    }));
  const liveContainers = new Set([...collections, ...folders].map((item) => item.id));

  const version1 = value.version !== WORKSPACE_VERSION;
  const requests = list(value.requests).map((item) => {
    const parentId = typeof item.parentId === 'string' && liveContainers.has(item.parentId) ? item.parentId : null;
    const request = normalizeRequest(item, parentId, normalizeAuth);
    // Version 1 appended enabled params at send time; they now live in the URL.
    return version1 ? { ...request, url: urlWithParams(request.url, request.params) } : request;
  });
  const requestIds = new Set(requests.map((item) => item.id));

  const environments: Environment[] = list(value.environments).map((item) => ({
    id: id(item.id),
    name: str(item.name).trim() || 'Environment',
    variables: list(item.variables).map(normalizeVariable),
  }));
  const activeEnvironmentId = environments.some((item) => item.id === value.activeEnvironmentId)
    ? (value.activeEnvironmentId as string)
    : null;
  const open = version1
    ? requests.map((item) => item.id)
    : (Array.isArray(value.openRequestIds) ? value.openRequestIds : []).filter(
        (openId): openId is string => typeof openId === 'string' && requestIds.has(openId),
      );

  return {
    version: WORKSPACE_VERSION,
    id: value.id,
    name: str(value.name).trim() || 'My Workspace',
    collections,
    folders,
    requests,
    environments,
    activeEnvironmentId,
    openRequestIds: [...new Set(open)],
    updatedAt: str(value.updatedAt, new Date().toISOString()),
  };
};

export const validateWorkspace = (value: unknown): value is Workspace =>
  isObject(value) &&
  value.version === WORKSPACE_VERSION &&
  typeof value.id === 'string' &&
  Array.isArray(value.collections) &&
  Array.isArray(value.folders) &&
  Array.isArray(value.requests) &&
  Array.isArray(value.environments) &&
  Array.isArray(value.openRequestIds);
