import type { ParticleEffectDefinition, UINode } from "@pixi-ui-editor/schema";
import { Container, Sprite, Texture } from "pixi.js";
import { ParticleSimulator } from "../particles.js";
import { NodeView } from "./NodeView.js";

/** Thin Pixi adapter: NodeView continues to own transforms, layout and hit testing. */
export class ParticleEmitterNodeView extends NodeView {
  private readonly contentRoot = new Container();
  private simulator: ParticleSimulator;
  private readonly sprites: Sprite[] = [];
  constructor(effect: ParticleEffectDefinition, textures?: ReadonlyMap<string, Texture>) { super(textures); this.simulator = new ParticleSimulator(effect); this.setContent(this.contentRoot); }
  updateParticles(deltaSeconds: number): void { this.simulator.update(deltaSeconds); const source = this.simulator.definition.particle.visual.source; while (this.sprites.length < this.simulator.particles.length) { const sprite = new Sprite(Texture.EMPTY); this.sprites.push(sprite); this.contentRoot.addChild(sprite); } this.sprites.forEach((sprite, i) => { const particle = this.simulator.particles[i]; if (!particle) { sprite.visible = false; return; } const id = source.type === "single" ? source.assetId : source.assetIds[source.type === "sequence" ? particle.frame : 0]!; const texture = this.textureFor(id); if (texture) sprite.texture = texture; sprite.position.set(particle.x, particle.y); sprite.visible = true; }); }
  play(): void { this.simulator.play(); } pause(): void { this.simulator.pause(); } restart(): void { this.simulator.restart(); } stop(mode: "clear" | "finish" = "clear"): void { this.simulator.stop(mode === "clear"); } setEmissionMultiplier(value: number): void { this.simulator.setEmissionMultiplier(value); } getDiagnostics() { return this.simulator.getDiagnostics(); }
  syncEffect(effect: ParticleEffectDefinition): void { if (this.simulator.definition !== effect) { this.simulator.definition = effect; this.simulator.restart(); } }
  protected syncContent(node: UINode): void { if (node.type === "particle-emitter" && node.autoplay) this.simulator.play(); }
}
