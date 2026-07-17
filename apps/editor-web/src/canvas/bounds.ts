import { resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "@pixi-ui-editor/runtime-pixi";
import type { LayoutProfileId, UINode } from "@pixi-ui-editor/schema";
import { Container } from "pixi.js";
import { EMPTY_CONTAINER_GIZMO_SIZE } from "./gizmos.js";
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
  owner: { nodes: UINode[]; layout?: { referenceViewports: Record<LayoutProfileId, LayoutSize> } },
  nodesById: ReadonlyMap<string, UINode>,
  nodeViews: ReadonlyMap<string, Container>,
  profile: LayoutProfileId,
): CanvasBounds | undefined {
  const nodeView = nodeViews.get(node.id);
  if (nodeView === undefined || nodeView.destroyed || !nodeView.visible) return undefined;

  // Text's glyph bounds and Spine's animated bounds are content details. Anchors, pivots and
  // resize handles operate on the stable width/height layout rectangle for both node types.
  if (node.type === "text" || node.type === "spine" || node.type === "prefab-instance") {
    const transform = resolveAnchoredTransform(resolveProfileTransform(node, profile).transform, getParentLayoutSize(owner, node, profile));
    return nodeRectBounds(nodeView, transform.width, transform.height);
  }
  if (node.type !== "container") return displayedBounds(nodeView);

  const childBounds = node.children.flatMap((childId) => {
    const child = nodesById.get(childId);
    if (child === undefined) return [];
    const bounds = selectionBounds(child, owner, nodesById, nodeViews, profile);
    return bounds === undefined ? [] : [bounds];
  });
  return unionBounds(childBounds) ?? nodeRectBounds(nodeView, EMPTY_CONTAINER_GIZMO_SIZE, EMPTY_CONTAINER_GIZMO_SIZE);
}

export function unionBounds(bounds: readonly CanvasBounds[]): CanvasBounds | undefined {
  if (bounds.length === 0) return undefined;
  const left = Math.min(...bounds.map((candidate) => candidate.x));
  const top = Math.min(...bounds.map((candidate) => candidate.y));
  const right = Math.max(...bounds.map((candidate) => candidate.x + candidate.width));
  const bottom = Math.max(...bounds.map((candidate) => candidate.y + candidate.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
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
