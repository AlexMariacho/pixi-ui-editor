# ADR 0006: Export package format and runtime playback API

- Status: Accepted
- Date: 2026-07-15

## Decision

The document schema moved to version 1 without a migration from v0: prototype documents had no external consumers, so `migrateProjectDocument` simply rejects earlier versions instead of carrying migration code for a format nobody stores anymore. Schema v1 adds Spine assets and nodes, prefab definitions with `prefab-instance` nodes, and multiple scenes per project.

A Spine asset is a single asset whose `files` object assigns roles: `skeleton`, `atlas`, and `textures[]`. Every file carries `name`, `uri`, and `mediaType`; atlas pages bind to textures by exported file name, never by array index.

Publishing works through a self-contained zip package: `project.json` holds the canonically serialized ProjectDocument (schema v1), and every asset file is stored under `assets/<assetId>/<fileName>`. Export rewrites all `data:` and editor-relative URIs in the document to these package-relative paths; image assets, whose source has no file name, are exported as the asset name plus an extension derived from `mediaType`. A consumer therefore needs only a resolver that prefixes URIs with the package root. The whole project is exported, and the document must pass `validateProjectDocument`.

The runtime API grew two generic entry points shared by editor and game: `resolveProfileForViewport(settings, width, height)` implements the `aspect-ratio` rule (`width / height <= mobileMaxAspectRatio` selects `mobile`, including exactly at the breakpoint), and `loadSceneView(document, sceneId, profile, resolveFileUrl)` combines `loadSceneTextures`, `loadSceneSpines`, and `buildSceneView` into one call returning `{ root, nodeViews }`. Prefab instances are expanded at build time into the display tree from their definitions; nodes inside expanded definitions are not registered in `nodeViews`, so an instance behaves as a single unit.

"Window" is the user-facing term for the schema entity `Scene`; the document format keeps `scenes` unchanged.

## Consequences

An exported package plays in any PixiJS application without the editor or a rebuild step, as demonstrated by `examples/pixi-app`. Editor preview and game runtime share one profile resolver and one scene builder, so breakpoint behavior cannot diverge. Versioned immutable publishing, package manifests/checksums, and prefab overrides per instance remain out of scope for this prototype.
