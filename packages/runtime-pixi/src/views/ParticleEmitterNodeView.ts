import type { ParticleEffectDefinition, UINode } from "@pixi-ui-editor/schema";
import { Container, Sprite, Texture, type DestroyOptions } from "pixi.js";
import { lerp, lerpColorHex, ParticleSimulator, type ParticleSlot } from "../particles.js";
import { NodeView } from "./NodeView.js";

const DEG_TO_RAD = Math.PI / 180;

/** Thin Pixi adapter: NodeView continues to own transforms, layout and hit testing. */
export class ParticleEmitterNodeView extends NodeView {
  private readonly contentRoot = new Container();
  private readonly simulator: ParticleSimulator<Sprite>;
  private simulationSpace: "local" | "world" = "local";
  private autoplayHandled = false;

  constructor(effect: ParticleEffectDefinition, textures?: ReadonlyMap<string, Texture>) {
    super(textures);
    this.setContent(this.contentRoot);
    this.simulator = new ParticleSimulator<Sprite>(effect, {
      createRender: () => {
        const sprite = new Sprite(Texture.EMPTY);
        sprite.anchor.set(0.5);
        sprite.visible = false;
        this.contentRoot.addChild(sprite);
        return sprite;
      },
      hideRender: (sprite) => { sprite.visible = false; },
      destroyRender: (sprite) => { this.contentRoot.removeChild(sprite); sprite.destroy(); },
      getWorldTransform: () => this.worldTransform,
    });
  }

  updateParticles(deltaSeconds: number): void {
    const rect = this.layoutRectangle;
    this.simulator.update(deltaSeconds, { width: rect.width, height: rect.height, space: this.simulationSpace });
    this.syncRender();
  }

  play(): void { this.simulator.play(); }
  pause(): void { this.simulator.pause(); }
  restart(): void { this.simulator.restart(); }
  stop(): void { this.simulator.stop(); }
  /** Advances exactly one fixed step even while paused, preserving the current playing/paused state. */
  step(): void {
    const rect = this.layoutRectangle;
    this.simulator.step({ width: rect.width, height: rect.height, space: this.simulationSpace });
    this.syncRender();
  }
  dispose(): void { this.simulator.dispose(); }
  setEmissionMultiplier(value: number): void { this.simulator.setEmissionMultiplier(value); }
  getDiagnostics() { return this.simulator.getDiagnostics(); }

  syncEffect(effect: ParticleEffectDefinition): void { this.simulator.syncEffect(effect); }

  override destroy(options?: DestroyOptions): void {
    this.dispose();
    super.destroy(options);
  }

  protected syncContent(node: UINode): void {
    if (node.type !== "particle-emitter") return;
    this.simulationSpace = node.simulationSpace;
    // Autoplay only fires once, right after construction: syncContent also runs on every unrelated
    // document edit (via the shared node-sync pass), and re-arming play() there would silently
    // override an explicit pause()/stop() the moment the author touches anything else in the project.
    if (!this.autoplayHandled) {
      this.autoplayHandled = true;
      if (node.autoplay) this.simulator.play();
    }
  }

  private syncRender(): void {
    const p = this.simulator.definition.particle;
    const source = p.visual.source;
    const space = this.simulationSpace;
    const inverse = space === "world" ? this.worldTransform : undefined;
    for (const slot of this.simulator.activeSlots) {
      const sprite = slot.render;
      const t = slot.lifetime > 0 ? Math.min(1, slot.age / slot.lifetime) : 1;
      sprite.alpha = lerp(p.visual.alpha.start, p.visual.alpha.end, t);
      sprite.tint = lerpColorHex(p.visual.tint.start, p.visual.tint.end, t);
      sprite.scale.set(lerp(slot.scaleStart, slot.scaleEnd, t));
      sprite.rotation = slot.rotationDegrees * DEG_TO_RAD;
      sprite.blendMode = p.visual.blendMode;
      const assetId = source.type === "single" ? source.assetId
        : source.type === "random" ? source.assetIds[slot.sourceIndex]!
        : source.assetIds[sequenceFrame(source, slot)]!;
      const texture = this.textureFor(assetId);
      if (texture) sprite.texture = texture;
      if (space === "world" && inverse !== undefined) {
        const dx = slot.x - slot.spawnX, dy = slot.y - slot.spawnY;
        const worldX = slot.worldSpawnX + slot.spawnMatrixA * dx + slot.spawnMatrixC * dy;
        const worldY = slot.worldSpawnY + slot.spawnMatrixB * dx + slot.spawnMatrixD * dy;
        const local = inverse.applyInverse({ x: worldX, y: worldY });
        sprite.position.set(local.x, local.y);
      } else {
        sprite.position.set(slot.x, slot.y);
      }
      sprite.visible = true;
    }
  }
}

type SequenceSource = Extract<ParticleEffectDefinition["particle"]["visual"]["source"], { type: "sequence" }>;
function sequenceFrame(source: SequenceSource, slot: ParticleSlot<Sprite>): number {
  const length = source.assetIds.length;
  const raw = slot.sequenceStart + Math.floor(slot.age * source.fps);
  return source.loop ? ((raw % length) + length) % length : Math.min(raw, length - 1);
}
