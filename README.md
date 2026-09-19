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
- The build is not packaged into installers yet.

## Recommended next milestone

Complete Milestone 3's workflow backbone: collection/folder persistence, environment-variable interpolation with deterministic scopes, request history, and cURL plus workspace JSON import/export. Before that work, add a desktop secure-secret repository backed by the OS credential store and IPC request cancellation.
