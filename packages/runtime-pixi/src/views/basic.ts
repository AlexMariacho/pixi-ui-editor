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
  constructor(text: string) {
    super();
    this.setContent(new Text({ text, style: { fontFamily: "Arial", fontSize: 24, fill: 0xffffff } }));
  }

  protected syncContent(node: UINode): void {
    if (node.type === "text" && this.content instanceof Text && this.content.text !== node.text) this.content.text = node.text;
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
