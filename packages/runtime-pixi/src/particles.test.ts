import { describe, expect, it } from "vitest";
import type { ParticleEffectDefinition } from "@pixi-ui-editor/schema";
import { ParticlePool, ParticleSimulator, type ParticleRenderHooks, type ParticleSpawnContext } from "./particles.js";

function definition(overrides: Partial<ParticleEffectDefinition> = {}): ParticleEffectDefinition {
  return {
    id: "effect-1", name: "Effect", type: "particles", maxParticles: 8, seed: 42,
    emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [] },
    particle: {
      lifetime: { min: 0.5, max: 0.5 },
      spawnShape: { type: "point" },
      movement: { speed: { min: 0, max: 0 }, directionDegrees: 0, spreadDegrees: 0, accelerationX: 0, accelerationY: 0, drag: 0 },
      visual: {
        source: { type: "single", assetId: "asset-1" },
        alpha: { start: 1, end: 0 },
        scale: { start: { min: 1, max: 1 }, end: { min: 1, max: 1 } },
        tint: { start: "#FFFFFF", end: "#FFFFFF" },
        rotation: { initialDegrees: { min: 0, max: 0 }, angularVelocityDegrees: { min: 0, max: 0 } },
        blendMode: "normal",
      },
    },
    ...overrides,
  } as ParticleEffectDefinition;
}

type FakeRender = { visible: boolean };
function makeHooks() {
  const created: FakeRender[] = [];
  const destroyed: FakeRender[] = [];
  const hooks: ParticleRenderHooks<FakeRender> = {
    createRender: () => { const render = { visible: false }; created.push(render); return render; },
    hideRender: (render) => { render.visible = false; },
    destroyRender: (render) => { destroyed.push(render); },
    getWorldTransform: () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }),
  };
  return { hooks, created, destroyed };
}

const area: ParticleSpawnContext = { width: 100, height: 100, space: "local" };

describe("ParticlePool", () => {
  it("prewarms exactly capacity slots, never calls the factory on acquire/release, and reuses released identity", () => {
    let created = 0;
    const pool = new ParticlePool(() => ({ id: created++ }), 3);
    expect(created).toBe(3);
    const a = pool.acquire()!;
    pool.acquire();
    expect(created).toBe(3);
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(created).toBe(3);
  });

  it("increments dropped and never exceeds capacity on exhaustion", () => {
    const pool = new ParticlePool(() => ({}), 1);
    pool.acquire();
    expect(pool.acquire()).toBeUndefined();
    expect(pool.dropped).toBe(1);
  });

  it("creates only the delta on growth and drains active slots beyond a shrunk capacity without recycling them", () => {
    const destroyed: number[] = [];
    let created = 0;
    const pool = new ParticlePool(() => created++, 2, (value) => destroyed.push(value));
    const a = pool.acquire()!, b = pool.acquire()!;
    pool.resize(4);
    expect(created).toBe(4);
    pool.resize(1);
    expect(destroyed).toHaveLength(2); // the two idle free slots are destroyed immediately
    pool.release(a); // still over the new capacity: destroyed instead of recycled
    expect(destroyed).toHaveLength(3);
    pool.release(b); // back at capacity: recycled normally
    expect(destroyed).toHaveLength(3);
    expect(pool.acquire()).toBe(b);
  });
});

describe("ParticleSimulator determinism", () => {
  it("gives the same active-slot state at fixed-step boundaries regardless of how render delta is split", () => {
    const def = definition({ emission: { delay: 0, duration: 10, loop: true, rate: 30, bursts: [] } });
    const simA = new ParticleSimulator(def, makeHooks().hooks);
    const simB = new ParticleSimulator(def, makeHooks().hooks);
    simA.play();
    simB.play();
    // Total stays comfortably under the 8-step catch-up cap for both splits, so the cap itself
    // never becomes the variable under test — only the splitting is.
    simA.update(0.1, area);
    for (const chunk of [0.03, 0.02, 0.05]) simB.update(chunk, area);
    const snapshot = (sim: ParticleSimulator<FakeRender>) => [...sim.activeSlots]
      .map((slot) => ({ age: Math.round(slot.age * 1e6), x: Math.round(slot.x * 1e6), y: Math.round(slot.y * 1e6) }))
      .sort((p, q) => p.age - q.age);
    expect(snapshot(simA)).toEqual(snapshot(simB));
    expect(simA.getDiagnostics()).toEqual(simB.getDiagnostics());
  });
});

