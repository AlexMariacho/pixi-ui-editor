# ADR 0009: Unity-style stretch anchors (anchorMin/anchorMax)

- Status: Accepted
- Date: 2026-07-16

## Decision

Schema v2 replaces the point anchor `anchorX`/`anchorY` (ADR 0008) with a Unity-style pair of
normalized anchors per axis: `anchorMinX`/`anchorMaxX` and `anchorMinY`/`anchorMaxY`. A missing
max resolves to the min, a missing min resolves to `0`, so legacy top-left positioning is preserved.
The v1→v2 migration rewrites every stored `anchorX`/`anchorY` (including layout overrides) into an
equal min/max pair; documents render identically after migration.

Axis semantics follow Unity's RectTransform:

- **Point axis** (`min == max`): stored `x`/`width` keep their previous meaning — an offset from the
  anchor point and an absolute size.
- **Stretched axis** (`min < max`): the node is pinned to two parent points and follows the parent's
  size. Stored `width`/`height` become a **delta to the anchor rectangle** (`rendered = stored +
  (max − min) · parent`), and `x`/`y` become the inset from the anchor-min point. The structural
  `width > 0` constraint is therefore relaxed to any number; semantic validation adds
  `NON_POSITIVE_SIZE` for a non-stretched axis whose resolved size is not positive.

All resolution lives in the shared `resolveAnchoredTransform`, and every node type renders through a
single runtime base class `NodeView` (subclasses per node type only sync their content), so editor
preview, exported packages, and consuming PixiJS apps share one anchor implementation.

Editor behavior, also mirroring Unity:

- the preset popup is a 4×4 grid — left/center/right/stretch × top/middle/bottom/stretch; plain
  selection preserves the rendered rectangle, Shift also assigns the matching pivot (0.5 on a
  stretched axis), Shift+Ctrl snaps: a point axis puts the pivot on the anchor point, a stretched
  axis zeroes its offsets;
- the Inspector swaps Pos/Size fields for Left/Right (Top/Bottom) insets on a stretched axis;
- selected nodes always show four anchor-petal gizmos at the anchor points in the parent rectangle;
- drag, resize, and reparenting convert between rendered and stored values, so stretch deltas are
  recomputed against the destination parent.

## Consequences

Objects anchored to two points of a side (or to the whole parent) stretch with the reference
viewport and with any other resolution at runtime, per layout profile. The stored size on a
stretched axis is no longer human-readable as an absolute size; the Inspector compensates by
editing insets. Percentage/min-max sizing, safe areas, and sibling constraints remain out of scope.
