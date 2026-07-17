# ADR 0010: Generic UI and layout adapters

- Status: Accepted
- Date: 2026-07-17

## Context

Iteration 08 adds the first interactive controls and automatic layout containers to the document
model. The editor must remain the owner of stable presentation data, while `@pixi/ui`,
`@pixi/layout`, Yoga, DOM input elements, pointer state and live control values are runtime details.
Editor canvas, Preview and an exported consuming application must materialize the same document
through one production runtime without serializing library objects or gameplay actions.

## Decision

Schema v3 represents every capability as an editor-owned discriminated node or asset branch. It
does not expose `@pixi/ui` option objects, Yoga nodes or computed layout values. The implemented
adapter mapping is:

- `button` → `FancyButton`, with authored normal/hover/pressed/disabled image roles and instant
  transitions;
- `scroll-view` → `ScrollBox`, whose direct children are runtime list items;
- `input` → `Input`, including its DOM-backed single-line editing bridge;
- horizontal `slider` and left-to-right `progress-bar` → the corresponding `@pixi/ui` controls;
- `horizontal-layout` and `vertical-layout` → Yoga row/column through `@pixi/layout`;
- `grid-layout` → a Unity-facing fixed-cell preset implemented with flex wrapping and explicit line
  breaks, not a second grid solver.

Every schema node is rendered by a subclass of the common `NodeView`. `NodeView` alone owns the
profile transform, anchors, pivot, scale, visibility, logical layout rectangle and generic grab
rectangle. A subclass implements only `syncContent(...)`. New asset roles participate in the
exhaustive `collectNodeAssetIds(...)` contract and resolve textures through the shared mutable
texture map, so an asset can load or change without replacing the view.

Interaction is explicit at scene construction:

- `authoring` keeps library controls inert, leaving selection, drag, resize and shortcuts to the
  editor and the common `NodeView` hit contract;
- `runtime` enables the library pointer/keyboard behavior and public generic signals/properties.

Live `enabled`, input value, slider value, progress and scroll position belong to the mounted view
or consuming application. They never mutate `ProjectDocument`. Editor state pickers and value
previews are transient store values for the same reason.

A position-managing container owns only the computed rectangle of each direct child. Layout groups
use Yoga for that rectangle; scroll views use the `@pixi/ui` list. Authored child position and
anchors resume when the child leaves such a parent. Computed rectangles are never serialized.
Nested groups independently lay out their own direct children.

Visual changes are incremental. Topology changes may rebuild the affected scene. A small set of
library limitations also requires rebuild because no safe in-place API exists: Input `clipText`,
ScrollBox direction/easing, and Spine animation/loop. These exceptions stay explicit in the editor's
node-structure comparison.

The accepted dependency set is `@pixi/ui` 2.3.2, `@pixi/layout` 3.2.1, `yoga-layout` 3.2.1 and
PixiJS 8.19.x.

## Consequences

Editor, Preview and exported packages share node geometry, asset resolution and control behavior.
Game code can locate mounted views by stable ID or an opaque binding and subscribe to generic
signals without adding gameplay concepts to core.

The grid is not CSS Grid: it has fixed cell sizes, gaps, start corner/axis and flexible or fixed
row/column count on top of flex layout. Layout groups manage only direct children and do not provide
constraints between siblings, safe areas or arbitrary breakpoint hierarchies.

Controls intentionally remain a small first slice: button transitions are instant; input is
single-line and has no form validation or IME-specific authoring UI; slider is horizontal and
single-value; progress is left-to-right; scroll views have no authored scrollbar skinning or
virtualized list editor. Runtime values are lost when a mounted scene is discarded unless the
consuming application, as in the example app, owns and reapplies them.
