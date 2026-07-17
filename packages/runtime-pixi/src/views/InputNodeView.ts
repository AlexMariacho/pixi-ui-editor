import { type UINode } from "@pixi-ui-editor/schema";
import { Input, type InputOptions } from "@pixi/ui";
import { Graphics, Sprite, Texture, type TextStyleOptions } from "pixi.js";
import { NodeView, type SceneInteractionMode } from "./NodeView.js";

export type InputNode = Extract<UINode, { type: "input" }>;

/**
 * `@pixi/ui`'s `Input` keeps almost everything we need to live-update (`focus`/`blur`, live-update,
 * safe teardown) behind `protected` members. Subclassing — instead of composing around the public
 * surface, like `ButtonNodeView` does with `FancyButton` — is the only way to reach them without
 * reimplementing the DOM bridge (the actual `<input>` element, its listeners, and the pointer/window
 * activation dance) that `Input` already owns.
 */
class InputControl extends Input {
  /** Programmatic focus for runtime/game code: starts editing without requiring a real pointer tap. */
  focusNow(): void {
    this._startEditing();
  }

  /** Programmatic blur: also how we guarantee the live DOM `<input>` is gone before `destroy()`. */
  blurNow(): void {
    this.stopEditing();
  }

  setPlaceholderText(text: string): void {
    if (this.placeholder === undefined) return;
    this.placeholder.text = text;
    this.placeholder.visible = this.value.length === 0 && !this.editing;
  }

  setTextStyle(style: TextStyleOptions): void {
    if (this.inputField !== undefined) this.inputField.style = style as never;
    if (this.placeholder !== undefined) this.placeholder.style = style as never;
    this.align();
  }

  setAlign(align: InputOptions["align"]): void {
    this.options.align = align;
    this.align();
  }

  setMaxLength(maxLength: number | undefined): void {
    this.options.maxLength = maxLength;
  }

  setCleanOnFocus(cleanOnFocus: boolean): void {
    this.options.cleanOnFocus = cleanOnFocus;
  }

  /** Re-reads `_bg`'s current size: used after resizing the background view directly. */
  realign(): void {
    this.align();
  }

  refreshMaskSize(): void {
    this.updateInputMaskSize();
  }

  override destroy(options?: Parameters<Input["destroy"]>[0]): void {
    // `Input.destroy()` only removes its own listeners/window binding; if this view is torn down
    // mid-edit it never blurs, so the live DOM `<input>` (appended to `document.body`) would leak.
    // `stopEditing()` blurs, removes the element, and clears our reference before we call super.
    this.blurNow();
    super.destroy(options);
  }
}

/** Neutral placeholder used while no background image asset is assigned; never a hidden asset. */
function drawNeutralBackground(graphics: Graphics, width: number, height: number): Graphics {
  return graphics.clear().rect(0, 0, width, height).fill(0x4a5568).stroke({ width: 1, color: 0x94a3b8 });
}

function resolveTextStyle(style: InputNode["textStyle"], fonts: ReadonlyMap<string, string> | undefined): TextStyleOptions {
  return {
    fontFamily: style.fontAssetId === undefined ? style.fontFamily : fonts?.get(style.fontAssetId) ?? style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fill: style.fill,
    letterSpacing: style.letterSpacing,
    stroke: style.stroke === undefined ? undefined : { color: style.stroke.color, width: style.stroke.width },
  };
}

/**
 * Adapts an input node to `@pixi/ui`'s `Input`, which already owns the single-line text/placeholder/
 * cursor content and the DOM `<input>` bridge used to read real keyboard input — this class never
 * reimplements any of that. `clipText` is the one field without a safe live-update path: enabling it
 * builds `Input`'s internal mask only when its background is (re)assigned, and there is no supported
 * way to remove that mask again once added, so toggling it rebuilds the scene like Spine's
 * `animation`/`loop` and ScrollView's `direction`/`easingEnabled` (see `nodeStructure` in
 * `SceneCanvas.tsx`). Everything else here — background, placeholder, defaultValue, maxLength,
 * secure, align, padding, cleanOnFocus, textStyle, size — stays incremental through `syncContent`.
 */
