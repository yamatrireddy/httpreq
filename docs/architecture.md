# Architecture

## Runtime boundary

The shared UI depends only on `HttpRuntime` and `WorkspaceRepository`. It never imports Electron or Node APIs. At startup, the web entry point selects `BrowserHttpRuntime`; the same renderer selects `ElectronHttpRuntime` when the preload bridge is present.

The Electron renderer has `contextIsolation`, sandboxing, and disabled Node integration. The preload exposes one typed request operation. The main process validates incoming data and permits only HTTP and HTTPS URLs before using Electron native networking. New native capabilities should follow this narrow interface-and-adapter pattern.

## Package responsibilities

- `shared`: dependency-free domain contracts and stable extension interfaces.
- `api-client`: request validation/preparation, authentication application, and runtime adapters.
- `workspace`: workspace construction and import validation.
- `storage`: persistence adapters; currently local storage only.
- `ui`: visual components and ephemeral workbench state.
- `apps/web`: composition root for the shared React application.
- `apps/desktop`: Electron security boundary and native implementations.

## State and persistence

Zustand owns interactive request tabs and responses. The repository abstraction owns durable workspace data, allowing a future IndexedDB, filesystem, or cloud implementation without changing UI components. Response payloads are intentionally not persisted.

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