describe("ParticleSimulator burst scheduling", () => {
  it("fires a burst with time 0 on the very first fixed step after start", () => {
    const def = definition({ emission: { delay: 0, duration: 0.2, loop: true, rate: 0, bursts: [{ time: 0, count: 3 }] } });
    def.particle.lifetime = { min: 100, max: 100 };
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    sim.step(area);
    expect(sim.activeSlots.size).toBe(3);
  });

  it("fires a non-loop burst exactly once even when stepped well past its trigger and duration", () => {
    const def = definition({ emission: { delay: 0, duration: 0.5, loop: false, rate: 0, bursts: [{ time: 0.1, count: 2 }] } });
    def.particle.lifetime = { min: 100, max: 100 };
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    for (let i = 0; i < 4; i++) sim.step(area); // well before the 0.1s trigger
    expect(sim.activeSlots.size).toBe(0);
    for (let i = 0; i < 4; i++) sim.step(area); // now solidly past the trigger (8/60 ≈ 0.133s)
    expect(sim.activeSlots.size).toBe(2);
    for (let i = 0; i < 60; i++) sim.step(area); // well past duration and beyond
    expect(sim.activeSlots.size).toBe(2);
  });

  it("fires a loop burst again on the next cycle, including across the cycle boundary", () => {
    const def = definition({ emission: { delay: 0, duration: 0.1, loop: true, rate: 0, bursts: [{ time: 0, count: 1 }] } });
    def.particle.lifetime = { min: 100, max: 100 };
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    sim.step(area); // first fixed step: elapsed ≈ 1/60, burst fires
    expect(sim.activeSlots.size).toBe(1);
    for (let i = 0; i < 3; i++) sim.step(area); // elapsed ≈ 4/60, still inside the first cycle
    expect(sim.activeSlots.size).toBe(1);
    for (let i = 0; i < 3; i++) sim.step(area); // elapsed ≈ 7/60, solidly past the 0.1s cycle boundary
    expect(sim.activeSlots.size).toBe(2);
  });
});

describe("ParticleSimulator lifecycle", () => {
  it("stop() blocks new spawns while already-emitted particles drain to active === 0", () => {
    const def = definition({ emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 4 }] } });
    def.particle.lifetime = { min: 2 / 60, max: 2 / 60 };
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    sim.step(area);
    expect(sim.activeSlots.size).toBe(4);
    sim.stop();
    expect(sim.getDiagnostics()).toMatchObject({ playing: false, stopped: true });
    sim.step(area); // still simulating: ages toward death but hasn't reached lifetime yet
    expect(sim.activeSlots.size).toBe(4);
    sim.step(area); // lifetime reached; particles die and are not replaced because spawning is blocked
    expect(sim.activeSlots.size).toBe(0);
  });

  it("dispose() immediately clears every slot, is idempotent, and excludes the simulator from further updates", () => {
    const { hooks, created, destroyed } = makeHooks();
    const def = definition({ maxParticles: 5, emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 2 }] } });
    const sim = new ParticleSimulator(def, hooks);
    sim.play();
    sim.step(area);
    expect(sim.activeSlots.size).toBe(2);

    sim.dispose();
    expect(sim.activeSlots.size).toBe(0);
    expect(destroyed).toHaveLength(created.length);
    expect(sim.getDiagnostics()).toMatchObject({ active: 0, disposed: true });

    sim.dispose(); // idempotent
    sim.play();
    sim.step(area);
    sim.restart();
    expect(sim.activeSlots.size).toBe(0);
    expect(sim.getDiagnostics().disposed).toBe(true);
  });

  it("pause() freezes state, step() advances one fixed step regardless, and restart() replays the initial sequence and resets dropped", () => {
    const def = definition({ maxParticles: 2, emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 3 }] } });
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    sim.step(area); // burst of 3 into a pool of 2: one dropped
    expect(sim.getDiagnostics()).toMatchObject({ active: 2, dropped: 1 });

    sim.pause();
    sim.update(1, area); // paused: no time passes, no state changes
    expect(sim.getDiagnostics()).toMatchObject({ active: 2, dropped: 1, playing: false, stopped: false }); // paused is distinct from stopped
    sim.step(area); // step still advances one fixed tick even while paused
    expect(sim.getDiagnostics().playing).toBe(false); // ...without leaving pause

    sim.restart();
    expect(sim.getDiagnostics()).toMatchObject({ active: 0, dropped: 0, playing: true });
    sim.step(area);
    expect(sim.getDiagnostics()).toMatchObject({ active: 2, dropped: 1 });
  });
});

describe("ParticleSimulator incremental sync", () => {
  it("never restarts on an unrelated clone or a seed edit", () => {
    const def = definition({ maxParticles: 3, seed: 7, emission: { delay: 0, duration: 10, loop: true, rate: 0, bursts: [{ time: 0, count: 2 }] } });
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    sim.step(area);
    expect(sim.activeSlots.size).toBe(2);

    const renamed = structuredClone(def);
    renamed.name = "Renamed";
    sim.syncEffect(renamed);
    expect(sim.activeSlots.size).toBe(2);

    const reseeded = structuredClone(renamed);
    reseeded.seed = 999;
    sim.syncEffect(reseeded);
    expect(sim.activeSlots.size).toBe(2); // seed only applies at the next explicit restart()
  });

  it("resizes the pool live on a maxParticles change without disturbing existing particles", () => {
    const def = definition({ maxParticles: 2, emission: { delay: 0, duration: 10, loop: true, rate: 60, bursts: [] } });
    const sim = new ParticleSimulator(def, makeHooks().hooks);
    sim.play();
    sim.step(area);
    sim.step(area);
    sim.step(area); // 3 spawns attempted at 1/tick, pool holds 2, 1 dropped
    expect(sim.getDiagnostics()).toMatchObject({ active: 2, dropped: 1 });

    const grown = structuredClone(def);
    grown.maxParticles = 4;
    sim.syncEffect(grown);
    expect(sim.getDiagnostics()).toMatchObject({ active: 2, dropped: 1 }); // sync itself changes nothing

    sim.step(area);
    sim.step(area); // 2 more spawns now fit in the grown pool
    expect(sim.getDiagnostics()).toMatchObject({ active: 4, dropped: 1 });
  });
});
