# ADR 0005: Viewport tools and editor UI preferences

- Status: Accepted
- Date: 2026-07-14

## Decision

Viewport tool mode is transient editor state: `activeTool` is one of `pan`, `select`, or `resize`, defaults to `select`, and is not part of `ProjectDocument` or its persistence. Pan is available through Q and left-dragging the canvas; Select is available through W and preserves selection and node dragging. Resize is available through E and otherwise behaves as Select.

Resize edits `transform.width` and `transform.height`, not `scaleX` or `scaleY`. The editor renders eight screen-space handles over the selected node's bounds. Dragging a handle updates the selected node through `updateNodeProfileTransform`, preserving the opposite edge and also updating `x` or `y` for west and north handles. Values are rounded to two decimal places and are clamped to a minimum size of 1. Rotation-aware resize is intentionally outside this prototype.

Editor-only UI preferences are stored separately under `pixi-ui-editor:ui-prefs`. This key holds the Assets window's open state, position, and view mode; it is never serialized into `ProjectDocument`.

## Consequences

The document schema and production runtime remain unchanged while authoring interactions remain profile-aware through the existing store operation. Tool state resets on page reload, while document changes and UI preferences retain their established, separate persistence contracts. Advanced transforms, snapping, proportional resizing, and rotation-aware handles remain out of scope.
