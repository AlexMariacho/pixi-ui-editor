import { NodeView, resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "@pixi-ui-editor/runtime-pixi";
import type { LayoutProfileId, UINode } from "@pixi-ui-editor/schema";
import { Container } from "pixi.js";
export type CanvasBounds = { x: number; y: number; width: number; height: number };

export function nodeRectBounds(nodeView: Container, width: number, height: number): CanvasBounds {
  const matrix = nodeView.getGlobalTransform();
  const corners = [
    { x: matrix.tx, y: matrix.ty },
    { x: matrix.a * width + matrix.tx, y: matrix.b * width + matrix.ty },
    { x: matrix.c * height + matrix.tx, y: matrix.d * height + matrix.ty },
    {
      x: matrix.a * width + matrix.c * height + matrix.tx,
      y: matrix.b * width + matrix.d * height + matrix.ty,
    },
  ];
  const left = Math.min(...corners.map((corner) => corner.x));
  const top = Math.min(...corners.map((corner) => corner.y));
  const right = Math.max(...corners.map((corner) => corner.x));
  const bottom = Math.max(...corners.map((corner) => corner.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function displayedBounds(nodeView: Container): CanvasBounds {
  const bounds = nodeView.getBounds();
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

export function selectionBounds(
  node: UINode,
  nodeViews: ReadonlyMap<string, Container>,
): CanvasBounds | undefined {
  const nodeView = nodeViews.get(node.id);
  if (nodeView === undefined || nodeView.destroyed || !nodeView.visible) return undefined;
  if (nodeView instanceof NodeView) {
    const { width, height } = nodeView.layoutRectangle;
    return nodeRectBounds(nodeView, width, height);
  }
  return displayedBounds(nodeView);
}

export function getParentLayoutSize(owner: { nodes: UINode[]; layout?: { referenceViewports: Record<LayoutProfileId, LayoutSize> } }, node: UINode, profile: LayoutProfileId): LayoutSize | undefined {
  if (node.parentId !== null) {
    const parent = owner.nodes.find((candidate) => candidate.id === node.parentId);
    if (parent !== undefined) {
      if (owner.layout !== undefined && parent.parentId === null) return owner.layout.referenceViewports[profile];
      // Родитель может быть сам растянут якорями, поэтому его размер разрешается рекурсивно.
      const transform = resolveAnchoredTransform(resolveProfileTransform(parent, profile).transform, getParentLayoutSize(owner, parent, profile));
      return { width: transform.width, height: transform.height };
    }
  }
  return owner.layout?.referenceViewports[profile];
}
