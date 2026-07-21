# ADR 0011 — Pooled particle effects

## Status

Accepted.

## Context

The editor, Preview and consuming PixiJS app need the same lightweight, authored particle effect without introducing gameplay semantics or a renderer-specific exported format.

## Decision

- `ProjectDocument.effects` holds reusable `particles` definitions; a `particle-emitter` node is an instance with an effect reference, autoplay and local/world space. Stop is always a graceful drain (see below), so the node contract has no separate stop-mode field.
- The schema remains the canonical export contract. Image and atlas-frame IDs are resolved by the existing shared texture resolver; export keeps `project.json` and the established asset URI rewrite/layout.
- Simulation is deterministic for a definition, seed and command sequence: `ParticleSimulator` (`packages/runtime-pixi/src/particles.ts`) uses a seeded PRNG and a fixed 1/60-second step, with a bounded catch-up accumulator so a large single `update()` delta (e.g. after a backgrounded tab) is capped at 8 steps instead of bursting through the missed time. It has no Pixi/DOM import: pool, PRNG, burst/rate scheduling and spawn-shape sampling are plain, independently testable code.
- `play()`/`pause()`/`stop()`/`restart()`/`dispose()` are distinct transitions, not variants of one "stop": `pause()` freezes emission and every live particle without resetting time or PRNG; `stop()` only blocks new spawns, letting already-emitted particles finish naturally; `restart()` returns all live particles to the pool and replays the authored seed from the start; `dispose()` is an idempotent terminal cleanup that destroys every pooled render object and turns every later lifecycle call into a no-op (`getDiagnostics().disposed === true`). `step()` advances exactly one fixed step regardless of paused/stopped state and never changes it. `ParticleEmitterNodeView.destroy()` calls `dispose()`.
- One `ParticlePool` per emitter owns both the simulation slot and its renderer object as a single prewarmed entry, created by one adapter-supplied factory; `acquire`/`release` never call the factory. Shrinking `maxParticles` destroys idle free slots immediately, while active slots beyond the new capacity keep simulating and are permanently destroyed (not recycled) the next time they die. Exhaustion increments `dropped` instead of exceeding capacity.
- Pixi adapter detail: `ParticleEmitterNodeView` renders through prewarmed `Sprite`s inside a plain `Container`, not `ParticleContainer`/`Particle`. `ParticleContainer` requires every particle in it to share one base texture, which `random`/`sequence` sources (arbitrary image/atlas-frame IDs) cannot guarantee; sprites keep the "no allocation after prewarm" contract without that constraint.
- `packages/runtime-pixi` exposes lifecycle methods on `ParticleEmitterNodeView` and `updateParticleEmitters(root, deltaSeconds)`. Hosts own ticker subscription and removal; runtime never attaches to a global ticker.
- `NodeView` continues to own authored transforms, logical layout bounds and hit testing. Particle content is only renderer content and does not define layout bounds. A `local` particle's rendered position is its emitter-local coordinates, so it automatically follows the emitter's own transform through the normal Pixi scene graph. A `world` particle freezes the emitter's world transform at spawn (translation and the rotate/scale linear part) to derive its world trajectory, and the adapter reprojects that world position into the emitter's *current* local space every tick, so a later move/rotate/scale of the emitter does not drag an already-emitted world particle along with it.
- `syncEffect(effect)` never branches on definition object identity: it always adopts the given reference and only resizes the pool when `maxParticles` actually changed. An unrelated document edit, a texture becoming available, or even a seed change never resets the accumulator, PRNG or live particles — a new seed only takes effect on the next explicit `restart()`.

## Consequences

Editor authoring, popup Preview and `examples/pixi-app` share the simulator and rendering adapter. A consuming app locates an emitter through an opaque binding or stable ID and decides when to play, stop or restart it. Current particle time, live particles, diagnostics and authoring controls remain transient and are not serialized.
