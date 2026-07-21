import type { ParticleEffectDefinition } from "@pixi-ui-editor/schema";

export type ParticleState = { age: number; lifetime: number; x: number; y: number; vx: number; vy: number; frame: number };
export type ParticleDiagnostics = { active: number; dropped: number; playing: boolean };

/** Deterministic xorshift32 generator; it has no DOM/Pixi/ticker dependency. */
export class SeededRandom {
  constructor(private state: number) {}
  next(): number { this.state ^= this.state << 13; this.state ^= this.state >>> 17; this.state ^= this.state << 5; return (this.state >>> 0) / 0x1_0000_0000; }
}

export class ParticlePool<T> {
  private readonly free: T[] = []; private readonly active = new Set<T>(); public dropped = 0;
  constructor(private readonly factory: () => T, private capacity: number) { for (let i = 0; i < capacity; i++) this.free.push(factory()); }
  acquire(): T | undefined { const value = this.free.pop(); if (value === undefined) { this.dropped++; return undefined; } this.active.add(value); return value; }
  release(value: T): void { if (this.active.delete(value)) this.free.push(value); }
  resize(capacity: number): void { this.capacity = capacity; while (this.free.length + this.active.size > capacity && this.free.length) this.free.pop(); while (this.free.length + this.active.size < capacity) this.free.push(this.factory()); }
  get values(): ReadonlySet<T> { return this.active; }
  get limit(): number { return this.capacity; }
}

export class ParticleSimulator {
  static readonly stepSeconds = 1 / 60;
  private accumulator = 0; private elapsed = 0; private running = true; private multiplier = 1; private random: SeededRandom;
  readonly particles: ParticleState[] = []; public dropped = 0;
  constructor(public definition: ParticleEffectDefinition) { this.random = new SeededRandom(definition.seed); }
  restart(): void { this.accumulator = this.elapsed = 0; this.particles.length = 0; this.dropped = 0; this.running = true; this.random = new SeededRandom(this.definition.seed); }
  play(): void { this.running = true; } pause(): void { this.running = false; } stop(clear = true): void { this.running = false; if (clear) this.particles.length = 0; }
  setEmissionMultiplier(value: number): void { if (value < 0 || !Number.isFinite(value)) throw new RangeError("Emission multiplier must be finite and non-negative."); this.multiplier = value; }
  update(deltaSeconds: number): void { if (!this.running) return; this.accumulator = Math.min(this.accumulator + Math.max(0, deltaSeconds), ParticleSimulator.stepSeconds * 8); while (this.accumulator >= ParticleSimulator.stepSeconds) { this.accumulator -= ParticleSimulator.stepSeconds; this.tick(ParticleSimulator.stepSeconds); } }
  private tick(dt: number): void { const e = this.definition.emission; const prior = this.elapsed; this.elapsed += dt; const cycle = e.duration + e.delay; const time = e.loop ? this.elapsed % cycle : this.elapsed; const inEmission = time >= e.delay && time <= e.delay + e.duration; if (inEmission) { const rate = e.rate * this.multiplier; const expected = rate * dt; const count = Math.floor(expected + this.random.next()); for (let i = 0; i < count; i++) this.spawn(); e.bursts.forEach((burst) => { const t = e.loop ? (prior % cycle) : prior; if (t < e.delay + burst.time && time >= e.delay + burst.time) for (let i = 0; i < burst.count; i++) this.spawn(); }); }
    for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]!; p.age += dt; if (p.age >= p.lifetime) { this.particles.splice(i, 1); continue; } p.vx += this.definition.particle.movement.accelerationX * dt; p.vy += this.definition.particle.movement.accelerationY * dt; const drag = Math.max(0, 1 - this.definition.particle.movement.drag * dt); p.vx *= drag; p.vy *= drag; p.x += p.vx * dt; p.y += p.vy * dt; const source = this.definition.particle.visual.source; if (source.type === "sequence") p.frame = Math.floor(p.age * source.fps) % source.assetIds.length; }
  }
  private spawn(): void { if (this.particles.length >= this.definition.maxParticles) { this.dropped++; return; } const m = this.definition.particle.movement, lifetime = this.definition.particle.lifetime.min + (this.definition.particle.lifetime.max - this.definition.particle.lifetime.min) * this.random.next(), speed = m.speed.min + (m.speed.max - m.speed.min) * this.random.next(), angle = (m.directionDegrees + (this.random.next() - .5) * m.spreadDegrees) * Math.PI / 180; this.particles.push({ age: 0, lifetime, x: 0, y: 0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, frame: 0 }); }
  getDiagnostics(): ParticleDiagnostics { return { active: this.particles.length, dropped: this.dropped, playing: this.running }; }
}
