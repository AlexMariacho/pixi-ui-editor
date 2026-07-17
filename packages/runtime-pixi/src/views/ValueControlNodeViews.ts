import { type LayoutPadding, type ProgressBarNode, type SliderNode, type TextStyleDefinition, type UINode } from "@pixi-ui-editor/schema";
import { ProgressBar, Slider } from "@pixi/ui";
import { Sprite, Texture, type FederatedPointerEvent, type TextStyleOptions } from "pixi.js";
import { NodeView, type SceneInteractionMode } from "./NodeView.js";

const ZERO_NINE_SLICE = { bg: [0, 0, 0, 0], fill: [0, 0, 0, 0] } as const;

function textStyle(style: TextStyleDefinition | undefined, fonts: ReadonlyMap<string, string> | undefined): Partial<TextStyleOptions> {
  const resolved = style ?? { fontFamily: "Arial", fontSize: 18, fontWeight: "normal", fontStyle: "normal", fill: "#FFFFFF", align: "center", verticalAlign: "middle", wordWrap: false, breakWords: false, letterSpacing: 0 };
  return {
    fontFamily: resolved.fontAssetId === undefined ? resolved.fontFamily : fonts?.get(resolved.fontAssetId) ?? resolved.fontFamily,
    fontSize: resolved.fontSize,
    fontWeight: resolved.fontWeight,
    fontStyle: resolved.fontStyle,
    fill: resolved.fill,
    align: resolved.align,
    wordWrap: resolved.wordWrap,
    breakWords: resolved.breakWords,
    lineHeight: resolved.lineHeight,
    letterSpacing: resolved.letterSpacing,
    stroke: resolved.stroke === undefined ? undefined : { color: resolved.stroke.color, width: resolved.stroke.width },
  };
}

class SliderControl extends Slider {
  override get value(): number { return super.value; }

  override set value(value: number) {
    const clamped = Math.min(this.max, Math.max(this.min, value));
    const steps = Math.round((clamped - this.min) / this.step);
    const snapped = this.min + steps * this.step;
    // Floating-point steps such as 0.1 should not leak 0.30000000000000004 to game code.
    const precision = Math.max(0, (String(this.step).split(".")[1]?.length ?? 0));
    super.value = Number(Math.min(this.max, Math.max(this.min, snapped)).toFixed(precision));
  }

  /** `@pixi/ui` snaps around zero; authored steps are anchored at min (min, min + step, ...). */
  protected override update(event: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const target = event.currentTarget;
    if (target.parent === null) return;
    const localX = target.parent.worldTransform.applyInverse(event.global).x;
    const ratio = localX / (this.bg?.width || 1);
    this.value = this.min + ratio * (this.max - this.min);
  }

  setValueLabel(show: boolean, style: Partial<TextStyleOptions>): void {
    if (this.value1Text === undefined) return;
    this.value1Text.visible = show;
    this.value1Text.style = style as never;
    this.updateSlider();
  }

  setHandle(texture: Texture): void {
    this.slider = new Sprite(texture);
  }

  setFillConfig(texture: Texture, padding: LayoutPadding): void {
    this.options.fillPaddings = padding;
    this.setFill(texture, padding);
  }

  sizeHandle(height: number): void {
    const handle = this.slider1?.children[0];
    if (handle instanceof Sprite) handle.setSize(height, height);
    this.updateSlider();
  }
}

class ProgressControl extends ProgressBar {
  setFillConfig(texture: Texture, padding: LayoutPadding): void {
    this.options.fillPaddings = padding;
    this.setFill(texture, padding);
  }
}

/** Horizontal live-value control backed by `@pixi/ui` Slider. */
export class SliderNodeView extends NodeView {
  private readonly control: SliderControl;
  private readonly fonts: ReadonlyMap<string, string> | undefined;
  private backgroundTexture: Texture;
  private fillTexture: Texture;
  private handleTexture: Texture;
  private paddingKey = "";

