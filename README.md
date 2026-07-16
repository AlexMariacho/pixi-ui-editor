# Pixi UI Editor

Pixi UI Editor is a web-first editor for building the presentation layer of a PixiJS game UI. It lets designers compose an interface hierarchy, adapt it to different screens, add image and Spine assets, reuse fragments as presets, and export a package reproduced by a shared PixiJS runtime.

The editor is not a game engine and does not contain gameplay logic. Its document describes UI only: hierarchy, assets, layout profiles, transforms, anchors, and preset references. Game behavior is connected separately through bindings and game code.

## Core concept

- **One declarative document.** PixiJS objects are not serialized into the document; it can be validated, migrated, and deterministically serialized.
- **Stable IDs instead of names and paths.** Nodes, assets, scenes, and presets have immutable identifiers, so replacing an asset file does not break references.
- **One hierarchy and layout profiles.** Desktop and mobile are not duplicate scenes. Each node can have independent transform and visibility overrides for horizontal and vertical profiles.
- **Parent-relative anchors.** Both point and stretch anchors are supported; stretch stores dimensions as offsets from its anchor rectangle. This lets UI adapt to the parent container size.
- **One runtime for editor and game.** The editor canvas, standalone Preview, and consuming application use `packages/runtime-pixi`, so the layout resolver and rendering rules are not duplicated.
- **An immutable publishable package.** Export creates a self-contained ZIP with `project.json` and asset files; a browser-saved draft is not itself a game contract.

The [platform concept](docs/game-ui-authoring-platform-concept.md) provides the full product description; the [implementation plan](docs/game-ui-platform-implementation-plan-mvp-v3.md) defines the MVP scope and upcoming work order.

## What already works

`apps/editor-web` contains a working browser prototype with:

- editing multiple project windows and viewing all windows in **Map** mode;
- a shared hierarchy: selection, multi-selection, drag and drop, node creation, renaming, deletion, and reordering;
- Select, Pan, and Resize canvas tools, plus selection and anchor gizmos;
- an Inspector for transforms, visibility, pivots, anchors, text, image, and Spine nodes;
- separate horizontal and vertical layout profiles with independent transforms and reference viewports; desktop, tablet, and mobile presets plus manual resolution entry;
- image assets: upload, replace while preserving an ID, assign to nodes, preview, and safely delete only unused assets;
- Spine assets: upload, animation preview, looping, and time/frame scrubbing;
- floating **Assets** and **Presets** windows that persist their settings; Assets supports compact, list, and grid views;
- presets: create from a scene fragment, prefab-instance nodes, preset editing mode, and read-only projected preset content in the hierarchy;
- Preview of the selected window in a separate popup without editor overlays; it scales a fixed layout when the popup is resized manually;
- ZIP package export containing `project.json` and all used files under `assets/<assetId>/<fileName>`;
- document and UI-preference persistence in browser `localStorage`, plus **Reset to sample** to restore the reference project;
- a single command registry for toolbar and keyboard actions, including Select, Pan, Resize, Map, and Delete.

The current iteration history and accepted decisions are listed in the [documentation](docs/README.md) and [ADRs](docs/adr/).

## Repository structure

This is a single pnpm workspace ([pnpm-workspace.yaml](pnpm-workspace.yaml)).

- `apps/editor-web/` — the working React/Vite editor;
- `packages/schema/` — the document contract: types, runtime schema, validation, migrations, and deterministic serialization;
- `packages/runtime-pixi/` — document loading, the profile resolver, and the shared PixiJS renderer;
- `examples/sample-project/` — the version-controlled reference document for smoke tests;
- `examples/pixi-app/` — a minimal PixiJS application that reproduces an exported package;
- `apps/api/`, `apps/runtime-demo/`, `packages/editor-core/`, `packages/exporter/`, `packages/validators/`, and `packages/shared/` — placeholders for later stages.

## Requirements

- Node.js **20.19+ or 22.12+**; Node.js 22 LTS is recommended;
- pnpm 10.

`apps/editor-web` uses Vite 7. Node.js 20.11.0 can build the workspace and run tests, but cannot start the dev server: Vite fails with `TypeError: crypto.hash is not a function`.

```powershell
node --version
pnpm --version
```

If `pnpm` is not on your `PATH`:

```powershell
npm install -g pnpm@10.27.0
```

## First run and checks

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

Run `pnpm build` before `pnpm typecheck`: inter-package import types are resolved from `dist/`. The project deliberately uses a small set of contract and pipeline tests rather than a coverage quota; see the [testing strategy](docs/testing-strategy.md).

## Run the editor

```powershell
pnpm --filter @pixi-ui-editor/editor-web dev
```

Open the URL printed by Vite (normally `http://localhost:5173/`). If the port is in use, Vite picks another one. The sample project loads on first launch; subsequent changes are restored automatically from `localStorage`.

To inspect the production bundle:

```powershell
pnpm build
pnpm --filter @pixi-ui-editor/editor-web preview
```

`preview` serves the already-built `apps/editor-web/dist`; restart it after another build.

## Document smoke test

The reference [sample project](examples/sample-project/project.json) is loaded through the headless runtime boundary:

```powershell
pnpm --filter @pixi-ui-editor/runtime-pixi test
```
