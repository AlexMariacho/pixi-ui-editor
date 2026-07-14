# ADR 0004: Prototype asset storage and replacement

- Status: Accepted
- Date: 2026-07-14

## Decision

The editor prototype stores uploaded PNG, JPEG, and WebP image assets as data URIs in `ProjectDocument`, which is persisted in browser `localStorage`. Upload and replacement share the same client-side `FileReader` flow and accept only those media types up to 2 MB. There is no server or object storage in this iteration.

`buildSceneView` stays synchronous. The editor resolves a data URI directly and resolves the sample asset through an external `AssetUrlResolver` map. A texture that cannot be resolved or loaded falls back to the existing placeholder. Textures are cached by `source.uri`; replacement therefore loads the new texture after the scene is rebuilt, while the old texture is intentionally retained for this prototype.

Selecting a different asset for an image node and replacing an existing asset's source are separate operations. `setImageNodeAsset` changes one image node's `assetId`; `replaceAssetSource` preserves the asset's stable `id`, `name`, and `type`, updates its URI and media type, and records a new ISO source version. All nodes that reference that asset use the replacement source.

An asset may be deleted only when it is unused. The editor shows usage across scene and prefab nodes and disables Delete when the count is nonzero. Store deletion remains a simple candidate removal guarded by document validation, so a bypassed UI action that would leave an image or Spine node with a missing asset reference is rejected.

## Consequences

The prototype supports a complete local image-asset workflow without changing schema versioning or introducing backend storage. Spine loading, texture lifecycle cleanup, remote asset delivery, rename, folders, duplicates, undo/redo, and publishing remain outside this iteration.
