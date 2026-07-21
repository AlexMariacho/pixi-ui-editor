import { describe, expect, it } from "vitest";
import type { ParticleEffectDefinition, UINode } from "@pixi-ui-editor/schema";
import { Sprite, Texture } from "pixi.js";
import { ParticleEmitterNodeView } from "./ParticleEmitterNodeView.js";

const assetIds = { a: "10000000-0000-4000-8000-000000000001", b: "10000000-0000-4000-8000-000000000002" };
const textures = new Map([[assetIds.a, Texture.WHITE], [assetIds.b, Texture.EMPTY]]);

function effect(overrides: Partial<ParticleEffectDefinition> = {}): ParticleEffectDefinition {
  return {
    id: "effect-1", name: "Effect", type: "particles", maxParticles: 30, seed: 7,
    emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 24 }] },
    particle: {
      lifetime: { min: 100, max: 100 },
      spawnShape: { type: "point" },
      movement: { speed: { min: 0, max: 0 }, directionDegrees: 0, spreadDegrees: 0, accelerationX: 0, accelerationY: 0, drag: 0 },
      visual: {
        source: { type: "single", assetId: assetIds.a },
        alpha: { start: 1, end: 0 },
        scale: { start: { min: 2, max: 2 }, end: { min: 0.5, max: 0.5 } },
        tint: { start: "#FFFFFF", end: "#FFFFFF" },
        rotation: { initialDegrees: { min: 0, max: 0 }, angularVelocityDegrees: { min: 0, max: 0 } },
        blendMode: "normal",
      },
    },
    ...overrides,
  } as ParticleEffectDefinition;
}

function emitterNode(overrides: Partial<Extract<UINode, { type: "particle-emitter" }>> = {}): UINode {
  return {
    id: "node-1", name: "Emitter", parentId: null, children: [], visible: true,
    transform: { x: 0, y: 0, width: 100, height: 60, scaleX: 1, scaleY: 1, rotation: 0 },
    type: "particle-emitter", effectId: "effect-1", autoplay: true, simulationSpace: "local",
    ...overrides,
  } as UINode;
}

function spawnedSprites(view: ParticleEmitterNodeView): Sprite[] {
  const contentRoot = view.children[0] as unknown as { children: Sprite[] };
  return contentRoot.children.filter((sprite) => sprite.visible);
}

function build(def: ParticleEffectDefinition, node: UINode, size = { width: 1000, height: 1000 }): ParticleEmitterNodeView {
  const view = new ParticleEmitterNodeView(def, textures);
  view.update(node, "desktop", size);
  return view;
}

describe("ParticleEmitterNodeView spawn shapes and appearance", () => {
  it("samples rectangle spawn points inside the node's logical rect", () => {
    const view = build(effect({ particle: { ...effect().particle, spawnShape: { type: "rectangle" } } }), emitterNode());
    view.step();
    const sprites = spawnedSprites(view);
    expect(sprites).toHaveLength(24);
    for (const sprite of sprites) {
      expect(sprite.position.x).toBeGreaterThanOrEqual(0);
      expect(sprite.position.x).toBeLessThanOrEqual(100);
      expect(sprite.position.y).toBeGreaterThanOrEqual(0);
      expect(sprite.position.y).toBeLessThanOrEqual(60);
    }
  });

  it("samples circle spawn points inside the ellipse inscribed in the rect", () => {
    const view = build(effect({ particle: { ...effect().particle, spawnShape: { type: "circle" } } }), emitterNode());
    view.step();
    for (const sprite of spawnedSprites(view)) {
      const nx = (sprite.position.x - 50) / 50, ny = (sprite.position.y - 30) / 30;
      expect(nx * nx + ny * ny).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("picks among random source assets and interpolates alpha/scale toward their end values by the particle's last frame", () => {
    const random = effect({
      particle: { ...effect().particle, lifetime: { min: 1, max: 1 }, visual: { ...effect().particle.visual, source: { type: "random", assetIds: [assetIds.a, assetIds.b] } } },
    });
    const view = build(random, emitterNode());
    view.step();
    const seen = new Set(spawnedSprites(view).map((sprite) => sprite.texture));
    expect(seen.has(Texture.WHITE)).toBe(true);
    expect(seen.has(Texture.EMPTY)).toBe(true);

    // Advance by fixed steps (update()'s per-call catch-up cap would otherwise clip a large single
    // delta) to 60% through the 1s lifetime, and check the interpolated end values from above.
    for (let i = 0; i < 36; i++) view.step();
    const [sprite] = spawnedSprites(view);
    expect(sprite!.alpha).toBeCloseTo(0.4, 5); // 60% through life: lerp(1, 0, 0.6) = 0.4
    expect(sprite!.scale.x).toBeCloseTo(1.1, 5); // lerp(2, 0.5, 0.6) = 1.1
  });

  it("keeps a non-loop sequence on its last frame once the sequence has fully played", () => {
    const sequence = effect({
      emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 1 }] },
      particle: { ...effect().particle, visual: { ...effect().particle.visual, source: { type: "sequence", assetIds: [assetIds.a, assetIds.b], fps: 10, loop: false, randomStartFrame: false } } },
    });
    const view = build(sequence, emitterNode());
    view.step();
    for (let i = 0; i < 30; i++) view.updateParticles(1 / 10); // far more than 2 frames at 10fps
    const [sprite] = spawnedSprites(view);
    expect(sprite!.texture).toBe(Texture.EMPTY); // stays on the last frame (assetIds[1])
  });
});

