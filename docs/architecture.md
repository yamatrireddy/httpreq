# Architecture

## Runtime boundary

The shared UI depends only on `HttpRuntime`, `WorkspaceRepository` and `HistoryRepository`. It never imports Electron or Node APIs. At startup, the web entry point selects `BrowserHttpRuntime`; the same renderer selects `ElectronHttpRuntime` when the preload bridge is present.

The Electron renderer has `contextIsolation`, sandboxing, and disabled Node integration. The preload exposes the typed `HttpReqBridge` (`executeHttp` and `cancelHttp`). Runtimes receive only the final `PreparedRequest` (variables resolved, authorization applied, body encoded); the main process validates its structure and permits only HTTP and HTTPS URLs before using Electron native networking. API requests run in dedicated sessions (`persist:httpreq-api`), so they have their own cookie jar and never pass through the app's CSP header injection; requests that turn off TLS verification use a second session whose certificate check accepts everything, so the relaxed check never applies to verified requests. Handlers never throw across IPC, because Electron strips custom error classes and their codes; they return an `IpcResult` envelope that `ElectronHttpRuntime` turns back into an `AppError`. In-flight native requests are keyed by sender and execution id, so a window can cancel only its own requests.

The preload also exposes an optional `desktop` bridge for the window shell: app info, window state, a fixed list of window/edit actions (`WINDOW_ACTIONS`), title-bar overlay colours, opening the project documentation, and a connectivity probe. The main process accepts these only from the top-level app document (dev-server origin or packaged `file://`), validates every payload (`#rrggbb` colours, an allow-listed documentation URL, known action names), and keeps the privileged work—`shell.openExternal`, `net.fetch`, zoom, full screen, quitting—on its side. Renderer navigation away from the app is blocked.

The window uses `titleBarStyle: 'hidden'`. The React title bar is the drag region and hosts the application menu on Windows and Linux, while the OS keeps drawing the real window controls (the window-controls overlay, recoloured to match the theme, or the macOS traffic lights), so snapping, double-click maximise and accessibility stay native. macOS keeps a native global menu that forwards the same command ids (`MENU_COMMANDS`) to the renderer, so both menus run one command table.

The production CSP forbids inline scripts. When `VITE_DEV_SERVER_URL` is set, `'unsafe-inline'` is added to `script-src` so Vite's React Fast Refresh preamble can run. New native capabilities should follow this narrow interface-and-adapter pattern.

## Request model and execution pipeline

A workspace (version 2) holds collections, folders and requests in flat arrays linked by `parentId` (array order is sibling order), plus environments and the ids of open tabs. Everything is addressed by id: tabs, the breadcrumb, history entries and authorization inheritance never depend on names or URLs, so renaming or moving a node updates every view at once. Version 1 workspaces (a flat list of open requests) are migrated on load, and stored or imported data is normalized before use.

Sending a request runs one shared pipeline (`@httpreq/api-client`), identical on web and desktop:

```text
saved request → variable resolution → authorization resolution → pre-request scripts
  → final request builder → platform runtime (browser fetch | Electron net) → response processing
  → post-response scripts → history
```

`{{variables}}` resolve from the active environment (with nesting and built-in dynamic values such as `{{$guid}}`) immediately before execution. The saved request is never mutated; resolved values exist only in the `PreparedRequest`, and history stores the unresolved URL. Query parameters live in the URL; the Params table mirrors it without encoding, so variables round-trip untouched.

Authorization is a provider registry. Each scheme (`none`, `inherit`, API key, Bearer, Basic, Digest, JWT Bearer, OAuth 2.0) implements `AuthProvider`: `validate`, `resolve`, `applyToRequest`, `appliedHeaders` (to flag conflicts with manual headers, which the scheme replaces rather than duplicating), optional `handleChallenge` (Digest answers one 401), `serialize` (drops literal secrets, keeps `{{references}}`) and `deserialize`. The UI mirrors it with an editor registry, so a new scheme (e.g. NTLM on desktop) is a provider plus an editor; neither the pipeline nor the Authorization panel changes. "Inherit from Parent" resolves to the nearest folder or collection, walking up the tree, whose scheme is not `inherit`. JWTs are signed per request with Web Crypto; OAuth 2.0 token requests go through the platform runtime, and authorization-code grants use PKCE with a paste-the-redirect flow (the desktop opens the page through an http/https-only bridge method). Script execution is not implemented: `ScriptRunner` is the seam, and scripts are stored but not run.

## Package responsibilities

- `shared`: dependency-free domain contracts and stable extension interfaces.
- `api-client`: variable resolution, the authorization provider registry, the execution pipeline, cURL export, and runtime adapters.
- `workspace`: workspace construction, migration and normalization, URL/params sync, and pure tree operations (rename, move, duplicate, delete).
- `storage`: persistence adapters (workspace, drafts, history); currently local storage only.
- `ui`: visual components and ephemeral workbench state.
- `apps/web`: composition root for the shared React application.
- `apps/desktop`: Electron security boundary and native implementations.

## State and persistence

Zustand owns the saved workspace, open tabs, explorer state and responses. Request edits go to per-request drafts, not the workspace: a tab is *modified* while it has a draft (dropped as soon as it matches the saved request again), *saving*/*save failed* during an explicit save (Ctrl/Cmd+S), and *saved* otherwise. Drafts are written at most about once a second so they survive a reload; structural changes (tree, tabs, environments) are written after a short debounce; so typing never writes the workspace. Name and parent are structural and are updated on the saved request and its draft together. Application-level UI preferences (response position, per-layout split ratio, sidebar and status-bar visibility) live in a separate store persisted under `httpreq.preferences`, never in workspace or request data. Keyboard shortcuts are declared once as commands (`HttpReqApp`) and dispatched by a single capture-phase listener (`useShortcutManager`); the menubar, the macOS menu and the shortcuts dialog read the same table.

Performance notes: the request/response splitter writes its ratio to a CSS variable while dragging and commits to the store once on release, so editors are never re-rendered or remounted by resizing; switching layout only changes CSS. Connectivity state is subscribed to by the status bar alone. The repository abstraction owns durable workspace data, allowing a future IndexedDB, filesystem, or cloud implementation without changing UI components. Response payloads and files chosen for binary or multipart bodies are intentionally not persisted.

Literal secrets (auth fields each provider marks as secret, headers marked secret, secret environment values) are removed by the local repository before serialization; `{{variable}}` references are kept, so secrets live only in session memory. Exports use the same sanitization. A future Electron repository should store those values through an OS-native credential vault and persist only opaque references in workspace JSON.

## Dependency choices

- React + Vite: shared typed renderer and fast builds.
- Mantine: compact accessible controls, shell, tabs, notifications, and color schemes.
- Zustand: small client-state store without reducer boilerplate.
- TanStack Query: server-state foundation for future workspace/cloud operations.
- Monaco Editor: structured JSON request and response editing, search, and copy behavior.
- Electron: native networking and future desktop-only connectivity adapters.
- Vitest + Testing Library: unit and future component testing on the Vite toolchain.
- ESLint + Prettier + TypeScript project references: consistent strict workspace checks.

## Extension rules

WebSocket, SSH, file-transfer, and tunnel interfaces already exist in `shared`; implementations must live outside React. Secrets must never be logged or stored in workspace JSON. Native functionality must be allow-listed through preload IPC rather than exposing generic filesystem, process, or network primitives.
