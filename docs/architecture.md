# Architecture

## Runtime boundary

The shared UI depends only on `HttpRuntime` and `WorkspaceRepository`. It never imports Electron or Node APIs. At startup, the web entry point selects `BrowserHttpRuntime`; the same renderer selects `ElectronHttpRuntime` when the preload bridge is present.

The Electron renderer has `contextIsolation`, sandboxing, and disabled Node integration. The preload exposes the typed `HttpReqBridge` (`executeHttp` and `cancelHttp`). The main process validates incoming data and permits only HTTP and HTTPS URLs before using Electron native networking. Handlers never throw across IPC, because Electron strips custom error classes and their codes; they return an `IpcResult` envelope that `ElectronHttpRuntime` turns back into an `AppError`. In-flight native requests are keyed by sender and execution id, so a window can cancel only its own requests.

The preload also exposes an optional `desktop` bridge for the window shell: app info, window state, a fixed list of window/edit actions (`WINDOW_ACTIONS`), title-bar overlay colours, opening the project documentation, and a connectivity probe. The main process accepts these only from the top-level app document (dev-server origin or packaged `file://`), validates every payload (`#rrggbb` colours, an allow-listed documentation URL, known action names), and keeps the privileged work—`shell.openExternal`, `net.fetch`, zoom, full screen, quitting—on its side. Renderer navigation away from the app is blocked.

The window uses `titleBarStyle: 'hidden'`. The React title bar is the drag region and hosts the application menu on Windows and Linux, while the OS keeps drawing the real window controls (the window-controls overlay, recoloured to match the theme, or the macOS traffic lights), so snapping, double-click maximise and accessibility stay native. macOS keeps a native global menu that forwards the same command ids (`MENU_COMMANDS`) to the renderer, so both menus run one command table.

The production CSP forbids inline scripts. When `VITE_DEV_SERVER_URL` is set, `'unsafe-inline'` is added to `script-src` so Vite's React Fast Refresh preamble can run. New native capabilities should follow this narrow interface-and-adapter pattern.

## Package responsibilities

- `shared`: dependency-free domain contracts and stable extension interfaces.
- `api-client`: request validation/preparation, authentication application, and runtime adapters.
- `workspace`: workspace construction and import validation.
- `storage`: persistence adapters; currently local storage only.
- `ui`: visual components and ephemeral workbench state.
- `apps/web`: composition root for the shared React application.
- `apps/desktop`: Electron security boundary and native implementations.

## State and persistence

Zustand owns interactive request tabs and responses. Application-level UI preferences (response position, per-layout split ratio, sidebar and status-bar visibility) live in a separate store persisted under `httpreq.preferences`, never in workspace or request data. Keyboard shortcuts are declared once as commands (`HttpReqApp`) and dispatched by a single capture-phase listener (`useShortcutManager`); the menubar, the macOS menu and the shortcuts dialog read the same table.

Performance notes: the request/response splitter writes its ratio to a CSS variable while dragging and commits to the store once on release, so editors are never re-rendered or remounted by resizing; switching layout only changes CSS. Connectivity state is subscribed to by the status bar alone. The repository abstraction owns durable workspace data, allowing a future IndexedDB, filesystem, or cloud implementation without changing UI components. Response payloads are intentionally not persisted.

Passwords, bearer tokens, and API-key values are removed by the local repository before serialization. A future Electron repository should store those values through an OS-native credential vault and persist only opaque references in workspace JSON.

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
