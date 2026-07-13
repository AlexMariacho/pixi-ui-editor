# ADR 0003: Orientation as layout profiles

- Status: Accepted
- Date: 2026-07-13

## Decision

The editor's Horizontal and Vertical UI orientations are the existing document layout profiles: Horizontal maps to `desktop`, Vertical maps to `mobile`. The active orientation is transient editor state (`activeProfile`) and is not serialized into `ProjectDocument` or persisted as part of the document.

Editing a transform in Horizontal updates the node's base `transform`. Editing it in Vertical writes a partial `layoutOverrides.mobile.transform`. Per-orientation visibility uses `layoutOverrides.desktop.visible` and `layoutOverrides.mobile.visible`; `false` hides a node for that profile, while an enabled checkbox removes the override instead of storing `true`.

Each scene's existing `layout.referenceViewports` are editable per active profile. Desktop, Tablet, and Mobile dimensions are editor-only presets; the document serializes only the selected viewport dimensions, never the preset identity.

## Consequences

The scene continues to have one shared hierarchy, and no tablet profile or duplicate scene is introduced. The shared runtime resolves the same profile data that the editor previews. Responsive rules and automatic layout conversion remain outside this iteration.