  constructor(node: SliderNode, textures: ReadonlyMap<string, Texture> | undefined, interaction: SceneInteractionMode, fonts: ReadonlyMap<string, string> | undefined) {
    super(textures);
    this.fonts = fonts;
    this.backgroundTexture = this.textureFor(node.backgroundAssetId) ?? Texture.WHITE;
    this.fillTexture = this.textureFor(node.fillAssetId) ?? Texture.WHITE;
    this.handleTexture = this.textureFor(node.handleAssetId) ?? Texture.WHITE;
    this.control = new SliderControl({
      bg: this.backgroundTexture,
      fill: this.fillTexture,
      slider: new Sprite(this.handleTexture),
      fillPaddings: node.fillPadding,
      nineSliceSprite: ZERO_NINE_SLICE as unknown as { bg: [number, number, number, number]; fill: [number, number, number, number] },
      min: node.min,
      max: node.max,
      step: node.step,
      value: node.defaultValue,
      // Keep the library label allocated so show/style can change incrementally.
      showValue: true,
      valueTextStyle: textStyle(node.valueTextStyle, fonts),
    });
    if (interaction === "authoring") this.control.eventMode = "none";
    this.setContent(this.control);
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "slider") return;
    const background = this.textureFor(node.backgroundAssetId) ?? Texture.WHITE;
    const fill = this.textureFor(node.fillAssetId) ?? Texture.WHITE;
    const handle = this.textureFor(node.handleAssetId) ?? Texture.WHITE;
    const paddingKey = `${node.fillPadding.left}/${node.fillPadding.right}/${node.fillPadding.top}/${node.fillPadding.bottom}`;
    if (background !== this.backgroundTexture) { this.backgroundTexture = background; this.control.setBackground(background); }
    if (fill !== this.fillTexture || paddingKey !== this.paddingKey) { this.fillTexture = fill; this.paddingKey = paddingKey; this.control.setFillConfig(fill, node.fillPadding); }
    if (handle !== this.handleTexture) { this.handleTexture = handle; this.control.setHandle(handle); }
    this.control.min = node.min;
    this.control.max = node.max;
    this.control.step = node.step;
    this.control.value = this.control.value;
    this.control.setSize(transform.width, transform.height);
    this.control.sizeHandle(transform.height);
    this.control.setValueLabel(node.showValue ?? false, textStyle(node.valueTextStyle, this.fonts));
  }

  get value(): number { return this.control.value; }
  set value(value: number) { this.control.value = value; }
  get min(): number { return this.control.min; }
  set min(value: number) { this.control.min = value; this.control.value = this.control.value; }
  get max(): number { return this.control.max; }
  set max(value: number) { this.control.max = value; this.control.value = this.control.value; }
  get step(): number { return this.control.step; }
  set step(value: number) { this.control.step = value; this.control.value = this.control.value; }
  get onUpdate(): Slider["onUpdate"] { return this.control.onUpdate; }
  get onChange(): Slider["onChange"] { return this.control.onChange; }
}

/** Left-to-right runtime progress backed by `@pixi/ui` ProgressBar. */
export class ProgressBarNodeView extends NodeView {
  private readonly control: ProgressControl;
  private backgroundTexture: Texture;
  private fillTexture: Texture;
  private paddingKey = "";

  constructor(node: ProgressBarNode, textures: ReadonlyMap<string, Texture> | undefined) {
    super(textures);
    this.backgroundTexture = this.textureFor(node.backgroundAssetId) ?? Texture.WHITE;
    this.fillTexture = this.textureFor(node.fillAssetId) ?? Texture.WHITE;
    this.control = new ProgressControl({
      bg: this.backgroundTexture,
      fill: this.fillTexture,
      fillPaddings: node.fillPadding,
      nineSliceSprite: ZERO_NINE_SLICE as unknown as { bg: [number, number, number, number]; fill: [number, number, number, number] },
      progress: node.defaultProgress,
    });
    this.setContent(this.control);
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "progress-bar") return;
    const background = this.textureFor(node.backgroundAssetId) ?? Texture.WHITE;
    const fill = this.textureFor(node.fillAssetId) ?? Texture.WHITE;
    const paddingKey = `${node.fillPadding.left}/${node.fillPadding.right}/${node.fillPadding.top}/${node.fillPadding.bottom}`;
    if (background !== this.backgroundTexture) { this.backgroundTexture = background; this.control.setBackground(background); }
    if (fill !== this.fillTexture || paddingKey !== this.paddingKey) { this.fillTexture = fill; this.paddingKey = paddingKey; this.control.setFillConfig(fill, node.fillPadding); }
    this.control.setSize(transform.width, transform.height);
  }

  get progress(): number { return this.control.progress; }
  set progress(value: number) { this.control.progress = value; }
}
