# ADR 0002: Editor prototype stack

- Status: Accepted
- Date: 2026-07-13

## Decision

The browser editor prototype is implemented with Vite, React, TypeScript, zustand, and PixiJS. Its single source of truth is a `ProjectDocument` held in the zustand store; PixiJS display objects are materialized views and never become canonical editor data.

Every accepted document change rebuilds the PixiJS scene in full. The editor preview uses the shared production rendering path from `@pixi-ui-editor/runtime-pixi`, so the editor does not maintain a separate renderer. During this prototype, image nodes use placeholders and asset files are not loaded.

The prototype serializes the document to browser `localStorage` after store changes and restores it at startup. This is only local prototype persistence, not the product's authoritative storage model.

## Consequences

The prototype favors a small, deterministic data flow over incremental rendering performance. Validation remains at the document mutation boundary, preview behavior stays aligned with the shared PixiJS runtime, and refreshing the page preserves local authoring progress.

Future product storage and asset loading can replace the prototype boundaries without changing the canonical document model.
