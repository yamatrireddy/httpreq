export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type RequestBody = { type: 'none'; content: '' } | { type: 'json'; content: string };

export type AuthConfig =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; key: string; value: string; location: 'header' | 'query' };

export interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  body: RequestBody;
  auth: AuthConfig;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  durationMs: number;
  sizeBytes: number;
}

export interface HttpRuntime {
  readonly kind: 'browser' | 'electron';
  execute(request: HttpRequest, signal?: AbortSignal): Promise<HttpResponse>;
}

export interface Workspace {
  id: string;
  name: string;
  requests: HttpRequest[];
  updatedAt: string;
}

export interface WorkspaceRepository {
  getWorkspace(id: string): Promise<Workspace | null>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
}

export type AppErrorCode =
  | 'NETWORK_ERROR'
  | 'DNS_ERROR'
  | 'CONNECTION_TIMEOUT'
  | 'TLS_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export interface WebSocketRuntime {
  connect(config: unknown): Promise<unknown>;
}

export interface SshRuntime {
  connect(config: unknown): Promise<unknown>;
}

export interface FileTransferRuntime {
  list(path: string): Promise<unknown[]>;
}

export interface TunnelRuntime {
  open(config: unknown): Promise<unknown>;
}

export type Feature = 'rest' | 'websocket' | 'ssh' | 'file-transfer' | 'tunnel';

export interface EntitlementService {
  hasFeature(feature: Feature): boolean;
}

export const createId = () => crypto.randomUUID();

export const createEmptyRequest = (): HttpRequest => ({
  id: createId(),
  name: 'Untitled Request',
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  body: { type: 'none', content: '' },
  auth: { type: 'none' },
});
