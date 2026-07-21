import type { ParticleEffectDefinition } from "@pixi-ui-editor/schema";

const DEG_TO_RAD = Math.PI / 180;

/** Deterministic xorshift32 generator; it has no DOM/Pixi/ticker dependency. */
export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = seed === 0 ? 0x9e3779b9 : seed >>> 0; }
  next(): number { this.state ^= this.state << 13; this.state ^= this.state >>> 17; this.state ^= this.state << 5; return (this.state >>> 0) / 0x1_0000_0000; }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  /** A uniform index in `[0, length)`; used to pick a random asset/frame. */
  index(length: number): number { return Math.min(length - 1, Math.floor(this.next() * length)); }
}

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function hexChannel(hex: string, offset: number): number { return parseInt(hex.slice(offset, offset + 2), 16); }
/** Lerps two `#RRGGBB[AA]` strings channel-by-channel; a trailing alpha byte, if any, is ignored. */
export function lerpColorHex(start: string, end: string, t: number): string {
  const channel = (offset: number) => Math.round(lerp(hexChannel(start, offset), hexChannel(end, offset), t)).toString(16).padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export type ParticleSpawnShape = "point" | "rectangle" | "circle";

/** `point` returns the rect centre; `rectangle` is uniform over the area; `circle` is uniform over the ellipse inscribed in the rect. */
export function sampleSpawnPoint(shape: ParticleSpawnShape, width: number, height: number, random: SeededRandom): { x: number; y: number } {
  const cx = width / 2, cy = height / 2;
  if (shape === "point") return { x: cx, y: cy };
  if (shape === "rectangle") return { x: random.next() * width, y: random.next() * height };
  const angle = random.next() * Math.PI * 2;
  const radius = Math.sqrt(random.next());
  return { x: cx + Math.cos(angle) * radius * cx, y: cy + Math.sin(angle) * radius * cy };
}

/** A prewarmed pool entry: `render` is an opaque adapter-owned renderer object created by the same factory as the simulation slot. */
export type ParticleSlot<TRender> = {
  render: TRender;
  age: number;
  lifetime: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Spawn-local position; used to derive the physics delta for world-space reprojection. */
  spawnX: number;
  spawnY: number;
  rotationDegrees: number;
  angularVelocityDegrees: number;
  scaleStart: number;
  scaleEnd: number;
  /** Index into `random`/`sequence` source `assetIds`, picked once at spawn. */
  sourceIndex: number;
  /** Starting frame offset for a `sequence` source with `randomStartFrame`. */
  sequenceStart: number;
  /** World-space spawn position and the linear (rotate+scale) part of the emitter's world transform at spawn time; only meaningful for `world` space particles. */
  worldSpawnX: number;
  worldSpawnY: number;
  spawnMatrixA: number;
  spawnMatrixB: number;
  spawnMatrixC: number;
  spawnMatrixD: number;
};

function createZeroedSlot<TRender>(render: TRender): ParticleSlot<TRender> {
  return { render, age: 0, lifetime: 0, x: 0, y: 0, vx: 0, vy: 0, spawnX: 0, spawnY: 0, rotationDegrees: 0, angularVelocityDegrees: 0, scaleStart: 1, scaleEnd: 1, sourceIndex: 0, sequenceStart: 0, worldSpawnX: 0, worldSpawnY: 0, spawnMatrixA: 1, spawnMatrixB: 0, spawnMatrixC: 0, spawnMatrixD: 1 };
}
function resetSlot<TRender>(slot: ParticleSlot<TRender>): void { Object.assign(slot, createZeroedSlot(slot.render)); }

/**
 * Prewarmed object pool. `acquire`/`release` never call the factory; only `resize` does, and only for
 * the capacity delta. Shrinking removes idle free slots immediately; active slots beyond the new
 * capacity keep running and are permanently destroyed (via `onRemove`, never recycled) the next time
 * they are released instead of returning to the free list.
 */
export class ParticlePool<T> {
  private readonly free: T[] = [];
  private readonly active = new Set<T>();
  private capacity: number;
  public dropped = 0;
  constructor(private readonly factory: () => T, capacity: number, private readonly onRemove?: (value: T) => void) {
    this.capacity = capacity;
    for (let i = 0; i < capacity; i++) this.free.push(factory());
  }
  acquire(): T | undefined {
    const value = this.free.pop();
    if (value === undefined) { this.dropped++; return undefined; }
    this.active.add(value);
    return value;
  }
  release(value: T): void {
    if (!this.active.has(value)) return;
    const overCapacity = this.free.length + this.active.size > this.capacity;
    this.active.delete(value);
    if (overCapacity) this.onRemove?.(value);
    else this.free.push(value);
  }
  resize(capacity: number): void {
    if (capacity > this.capacity) {
      const total = this.free.length + this.active.size;
      for (let i = total; i < capacity; i++) this.free.push(this.factory());
    } else if (capacity < this.capacity) {
      while (this.free.length + this.active.size > capacity && this.free.length > 0) this.onRemove?.(this.free.pop()!);
    }
    this.capacity = capacity;
  }
  /** Permanently destroys every slot, free and active alike; used by `dispose()`. */
  clear(): void {
    for (const value of this.free.splice(0, this.free.length)) this.onRemove?.(value);
    for (const value of this.active) this.onRemove?.(value);
    this.active.clear();
    this.capacity = 0;
  }
  get values(): ReadonlySet<T> { return this.active; }
  get limit(): number { return this.capacity; }
}

export type ParticleSpawnContext = { width: number; height: number; space: "local" | "world" };
export type ParticleDiagnostics = { active: number; dropped: number; playing: boolean; stopped: boolean; disposed: boolean };

/** Adapter-supplied, renderer-specific operations. The simulator never imports Pixi. */
export type ParticleRenderHooks<TRender> = {
  createRender(): TRender;
  hideRender(render: TRender): void;
  destroyRender(render: TRender): void;
  /** The emitter's current world transform linear part `{a,b,c,d}` and translation `{tx,ty}`; read only when a `world`-space particle spawns. */
  getWorldTransform(): { a: number; b: number; c: number; d: number; tx: number; ty: number };
};

/**
 * Schema-neutral, deterministic particle simulation over a prewarmed pool. Owns lifecycle
 * (`play`/`pause`/`step`/`restart`/`stop`/`dispose`), fixed-step ticking, seeded spawn parameters and
 * burst/rate scheduling. Rendering (texture, tint, local/world projection) is the adapter's job; this
 * class only exposes the pool's active slots and the effect definition for it to read.
 */
export class ParticleSimulator<TRender> {
  static readonly stepSeconds = 1 / 60;
  private readonly pool: ParticlePool<ParticleSlot<TRender>>;
  private random: SeededRandom;
  private elapsed = 0;
  private stepAccumulator = 0;
  private emissionAccumulator = 0;
  private burstCursors: number[];
  private multiplier = 1;
  private emitting = false;
  private simulating = false;
  private disposed = false;
  private context: ParticleSpawnContext = { width: 0, height: 0, space: "local" };

  constructor(public definition: ParticleEffectDefinition, private readonly hooks: ParticleRenderHooks<TRender>) {
    this.random = new SeededRandom(definition.seed);
    this.burstCursors = definition.emission.bursts.map(() => 0);
    this.pool = new ParticlePool<ParticleSlot<TRender>>(
      () => createZeroedSlot(hooks.createRender()),
      definition.maxParticles,
      (slot) => hooks.destroyRender(slot.render),
    );
  }

  get activeSlots(): ReadonlySet<ParticleSlot<TRender>> { return this.pool.values; }

  setEmissionMultiplier(value: number): void {
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Emission multiplier must be finite and non-negative.");
    this.multiplier = value;
  }

  /** Adopts a new definition reference without ever comparing identity: unrelated edits, seed changes and texture changes never reset accumulator, PRNG or live particles. Only `maxParticles` triggers a pool resize. */
  syncEffect(effect: ParticleEffectDefinition): void {
    this.definition = effect;
    if (this.pool.limit !== effect.maxParticles) this.pool.resize(effect.maxParticles);
    const cursors = effect.emission.bursts.map((_, index) => this.burstCursors[index] ?? 0);
    this.burstCursors = cursors;
  }

  play(): void { if (this.disposed) return; this.emitting = true; this.simulating = true; }
  /** Freezes emission and every live particle without resetting time or PRNG. */
  pause(): void { if (this.disposed) return; this.emitting = false; this.simulating = false; }
  /** Stops new spawns; already-emitted particles keep simulating to their natural death. */
  stop(): void { if (this.disposed) return; this.emitting = false; this.simulating = true; }

  restart(): void {
    if (this.disposed) return;
    for (const slot of [...this.pool.values]) this.releaseSlot(slot);
    this.elapsed = 0;
    this.stepAccumulator = 0;
    this.emissionAccumulator = 0;
    this.burstCursors = this.definition.emission.bursts.map(() => 0);
    this.pool.dropped = 0;
    this.random = new SeededRandom(this.definition.seed);
    this.emitting = true;
    this.simulating = true;
  }

  /** Idempotent terminal cleanup: destroys every pooled render object and excludes the view from further updates. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.emitting = false;
    this.simulating = false;
    this.pool.clear();
  }

  /** Advances exactly one fixed step regardless of paused/stopped state, and never changes it. */
  step(context: ParticleSpawnContext): void {
    if (this.disposed) return;
    this.context = context;
    this.tick(ParticleSimulator.stepSeconds);
  }

  update(deltaSeconds: number, context: ParticleSpawnContext): void {
    if (this.disposed || !this.simulating) return;
    this.context = context;
    this.stepAccumulator = Math.min(this.stepAccumulator + Math.max(0, deltaSeconds), ParticleSimulator.stepSeconds * 8);
    while (this.stepAccumulator >= ParticleSimulator.stepSeconds) {
      this.stepAccumulator -= ParticleSimulator.stepSeconds;
      this.tick(ParticleSimulator.stepSeconds);
    }
  }

  getDiagnostics(): ParticleDiagnostics {
    return { active: this.pool.values.size, dropped: this.pool.dropped, playing: this.emitting, stopped: this.simulating && !this.emitting && !this.disposed, disposed: this.disposed };
  }

  private tick(dt: number): void {
    // Age and move existing particles before spawning: a particle created this tick starts at age 0
    // and receives its first dt on the next tick, instead of being silently pre-aged by one step.
    const movement = this.definition.particle.movement;
    const drag = Math.max(0, 1 - movement.drag * dt);
    for (const slot of [...this.pool.values]) {
      slot.age += dt;
      if (slot.age >= slot.lifetime) { this.releaseSlot(slot); continue; }
      slot.vx = (slot.vx + movement.accelerationX * dt) * drag;
      slot.vy = (slot.vy + movement.accelerationY * dt) * drag;
      slot.x += slot.vx * dt;
      slot.y += slot.vy * dt;
      slot.rotationDegrees += slot.angularVelocityDegrees * dt;
    }

    const e = this.definition.emission;
    const cycle = e.duration + e.delay;
    this.elapsed += dt;
    if (this.emitting) {
      const cycleElapsed = e.loop ? this.elapsed % cycle : this.elapsed;
      const inWindow = cycleElapsed >= e.delay && cycleElapsed <= e.delay + e.duration;
      if (inWindow && e.rate > 0) {
        this.emissionAccumulator += e.rate * this.multiplier * dt;
        while (this.emissionAccumulator >= 1) { this.emissionAccumulator -= 1; this.spawnParticle(); }
      }
      e.bursts.forEach((burst, index) => {
        const triggerBase = e.delay + burst.time;
        for (;;) {
          const cursor = this.burstCursors[index] ?? 0;
          if (!e.loop && cursor >= 1) break;
          const triggerAt = e.loop ? cursor * cycle + triggerBase : triggerBase;
          if (this.elapsed < triggerAt) break;
          for (let i = 0; i < burst.count; i++) this.spawnParticle();
          this.burstCursors[index] = cursor + 1;
        }
      });
    }
  }

  private spawnParticle(): void {
    const slot = this.pool.acquire();
    if (!slot) return;
    const p = this.definition.particle;
    const rand = this.random;
    const point = sampleSpawnPoint(p.spawnShape.type, this.context.width, this.context.height, rand);
    slot.age = 0;
    slot.lifetime = rand.range(p.lifetime.min, p.lifetime.max);
    slot.spawnX = point.x;
    slot.spawnY = point.y;
    slot.x = point.x;
    slot.y = point.y;
    const speed = rand.range(p.movement.speed.min, p.movement.speed.max);
    const angle = (p.movement.directionDegrees + (rand.next() - 0.5) * p.movement.spreadDegrees) * DEG_TO_RAD;
    slot.vx = Math.cos(angle) * speed;
    slot.vy = Math.sin(angle) * speed;
    slot.rotationDegrees = rand.range(p.visual.rotation.initialDegrees.min, p.visual.rotation.initialDegrees.max);
    slot.angularVelocityDegrees = rand.range(p.visual.rotation.angularVelocityDegrees.min, p.visual.rotation.angularVelocityDegrees.max);
    slot.scaleStart = rand.range(p.visual.scale.start.min, p.visual.scale.start.max);
    slot.scaleEnd = rand.range(p.visual.scale.end.min, p.visual.scale.end.max);
    const source = p.visual.source;
    slot.sourceIndex = source.type === "single" ? 0 : rand.index(source.assetIds.length);
    slot.sequenceStart = source.type === "sequence" && source.randomStartFrame ? rand.index(source.assetIds.length) : 0;
    if (this.context.space === "world") {
      const m = this.hooks.getWorldTransform();
      slot.worldSpawnX = m.a * point.x + m.c * point.y + m.tx;
      slot.worldSpawnY = m.b * point.x + m.d * point.y + m.ty;
      slot.spawnMatrixA = m.a;
      slot.spawnMatrixB = m.b;
      slot.spawnMatrixC = m.c;
      slot.spawnMatrixD = m.d;
    }
  }

  private releaseSlot(slot: ParticleSlot<TRender>): void {
    resetSlot(slot);
    this.hooks.hideRender(slot.render);
    this.pool.release(slot);
  }
}
