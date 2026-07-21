import { type UINode } from "@pixi-ui-editor/schema";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { NodeView } from "./NodeView.js";

export class ContainerNodeView extends NodeView {
  protected syncContent(): void {}
}

/** Layout groups may optionally paint one image behind their managed children. No asset means no content/view at all. */
export class LayoutGroupNodeView extends NodeView {
  private readonly layoutContent = new Container();
  private background?: Sprite;

  constructor(textures: ReadonlyMap<string, Texture> | undefined) {
    super(textures);
    // Yoga owns this inner container only. The NodeView itself retains the authored transform,
    // pivot and grab rectangle used by both editor gizmos and runtime interaction.
    super.addChild(this.layoutContent);
  }

  get layoutTarget(): Container { return this.layoutContent; }

  addLayoutChild<T extends Container[]>(...children: T): T[0] {
    return this.layoutContent.addChild(...children);
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "horizontal-layout" && node.type !== "vertical-layout" && node.type !== "grid-layout") return;
    const texture = node.backgroundAssetId === undefined ? undefined : this.textureFor(node.backgroundAssetId);
    if (texture === undefined) {
      if (this.background !== undefined) { super.removeChild(this.background); this.background.destroy(); this.background = undefined; }
      return;
    }
    if (this.background === undefined) { this.background = new Sprite(texture); super.addChildAt(this.background, 0); }
    else if (this.background.texture !== texture) this.background.texture = texture;
    this.background.setSize(transform.width, transform.height);
  }
}

export class ImageNodeView extends NodeView {
  constructor(assetId: string, textures: ReadonlyMap<string, Texture> | undefined) {
    super(textures);
    const texture = this.textureFor(assetId);
    this.setContent(texture !== undefined ? new Sprite(texture) : new Graphics());
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    const texture = node.type === "image" ? this.textureFor(node.assetId) : undefined;
    // Keep the Sprite and its layout rectangle stable when its image asset changes.
    if (this.content instanceof Sprite && texture !== undefined && this.content.texture !== texture) this.content.texture = texture;
    if (this.content instanceof Sprite) this.content.setSize(transform.width, transform.height);
    else if (this.content instanceof Graphics) this.content.clear().rect(0, 0, transform.width, transform.height).fill(0x4a5568).stroke({ width: 1, color: 0x94a3b8 });
    if (this.content !== undefined) this.content.alpha = node.type === "image" ? node.opacity ?? 1 : 1;
  }
}

export class TextNodeView extends NodeView {
  constructor(text: string, private readonly fonts?: ReadonlyMap<string, string>) {
    super();
    this.setContent(new Text({ text, style: { fontFamily: "Arial", fontSize: 24, fill: 0xffffff } }));
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "text" || !(this.content instanceof Text)) return;
    this.content.text = node.text;
    const style = node.style;
    if (style === undefined) return;
    this.content.style = { fontFamily: style.fontAssetId === undefined ? style.fontFamily : this.fonts?.get(style.fontAssetId) ?? style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontStyle: style.fontStyle, fill: style.fill, align: style.align, wordWrap: style.wordWrap, breakWords: style.breakWords, wordWrapWidth: transform.width, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, stroke: style.stroke === undefined ? undefined : { color: style.stroke.color, width: style.stroke.width } };
    const bounds = this.content.getLocalBounds();
    this.content.x = style.align === "center" ? (transform.width - bounds.width) / 2 - bounds.x : style.align === "right" ? transform.width - bounds.width - bounds.x : -bounds.x;
    this.content.y = style.verticalAlign === "middle" ? (transform.height - bounds.height) / 2 - bounds.y : style.verticalAlign === "bottom" ? transform.height - bounds.height - bounds.y : -bounds.y;
  }
}

export class PrefabInstanceNodeView extends NodeView {
  constructor(expanded: Container | undefined) {
    super();
    this.setContent(expanded ?? new Graphics());
  }

  protected syncContent(_node: UINode, transform: UINode["transform"]): void {
    if (this.content instanceof Graphics) this.content.clear().rect(0, 0, transform.width, transform.height).fill(0xff00ff);
  }
}
