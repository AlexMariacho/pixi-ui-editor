import { type ScrollViewNode, type UINode } from "@pixi-ui-editor/schema";
import { ScrollBox } from "@pixi/ui";
import { Container, Texture } from "pixi.js";
import { SCROLL_DIRECTION_TO_LIST_TYPE } from "../scrollView.js";
import { NodeView, type SceneInteractionMode } from "./NodeView.js";

/**
 * Adapts a scroll-view node to `@pixi/ui`'s `ScrollBox`, which already implements the
 * viewport/content/mask contract on its own: `scrollBox.list` is the content container that moves,
 * and its own mask clips overflow — this class never reimplements clipping or drag/wheel scrolling.
 * `direction`, `cornerRadius`, `easingEnabled` and `shiftWheelHorizontal` have no safe public API for
 * live updates in `@pixi/ui` 2.3.2 (they live on a protected `options` field, and `easingEnabled` is
 * captured once into an internal `Trackpad`), so changing them rebuilds the scene like Spine's
 * `animation`/`loop` do; padding, item spacing, background color and the view's own size stay
 * incremental through `syncContent`.
 */
export class ScrollViewNodeView extends NodeView {
  private readonly scrollBox: ScrollBox;

  constructor(node: ScrollViewNode, textures: ReadonlyMap<string, Texture> | undefined, interaction: SceneInteractionMode) {
    super(textures);
    const settings = node.scrollView;
    this.scrollBox = new ScrollBox({
      width: node.transform.width,
      height: node.transform.height,
      type: SCROLL_DIRECTION_TO_LIST_TYPE[settings.direction],
      background: settings.backgroundColor,
      radius: settings.cornerRadius,
      disableEasing: !settings.easingEnabled,
      // Зафиксировано решением: скролл никогда не перехватывает wheel вне компонента.
      globalScroll: false,
      shiftScroll: settings.shiftWheelHorizontal ?? false,
      leftPadding: settings.padding.left,
      rightPadding: settings.padding.right,
      topPadding: settings.padding.top,
      bottomPadding: settings.padding.bottom,
      elementsMargin: settings.itemSpacing,
    });
    // Authoring-канвас инертен: selection и drag идут через grab-прямоугольник базового NodeView.
    if (interaction === "authoring") this.scrollBox.eventMode = "none";
    this.setContent(this.scrollBox);
  }

  addScrollItem<T extends Container[]>(...children: T): T[0] {
    return this.scrollBox.addItem(...children);
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "scroll-view") return;
    this.scrollBox.setSize(transform.width, transform.height);
    this.scrollBox.setBackground(node.scrollView.backgroundColor);
    const list = this.scrollBox.list;
    if (list !== undefined) {
      list.leftPadding = node.scrollView.padding.left;
      list.rightPadding = node.scrollView.padding.right;
      list.topPadding = node.scrollView.padding.top;
      list.bottomPadding = node.scrollView.padding.bottom;
      list.elementsMargin = node.scrollView.itemSpacing;
    }
    this.scrollBox.resize(true);
  }

  get scrollX(): number { return this.scrollBox.scrollX; }
  set scrollX(value: number) { this.scrollBox.scrollX = value; }
  get scrollY(): number { return this.scrollBox.scrollY; }
  set scrollY(value: number) { this.scrollBox.scrollY = value; }
  scrollTo(elementId: number): void { this.scrollBox.scrollTo(elementId); }
  scrollTop(): void { this.scrollBox.scrollTop(); }
  scrollBottom(): void { this.scrollBox.scrollBottom(); }
  get onScroll(): ScrollBox["onScroll"] { return this.scrollBox.onScroll; }
}
