import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { type LayoutProfileId, type UINode } from "@pixi-ui-editor/schema";
import { Container, Rectangle, Texture, type PointData } from "pixi.js";
import { resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "../layout.js";

/**
 * Whether a built scene is an inert authoring surface or a live one.
 * The editor canvas builds `authoring` scenes so controls never swallow selection and drag
 * gestures; Preview and the consuming app build `runtime` scenes with real pointer handling.
 */
export type SceneInteractionMode = "authoring" | "runtime";

/**
 * Base display object for every schema node type. The whole layout contract — profile overrides,
 * anchors, pivot, position, scale, visibility — lives here once; subclasses only synchronize their
 * type-specific content against the resolved layout rectangle.
 */
export abstract class NodeView extends Container {
  protected content?: Container;
  /** A mutable scene texture map: assets may be loaded after this stable view was created. */
  protected readonly textures: ReadonlyMap<string, Texture> | undefined;
  /** Node's own grab rectangle in local space, kept equal to its resolved layout rectangle. */
  private readonly grabRect = new Rectangle();

  constructor(textures?: ReadonlyMap<string, Texture>) {
    super();
    this.textures = textures;
  }

  protected textureFor(assetId: string): Texture | undefined {
    return this.textures?.get(assetId);
  }

  /**
   * Makes every node selectable and draggable by its layout rectangle, whatever it renders.
   *
   * Lives here rather than in a subclass because a bare `Container` has no `containsPoint` of its
   * own: without this, Pixi could only find a node through whatever content the subclass happens to
   * draw, so nodes that draw nothing (container) or keep their content out of hit testing (button,
   * whose `@pixi/ui` view is inert while authoring) would silently stop being selectable.
   *
   * Deliberately `containsPoint` and NOT `hitArea`: Pixi's `hitPruneFn` drops a container together
   * with its whole subtree once the point falls outside its `hitArea`, which would make any child
   * reaching past its parent's rectangle visible but unclickable. `containsPoint` never clips
   * children — they are hit-tested first and independently, so a child always stays grabbable.
   */
  containsPoint(point: PointData): boolean {
    return this.grabRect.contains(point.x, point.y);
  }

  protected setContent(content: Container): void {
    this.content = content;
    this.addChild(content);
  }

  /** Syncs type-specific content to the resolved layout rectangle; layout math itself is shared. */
  protected abstract syncContent(node: UINode, transform: UINode["transform"]): void;

  update(node: UINode, profile: LayoutProfileId, parentSize?: LayoutSize): void {
    const resolved = resolveProfileTransform(node, profile);
    const transform = resolveAnchoredTransform(resolved.transform, parentSize);
    this.syncContent(node, transform);

    const pivotX = (transform.pivotX ?? 0) * transform.width;
    const pivotY = (transform.pivotY ?? 0) * transform.height;
    this.pivot.set(pivotX, pivotY);
    // x/y are the pivot offset from the resolved anchor.  Thus a centred anchor and pivot at
    // zero offsets place the visual centre exactly at the parent's centre.
    this.position.set(transform.x, transform.y);
    this.rotation = transform.rotation;
    this.scale.set(transform.scaleX, transform.scaleY);
    this.visible = resolved.visible;
    // Тот же прямоугольник, что видит пользователь: grab-зона не зависит от содержимого ноды.
    this.grabRect.x = 0;
    this.grabRect.y = 0;
    this.grabRect.width = transform.width;
    this.grabRect.height = transform.height;
  }

  getSpine(): Spine | undefined {
    return this.content instanceof Spine ? this.content : undefined;
  }
}
