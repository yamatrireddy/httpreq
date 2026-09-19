# HttpReq

HttpReq is a local-first API testing application with one React interface for the web and Electron. This repository implements the product foundation and the first REST-client slice: multiple request tabs, GET/POST/PUT/PATCH/DELETE, query parameters, headers, JSON bodies, Basic/Bearer/API-key authentication, cancellation in the browser runtime, and a formatted response viewer.

## Project structure

```text
apps/
  web/             Vite renderer and browser entry point
  desktop/         Hardened Electron main process and preload bridge
packages/
  ui/              Mantine workbench, theme, and Zustand state
  api-client/      Request preparation and browser/Electron adapters
  workspace/       Workspace model helpers and validation
  storage/         Local WorkspaceRepository implementation
  shared/          Runtime contracts, domain models, and errors
```

See [docs/architecture.md](docs/architecture.md) for boundaries and security decisions.

## Run

Requires Node.js 22 or newer and npm 10 or newer.

```bash
npm install
npm run dev:web
```

The web app opens at `http://localhost:5173`. Browser requests are subject to the destination server's CORS policy.

For Electron development:

```bash
npm run dev:desktop
```

For a production build and local desktop launch:

```bash
npm run build
npm run start --workspace=@httpreq/desktop
```

To create installers with electron-builder (NSIS on Windows, DMG/ZIP on macOS, AppImage/deb on Linux; build on the target OS), run:

```bash
npm run package:desktop
```

Output goes to `apps/desktop/release/`. The app icon master is `apps/desktop/build/icon.svg`; after editing it, regenerate the `.ico`, `.icns`, Linux PNG set, runtime window icon and web favicon with `npm run icons --workspace=@httpreq/desktop`.

## Workspace and keyboard

- The response panel sits to the **right** of or **below** the request (View menu, the layout toggle at the end of the tab strip, or the status bar). Drag the splitter to resize, double-click it or press Enter on it to reset. Layout, split sizes, sidebar and status bar visibility are application-wide preferences stored under `httpreq.preferences`, separate from workspace data.
- The status bar shows connectivity: `navigator.onLine` gives the instant signal and a single lightweight probe confirms reachability when it changes or a request fails with a network error. Nothing is polled while online; while offline it retries with backoff. Click the indicator to re-check.
- A dot on a request tab marks edits not yet written to storage (autosave runs 250 ms after typing stops; Ctrl/Cmd+S writes immediately).

| Action                    | Windows / Linux                                      | macOS           |
| ------------------------- | ---------------------------------------------------- | --------------- |
| Send request              | Ctrl+Enter                                           | ⌘↩              |
| Send and focus response   | Ctrl+Shift+Enter                                     | ⇧⌘↩             |
| Save                      | Ctrl+S                                               | ⌘S              |
| New / close request       | Ctrl+T / Ctrl+W                                      | ⌘T / ⌘W         |
| Next / previous request   | Ctrl+Tab / Ctrl+Shift+Tab (or Ctrl+PgDn / Ctrl+PgUp) | ⌃⇥ / ⌃⇧⇥        |
| Go to request 1–9         | Ctrl+1 … Ctrl+9                                      | ⌘1 … ⌘9         |
| Toggle sidebar / settings | Ctrl+B / Ctrl+,                                      | ⌘B / ⌘,         |
| Request tab list          | ← → Home End, Enter/Space to open, Delete to close   | same            |
| Application menu          | Alt, or Alt+F/E/V/R/T/H (desktop)                    | native menu bar |

Browsers reserve some of these (for example Ctrl+T, Ctrl+W, Ctrl+Tab and Ctrl+1–9); they work in the desktop app. Help → Keyboard Shortcuts lists everything.

## Quality commands

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

## Current limitations

- Only `none` and JSON request bodies are implemented; XML, text, forms, multipart, and binary are next-scope features.
- OAuth 2.0 is not implemented yet.
- Browser requests must satisfy CORS. Electron uses native networking and is not CORS-constrained.
- Each request tab can send and cancel independently; cancellation aborts the underlying request in both the browser and Electron runtimes.
- Workspaces are stored in browser local storage. Authentication secret values remain in memory for the session and are deliberately removed before persistence.
- Collections, environment interpolation, history, import/export, WebSockets, and desktop connectivity tools are extension points, not implemented features.

## Recommended next milestone

Complete Milestone 3's workflow backbone: collection/folder persistence, environment-variable interpolation with deterministic scopes, request history, and cURL plus workspace JSON import/export. Before that work, add a desktop secure-secret repository backed by the OS credential store and IPC request cancellation.
