import { type UINode } from "@pixi-ui-editor/schema";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { NodeView } from "./NodeView.js";

export class ContainerNodeView extends NodeView {
  protected syncContent(): void {}
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