export class InputNodeView extends NodeView {
  private readonly control: InputControl;
  private readonly fonts: ReadonlyMap<string, string> | undefined;
  private readonly interaction: SceneInteractionMode;
  private backgroundTexture: Texture | undefined;
  private readonly backgroundFallback = new Graphics();

  constructor(node: InputNode, textures: ReadonlyMap<string, Texture> | undefined, interaction: SceneInteractionMode, fonts: ReadonlyMap<string, string> | undefined) {
    super(textures);
    this.fonts = fonts;
    this.interaction = interaction;
    this.backgroundTexture = node.backgroundAssetId === undefined ? undefined : this.textureFor(node.backgroundAssetId);
    const initialBg = this.backgroundTexture !== undefined
      ? new Sprite(this.backgroundTexture)
      : drawNeutralBackground(this.backgroundFallback, node.transform.width, node.transform.height);

    this.control = new InputControl({
      bg: initialBg,
      textStyle: resolveTextStyle(node.textStyle, fonts),
      placeholder: node.placeholder,
      value: node.defaultValue,
      maxLength: node.maxLength,
      secure: node.secure,
      align: node.align,
      padding: node.padding,
      cleanOnFocus: node.cleanOnFocus,
      // Fixed at construction: see the class comment on rebuild-on-change for `clipText`.
      addMask: node.clipText,
    });
    // Authoring-канвас инертен: без реального pointer eventMode 'none' `Input` никогда не активирует
    // свой глобальный window click listener в `this.activation`, поэтому DOM <input> не создаётся и
    // клавиатурные шорткаты редактора не перехватываются. Selection/drag остаются за grab-прямоугольником
    // базового NodeView.
    if (interaction === "authoring") this.control.eventMode = "none";
    this.setContent(this.control);
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "input") return;

    const texture = node.backgroundAssetId === undefined ? undefined : this.textureFor(node.backgroundAssetId);
    if (texture !== this.backgroundTexture) {
      this.backgroundTexture = texture;
      this.control.bg = texture !== undefined ? new Sprite(texture) : drawNeutralBackground(new Graphics(), transform.width, transform.height);
    }
    const bg = this.control.bg;
    if (bg instanceof Sprite) bg.setSize(transform.width, transform.height);
    else if (bg instanceof Graphics) drawNeutralBackground(bg, transform.width, transform.height);
    this.control.refreshMaskSize();

    this.control.setPlaceholderText(node.placeholder);
    this.control.setMaxLength(node.maxLength);
    this.control.secure = node.secure;
    this.control.setAlign(node.align);
    this.control.padding = node.padding;
    this.control.setCleanOnFocus(node.cleanOnFocus);
    this.control.setTextStyle(resolveTextStyle(node.textStyle, this.fonts));
    // `defaultValue` is only a presentation default. In authoring, editing is impossible, so the
    // shown value can never diverge and re-applying it every sync is both safe and required (e.g.
    // after a text/document change). In runtime, a consuming app may call this repeatedly for
    // unrelated reasons (a parent's own layout loop, etc.); overwriting `value` here would silently
    // discard whatever the player already typed, so runtime only ever seeds it once at construction.
    if (this.interaction === "authoring") this.control.value = node.defaultValue;
    this.control.realign();
  }

  /** Current text value. Runtime input never writes back to the document — only this live view holds it. */
  get value(): string {
    return this.control.value;
  }

  set value(text: string) {
    this.control.value = text;
  }

  /** Programmatically starts editing, e.g. from game code reacting to some other UI event. */
  focus(): void {
    this.control.focusNow();
  }

  /** Programmatically ends editing without discarding the current value. */
  blur(): void {
    this.control.blurNow();
  }

  get onChange(): Input["onChange"] {
    return this.control.onChange;
  }

  get onEnter(): Input["onEnter"] {
    return this.control.onEnter;
  }
}
