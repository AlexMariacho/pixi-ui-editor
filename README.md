# Pixi UI Editor

TypeScript monorepo for the Pixi UI Editor foundation.

## Repository structure

All folders below are part of one pnpm workspace ([pnpm-workspace.yaml](pnpm-workspace.yaml)); root commands such as `pnpm build` run across every app and package at once.

- `apps/` — runnable applications:
  - `editor-web` — the working visual editor prototype (browser app);
  - `runtime-demo` — demo showing an authored UI rendered by the PixiJS runtime;
  - `api` — backend for project storage and publishing.
- `packages/` — shared libraries consumed by the apps:
  - `schema` — the document contract: types, runtime schema, validation, migrations, deterministic serialization;
  - `runtime-pixi` — document loading and shared PixiJS scene rendering;
  - `editor-core`, `exporter`, `validators`, `shared` — placeholders for later iterations.
- `examples/sample-project/` — the version-controlled reference document (`project.json`) used by the smoke tests; not application code.
- `docs/` — product concept, MVP implementation plan, iteration tasks, and ADRs.

## Requirements

- Node.js **20.19+ or 22.12+** (Node.js 22 LTS recommended)
- pnpm 10

`apps/editor-web` uses Vite 7. Node.js 20.11.0 is sufficient for the workspace
build and tests, but cannot start the Vite development server: Vite fails with
`TypeError: crypto.hash is not a function`. Check the active version before
starting the editor:

```powershell
node --version
pnpm --version
```

If `pnpm` is not on your PATH, install it once:

```powershell
npm install -g pnpm@10.27.0
```

(or use `corepack enable`, which requires an elevated shell on Windows).

## First run

From a clean checkout:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

Run `pnpm build` before `pnpm typecheck`: package type declarations are resolved from `dist/`, so typechecking fails until the workspace has been built once.
The repository deliberately favors a small set of contract and pipeline tests over coverage targets; see the [testing strategy](docs/testing-strategy.md) before adding new suites.

## Run the editor

The visual editor is available in `apps/editor-web`. After installing
dependencies and using a supported Node.js version, start it from the repository root:

```powershell
pnpm --filter @pixi-ui-editor/editor-web dev
```

Open the URL printed by Vite (normally `http://localhost:5173/`). If that port
is occupied, Vite selects the next free port; use the exact URL from its output.
Stop the server with `Ctrl+C`.

The prototype supports hierarchy selection, inspector editing, canvas drag, node creation/deletion, and automatic restoration of the edited document from browser `localStorage`. Use `Reset to sample` in the toolbar to discard the saved draft and return to the reference project.

Use **Preview** in the toolbar to open the selected project window in a separate
browser popup rendered by the shared PixiJS runtime. The popup requests half of
the active reference resolution in the same orientation. Resize it normally to
check scale-to-fit behavior without changing the selected layout profile.
Switching orientation or selecting another project window in the editor fully
rebuilds the open runtime preview. Allow popups for the editor origin if the
browser blocks the window.

To inspect the production bundle locally:

```powershell
pnpm build
pnpm --filter @pixi-ui-editor/editor-web preview
```

`preview` serves the already-built `apps/editor-web/dist`; it does not replace
the development server and must be restarted after another build.

## Sample project smoke test

The version-controlled [sample project](examples/sample-project/project.json) is loaded through the headless runtime boundary by the smoke test:

```powershell
pnpm --filter @pixi-ui-editor/runtime-pixi test
```
