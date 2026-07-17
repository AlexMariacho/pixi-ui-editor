import "@pixi/layout";
import { isLayoutGroup, resolveLayoutGroupSettings, type LayoutAlignment, type LayoutGroupNode, type LayoutProfileId, type UINode } from "@pixi-ui-editor/schema";
import { Container } from "pixi.js";
import { resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "./layout.js";
import { LayoutGroupNodeView } from "./views/basic.js";
import { NodeView } from "./views/NodeView.js";

/** Importing @pixi/layout installs its renderer extension. Kept as a shared explicit contract for every host. */
export function initializePixiLayout(): void { /* @pixi/layout is installed by this module's side effect. */ }

function alignmentParts(alignment: LayoutAlignment) {
  const [vertical, horizontal] = alignment.split("-") as ["upper" | "middle" | "lower", "left" | "center" | "right"];
  return {
    horizontal: horizontal === "left" ? "flex-start" : horizontal === "right" ? "flex-end" : "center",
    vertical: vertical === "upper" ? "flex-start" : vertical === "lower" ? "flex-end" : "center",
  };
}

function layoutSize(node: UINode, profile: LayoutProfileId, parentSize?: LayoutSize): LayoutSize {
  const transform = resolveAnchoredTransform(resolveProfileTransform(node, profile).transform, parentSize);
  return { width: transform.width, height: transform.height };
}

/** Applies one declarative document group to Pixi Layout; no computed Yoga data crosses the document boundary. */
export function applyLayoutGroup(view: Container, node: LayoutGroupNode, profile: LayoutProfileId, parentSize?: LayoutSize, managedSize?: LayoutSize): void {
  const settings = resolveLayoutGroupSettings(node, profile) as LayoutGroupNode["layoutGroup"]["base"];
  const size = managedSize ?? layoutSize(node, profile, parentSize);
  const common = { width: size.width, height: size.height, display: "flex" as const };
  if (node.type === "horizontal-layout" || node.type === "vertical-layout") {
    const linear = settings as Extract<LayoutGroupNode, { type: "horizontal-layout" | "vertical-layout" }> ["layoutGroup"]["base"];
    const target = view instanceof LayoutGroupNodeView ? view.layoutTarget : view;
    const alignment = alignmentParts(linear.childAlignment);
    target.layout = {
      ...common,
      justifyContent: node.type === "horizontal-layout" ? alignment.horizontal : alignment.vertical,
      alignItems: node.type === "horizontal-layout" ? alignment.vertical : alignment.horizontal,
      flexDirection: node.type === "horizontal-layout" ? (linear.reverseOrder ? "row-reverse" : "row") : (linear.reverseOrder ? "column-reverse" : "column"),
      gap: linear.spacing,
      paddingLeft: linear.padding.left, paddingRight: linear.padding.right, paddingTop: linear.padding.top, paddingBottom: linear.padding.bottom,
    } as never;
    return;
  }
  const grid = settings as Extract<LayoutGroupNode, { type: "grid-layout" }> ["layoutGroup"]["base"];
  const reverseX = grid.startCorner.endsWith("right");
  const reverseY = grid.startCorner.startsWith("lower");
  const fillsByRow = grid.constraint === "fixed-column-count" || (grid.constraint === "flexible" && grid.startAxis === "horizontal");
  const target = view instanceof LayoutGroupNodeView ? view.layoutTarget : view;
  const alignment = alignmentParts(grid.childAlignment);
  target.layout = {
    ...common,
    justifyContent: fillsByRow ? alignment.horizontal : alignment.vertical,
    alignItems: fillsByRow ? alignment.vertical : alignment.horizontal,
    alignContent: fillsByRow ? alignment.vertical : alignment.horizontal,
    flexDirection: fillsByRow ? (reverseX ? "row-reverse" : "row") : (reverseY ? "column-reverse" : "column"),
    flexWrap: reverseY && fillsByRow ? "wrap-reverse" : "wrap",
    columnGap: grid.spacingX, rowGap: grid.spacingY,
    paddingLeft: grid.padding.left, paddingRight: grid.padding.right, paddingTop: grid.padding.top, paddingBottom: grid.padding.bottom,
  } as never;
}

/**
 * Runtime-only Yoga owner for one direct child. The wrapper receives Yoga coordinates while the
 * serializable NodeView keeps the shared pivot/rotation/scale/content/hit-test contract.
 */
export class LayoutItemContainer extends Container {
  private node?: UINode;
  private profile: LayoutProfileId = "desktop";
  private fallbackSize: LayoutSize = { width: 0, height: 0 };

  constructor(readonly nodeView: NodeView, private readonly onLayoutChanged?: () => void) {
    super();
    super.addChild(nodeView);
    this.onLayout = () => this.applyComputedSize();
  }

  sync(node: UINode, profile: LayoutProfileId, fallbackSize: LayoutSize): void {
    this.node = node;
    this.profile = profile;
    this.fallbackSize = fallbackSize;
    this.visible = resolveProfileTransform(node, profile).visible;
    this.applyComputedSize();
  }

  private applyComputedSize(): void {
    if (this.node === undefined) return;
    const computed = this.layout?.computedLayout;
    const size = computed === undefined || computed.width <= 0 || computed.height <= 0
      ? this.fallbackSize
      : { width: computed.width, height: computed.height };
    if (isLayoutGroup(this.node)) applyLayoutGroup(this.nodeView, this.node, this.profile, undefined, size);
    this.nodeView.updateManaged(this.node, this.profile, size);
    this.onLayoutChanged?.();
  }
}

/** Marks a direct child's technical wrapper as layout-managed. */
export function applyLayoutItem(view: LayoutItemContainer, node: UINode, parent: LayoutGroupNode, profile: LayoutProfileId): void {
  // Anchors belong to authored positioning and are deliberately ignored while a parent layout owns
  // the rectangle. Width/height remain the child's logical intrinsic size, never Pixi content bounds.
  const transform = resolveProfileTransform(node, profile).transform;
  const own = { width: transform.width, height: transform.height };
  const item = node.layoutItem;
  const settings = resolveLayoutGroupSettings(parent, profile);
  const base = { position: "relative" as const, flexGrow: item?.flexGrow ?? 0, flexShrink: item?.flexShrink ?? 0, flexBasis: item?.flexBasis, alignSelf: item?.alignSelf };
  view.sync(node, profile, own);
  if (parent.type === "grid-layout") {
    const grid = settings as Extract<LayoutGroupNode, { type: "grid-layout" }> ["layoutGroup"]["base"];
    view.layout = { ...base, width: grid.cellWidth, height: grid.cellHeight } as never;
    return;
  }
  const linear = settings as Extract<LayoutGroupNode, { type: "horizontal-layout" | "vertical-layout" }> ["layoutGroup"]["base"];
  const horizontal = parent.type === "horizontal-layout";
  const expandsMain = horizontal
    ? linear.controlChildWidth && linear.forceExpandWidth
    : linear.controlChildHeight && linear.forceExpandHeight;
  const expandsCross = horizontal
    ? linear.controlChildHeight && linear.forceExpandHeight
    : linear.controlChildWidth && linear.forceExpandWidth;
  view.layout = {
    ...base,
    // The schema has no separate min/preferred size yet, so the logical authored rect is the safe
    // intrinsic fallback for both control modes. Force-expand may then replace the relevant axis.
    width: expandsCross && !horizontal ? undefined : own.width,
    height: expandsCross && horizontal ? undefined : own.height,
    ...(expandsMain ? { flexGrow: Math.max(1, item?.flexGrow ?? 0) } : {}),
    ...(expandsCross ? { alignSelf: item?.alignSelf ?? "stretch" } : {}),
  } as never;
}

/** A zero-visual Yoga flex item. Fixed Unity grid constraints need explicit line breaks; this is still solved entirely by Yoga. */
export function createGridLineBreak(parent: Extract<LayoutGroupNode, { type: "grid-layout" }>, profile: LayoutProfileId): Container | undefined {
  const grid = resolveLayoutGroupSettings(parent, profile) as Extract<LayoutGroupNode, { type: "grid-layout" }> ["layoutGroup"]["base"];
  if (grid.constraint === "flexible" || grid.constraintCount === undefined) return undefined;
  const lineBreak = new Container({ label: "__layout-grid-line-break__" });
  lineBreak.layout = (grid.constraint === "fixed-column-count"
    ? { flexBasis: "100%", width: "100%", height: 0 }
    : { flexBasis: "100%", height: "100%", width: 0 }) as never;
  return lineBreak;
}

export function isLayoutManagedChild(node: UINode, nodes: readonly UINode[]): boolean {
  return node.parentId !== null && isLayoutGroup(nodes.find((candidate) => candidate.id === node.parentId) ?? node) && nodes.some((candidate) => candidate.id === node.parentId && isLayoutGroup(candidate));
}
