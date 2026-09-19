export * from './model';
import type { HistoryEntry, HttpMethod, HttpRequest, Workspace } from './model';

export type PreparedBody =
  | { kind: 'text'; text: string }
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'multipart'; parts: PreparedPart[] };

export type PreparedPart =
  | { name: string; value: string }
  | { name: string; fileName: string; contentType: string; bytes: Uint8Array };

/** Transport options derived from request settings; each runtime honours what it can. */
export interface PreparedOptions {
  followRedirects: boolean;
  verifyTls: boolean;
  sendCookies: boolean;
  /** 0 reads the whole body. */
  maxResponseBytes: number;
}

/**
 * The final, fully resolved request produced by the execution pipeline: variables substituted,
 * authorization applied, body encoded. It is the only request shape that crosses into a runtime
 * (and over Electron IPC), so saved requests are never mutated with resolved values.
 */
export interface PreparedRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: PreparedBody;
  options: PreparedOptions;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  durationMs: number;
  sizeBytes: number;
  /** The body was cut at the request's response size limit. */
  truncated?: boolean;
}

export interface HttpRuntime {
  readonly kind: 'browser' | 'electron';
  execute(request: PreparedRequest, signal?: AbortSignal): Promise<HttpResponse>;
}

export interface WorkspaceRepository {
  getWorkspace(id: string): Promise<Workspace | null>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  /** Unsaved edits of open requests, kept so they survive a reload. */
  getDrafts(workspaceId: string): Promise<Record<string, HttpRequest>>;
  saveDrafts(workspaceId: string, drafts: Record<string, HttpRequest>): Promise<void>;
}

export interface HistoryRepository {
  list(workspaceId: string): Promise<HistoryEntry[]>;
  /** Adds an entry and returns the retained list, newest first. */
  add(workspaceId: string, entry: HistoryEntry): Promise<HistoryEntry[]>;
  clear(workspaceId: string): Promise<void>;
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

/** Plain-object error form that survives Electron IPC structured cloning. */
export interface SerializedAppError {
  code: AppErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: SerializedAppError };

export const serializeError = (error: unknown, fallback: SerializedAppError): SerializedAppError =>
  error instanceof AppError ? { code: error.code, message: error.message } : fallback;

/** Project documentation; the only external URL the desktop shell will open. */
export const DOCUMENTATION_URL = 'https://github.com/yamatrireddy/httpreq';

/**
 * Lightweight reachability probe (an empty 204 response, as used for captive-portal detection).
 * It is only requested on connectivity changes, never on a continuous timer while online.
 */
export const CONNECTIVITY_PROBE_URL = 'https://www.gstatic.com/generate_204';

/** Window and edit actions the renderer may ask the Electron main process to perform. */
export const WINDOW_ACTIONS = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'select-all',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'toggle-fullscreen',
  'toggle-devtools',
  'quit',
] as const;

export type WindowAction = (typeof WINDOW_ACTIONS)[number];

export const isWindowAction = (value: unknown): value is WindowAction =>
  typeof value === 'string' && (WINDOW_ACTIONS as readonly string[]).includes(value);

/** Application commands the native (macOS) menu forwards to the renderer. */
export const MENU_COMMANDS = [
  'request.new',
  'request.close',
  'request.save',
  'request.send',
  'request.duplicate',
  'request.focus-url',
  'view.response-right',
  'view.response-bottom',
  'view.toggle-sidebar',
  'view.toggle-status-bar',
  'tools.settings',
  'help.shortcuts',
  'help.about',
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

export const isMenuCommand = (value: unknown): value is MenuCommand =>
  typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value);

export interface DesktopWindowState {
  maximized: boolean;
  fullscreen: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  versions: { electron: string; chrome: string; node: string };
}

export interface TitleBarTheme {
  /** `#rrggbb` background of the native window-controls overlay. */
  color: string;
  /** `#rrggbb` color of the native window-control symbols. */
  symbolColor: string;
}

/** Desktop-shell operations exposed by the preload. Every call is validated in the main process. */
export interface DesktopBridge {
  readonly platform: string;
  getAppInfo(): Promise<AppInfo>;
  getWindowState(): Promise<DesktopWindowState>;
  performAction(action: WindowAction): void;
  setTitleBarTheme(theme: TitleBarTheme): void;
  /** Opens an allow-listed documentation URL in the system browser. */
  openExternal(url: string): void;
  /** Opens an OAuth 2.0 authorization page (http/https only) in the system browser. */
  openAuthorizationUrl(url: string): void;
  /** Resolves whether the internet is reachable, using a native lightweight probe. */
  checkConnectivity(): Promise<boolean>;
  onWindowStateChange(listener: (state: DesktopWindowState) => void): () => void;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
}

/** Operations the Electron preload exposes to the renderer as `window.httpreq`. */
export interface HttpReqBridge {
  executeHttp(request: PreparedRequest, executionId: string): Promise<IpcResult<HttpResponse>>;
  cancelHttp(executionId: string): void;
  desktop?: DesktopBridge;
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
