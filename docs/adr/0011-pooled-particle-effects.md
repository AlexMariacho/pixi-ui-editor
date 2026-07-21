# ADR 0011 — Pooled particle effects

## Status

Accepted.

## Context

The editor, Preview and consuming PixiJS app need the same lightweight, authored particle effect without introducing gameplay semantics or a renderer-specific exported format.

## Decision

- `ProjectDocument.effects` holds reusable `particles` definitions; a `particle-emitter` node is an instance with an effect reference, autoplay, local/world space and stop behavior.
- The schema remains the canonical export contract. Image and atlas-frame IDs are resolved by the existing shared texture resolver; export keeps `project.json` and the established asset URI rewrite/layout.
- Simulation is deterministic for a definition, seed and command sequence: it uses a seeded PRNG and a fixed 1/60-second step.
- Each emitter owns its prewarmed pool and never allocates particle state while spawning. Exhaustion records dropped particles instead of exceeding `maxParticles`.
- `packages/runtime-pixi` exposes lifecycle methods on `ParticleEmitterNodeView` and `updateParticleEmitters(root, deltaSeconds)`. Hosts own ticker subscription and removal; runtime never attaches to a global ticker.
- `NodeView` continues to own authored transforms, logical layout bounds and hit testing. Particle content is only renderer content and does not define layout bounds. Local particles follow the emitter; world particles retain their emitted world position.

## Consequences

Editor authoring, popup Preview and `examples/pixi-app` share the simulator and rendering adapter. A consuming app locates an emitter through an opaque binding or stable ID and decides when to play or restart it. Current particle time, live particles, diagnostics and authoring controls remain transient and are not serialized.
