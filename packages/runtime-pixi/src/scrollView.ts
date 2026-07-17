import { type LayoutProfileId, type ScrollViewNode, type UINode } from "@pixi-ui-editor/schema";
import type { ListType } from "@pixi/ui";
import { Container } from "pixi.js";
import type { LayoutSize } from "./layout.js";
import { NodeView } from "./views/NodeView.js";

/** `@pixi/ui`'s `List` only knows "vertical" | "horizontal" | "bidirectional". */
export const SCROLL_DIRECTION_TO_LIST_TYPE: Record<ScrollViewNode["scrollView"]["direction"], ListType> = {
  vertical: "vertical",
  horizontal: "horizontal",
  both: "bidirectional",
};

/**
 * Runtime-only position owner for one direct scroll-view child. `@pixi/ui`'s `List` arranges items
 * by reading `Container.width`/`height` and writing `x`/`y` directly; a bare `NodeView` reports 0 for
 * both when it renders nothing (same issue the base grab-rectangle works around for hit testing), so
 * this wrapper reports the child's own logical rectangle instead. `List` owns only this wrapper's
 * position — the wrapped `NodeView` keeps its own pivot/rotation/scale/visibility contract via
 * `updateManaged`, exactly like a layout group's `LayoutItemContainer`.
 */
export class ScrollItemContainer extends Container {
  private itemWidth = 0;
  private itemHeight = 0;

  constructor(readonly nodeView: NodeView, private readonly onResized?: () => void) {
    super();
    super.addChild(nodeView);
  }

  override get width(): number { return this.itemWidth; }
  override set width(value: number) { this.itemWidth = value; }
  override get height(): number { return this.itemHeight; }
  override set height(value: number) { this.itemHeight = value; }

  sync(node: UINode, profile: LayoutProfileId, size: LayoutSize): void {
    this.itemWidth = size.width;
    this.itemHeight = size.height;
    this.nodeView.updateManaged(node, profile, size);
    this.onResized?.();
  }
}
