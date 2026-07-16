# ADR 0008: Parent-relative anchor constraints

- Status: Accepted
- Date: 2026-07-16

## Decision

Node transforms may contain optional normalized `anchorX` and `anchorY` values. Missing anchors resolve as `0`, preserving the existing top-left coordinate system. At render time the shared runtime adds the selected fraction of the parent layout width and height to the stored `x/y` offsets. A scene root resolves against its active profile reference viewport; descendants resolve against their hierarchy parent's unscaled layout rectangle.

Anchors live inside `transform`, so the existing field-by-field `layoutOverrides.mobile.transform` mechanism makes them profile-aware without a second layout data model. Pivot remains separate: it controls the origin of rotation and scale, while anchors control which parent point owns position.

The editor's preset operation has three modes: plain selection preserves the current visual position; Shift also assigns the matching pivot while preserving the visual transform; Shift+Ctrl assigns both and snaps that pivot to the chosen active-screen point. For descendants, the editor converts that scene-space point through the inverse world transform of the hierarchy parent before storing local `x/y`, so nesting does not change the visible snap target. All modes are one `commitCandidate`-validated store mutation.

The optional fields are a backward-compatible schema v1 addition. Existing documents need no migration and render exactly as before.

## Consequences

Editor preview, exported packages, and consuming PixiJS applications share identical anchor math. Dragging stores offsets rather than baked screen coordinates, and reparenting compensates for the destination parent while retaining the chosen anchor.

This ADR does not define stretch anchors, percentage/min-max sizing, safe areas, sibling constraints, or a general constraint solver. Those remain separate MVP backlog items because they require explicit size and offset contracts beyond point anchors.
