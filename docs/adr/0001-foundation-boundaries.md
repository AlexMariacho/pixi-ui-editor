# ADR 0001: Foundation boundaries

- Status: Accepted
- Date: 2026-07-12

## Decision

The canonical document is declarative, normalized JSON rather than a PixiJS object tree. `@pixi-ui-editor/schema` owns its types, runtime schema, migrations, and deterministic serialization. The editor and runtime are consumers of that one contract.

Stable UUIDs are system identity and are separate from editable display names. Assets are separate records from nodes. Each scene has one shared hierarchy, while `desktop` and `mobile` are layout profiles expressed through overrides.

At the prototype stage neither backend nor publish is the source of truth. Gameplay behavior remains outside the document and runtime core.

## Consequences

PixiJS-specific rendering, gameplay bindings, and future publishing infrastructure build on the document contract without redefining its identity or presentation structure.