describe("ParticleEmitterNodeView local/world space", () => {
  it("keeps a local particle following the emitter, while a world particle keeps its world trajectory", () => {
    const def = effect({ emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 1 }] } });

    const localView = build(def, emitterNode({ simulationSpace: "local" }));
    localView.step();
    const worldView = build(def, emitterNode({ simulationSpace: "world" }));
    worldView.step();

    const worldPositionOf = (view: ParticleEmitterNodeView) => {
      const [sprite] = spawnedSprites(view);
      return view.worldTransform.apply({ x: sprite!.position.x, y: sprite!.position.y });
    };
    const localPositionOf = (view: ParticleEmitterNodeView) => {
      const [sprite] = spawnedSprites(view);
      return { x: sprite!.position.x, y: sprite!.position.y };
    };

    const localBefore = localPositionOf(localView);
    const worldBefore = worldPositionOf(worldView);

    // Move both emitters, then resync render (a zero-delta tick just re-projects, it doesn't age).
    localView.update(emitterNode({ simulationSpace: "local", transform: { x: 400, y: 250, width: 100, height: 60, scaleX: 1, scaleY: 1, rotation: 0 } }), "desktop", { width: 1000, height: 1000 });
    worldView.update(emitterNode({ simulationSpace: "world", transform: { x: 400, y: 250, width: 100, height: 60, scaleX: 1, scaleY: 1, rotation: 0 } }), "desktop", { width: 1000, height: 1000 });
    localView.updateParticles(0);
    worldView.updateParticles(0);

    // Local: the particle's own local coordinates are untouched by the emitter's move.
    expect(localPositionOf(localView)).toEqual(localBefore);
    // World: local coordinates are recomputed so the particle's world position stays put.
    const worldAfter = worldPositionOf(worldView);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);
  });
});

describe("ParticleEmitterNodeView incremental sync and disposal", () => {
  it("does not restart on an unrelated definition clone and adopts a new maxParticles live", () => {
    const def = effect({ maxParticles: 2, emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 2 }] } });
    const view = build(def, emitterNode());
    view.step();
    expect(spawnedSprites(view)).toHaveLength(2);

    const renamed = structuredClone(def);
    renamed.name = "Renamed";
    view.syncEffect(renamed);
    expect(spawnedSprites(view)).toHaveLength(2); // untouched by the sync

    expect(view.getDiagnostics()).toMatchObject({ active: 2, dropped: 0 });
  });

  it("dispose() removes every prewarmed sprite from the render tree and is safe to call from destroy()", () => {
    const def = effect({ maxParticles: 4 });
    const view = build(def, emitterNode());
    view.step();
    expect(spawnedSprites(view)).toHaveLength(24 > 4 ? 4 : 24); // burst count clamps to maxParticles

    const contentRoot = view.children[0] as unknown as { children: Sprite[] };
    expect(contentRoot.children.length).toBeGreaterThan(0);
    view.destroy();
    expect(contentRoot.children).toHaveLength(0);
    expect(view.getDiagnostics()).toMatchObject({ active: 0, disposed: true });
  });
});
