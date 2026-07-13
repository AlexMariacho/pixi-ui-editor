# Pixi UI Editor

TypeScript monorepo for the Pixi UI Editor foundation.

## Repository structure

All folders below are part of one pnpm workspace ([pnpm-workspace.yaml](pnpm-workspace.yaml)); root commands such as `pnpm build` run across every app and package at once.

- `apps/` — runnable applications (currently placeholders, implemented in later iterations):
  - `editor-web` — the visual editor (browser app);
  - `runtime-demo` — demo showing an authored UI rendered by the PixiJS runtime;
  - `api` — backend for project storage and publishing.
- `packages/` — shared libraries consumed by the apps:
  - `schema` — the document contract: types, runtime schema, validation, migrations, deterministic serialization;
  - `runtime-pixi` — headless document loading boundary (PixiJS rendering comes later);
  - `editor-core`, `exporter`, `validators`, `shared` — placeholders for later iterations.
- `examples/sample-project/` — the version-controlled reference document (`project.json`) used by the smoke tests; not application code.
- `docs/` — product concept, MVP implementation plan, iteration tasks, and ADRs.

## Requirements

- Node.js 20+ (Node.js 22 LTS recommended)
- pnpm 10

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

There is no runnable server or editor UI yet. `apps/api`, `apps/editor-web`, and `apps/runtime-demo` are placeholder workspaces; the current iteration only delivers the document schema, validation, serialization, and the headless document loader, all verified through the commands above.

## Sample project smoke test

The version-controlled [sample project](examples/sample-project/project.json) is loaded through the headless runtime boundary by the smoke test:

```powershell
pnpm --filter @pixi-ui-editor/runtime-pixi test
```
