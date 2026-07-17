import { resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "@pixi-ui-editor/runtime-pixi";
import type { LayoutProfileId, UINode } from "@pixi-ui-editor/schema";

export type NodeOwner = { nodes: UINode[]; layout?: { referenceViewports: Record<LayoutProfileId, LayoutSize> } };

export type AffineTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};

const IDENTITY: AffineTransform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const EPSILON = 1e-8;

function multiply(left: AffineTransform, right: AffineTransform): AffineTransform {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    tx: left.a * right.tx + left.c * right.ty + left.tx,
    ty: left.b * right.tx + left.d * right.ty + left.ty,
  };
}

function invert(matrix: AffineTransform): AffineTransform | undefined {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < EPSILON) return undefined;

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / determinant,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / determinant,
  };
}

/** Converts a point in scene coordinates into coordinates local to a node's parent. */
export function worldPointToLocal(
  parentWorldMatrix: AffineTransform | undefined,
  point: { x: number; y: number },
): { x: number; y: number } | undefined {
  const inverseParent = parentWorldMatrix === undefined ? IDENTITY : invert(parentWorldMatrix);
  if (inverseParent === undefined) return undefined;
  return {
    x: inverseParent.a * point.x + inverseParent.c * point.y + inverseParent.tx,
    y: inverseParent.b * point.x + inverseParent.d * point.y + inverseParent.ty,
  };
}

export function localTransformMatrix(transform: UINode["transform"]): AffineTransform {
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  const a = cosine * transform.scaleX;
  const b = sine * transform.scaleX;
  const c = -sine * transform.scaleY;
  const d = cosine * transform.scaleY;
  const pivotX = (transform.pivotX ?? 0) * transform.width;
  const pivotY = (transform.pivotY ?? 0) * transform.height;

  return {
    a,
    b,
    c,
    d,
    tx: transform.x - a * pivotX - c * pivotY,
    ty: transform.y - b * pivotX - d * pivotY,
  };
}

/** Returns the same world matrix Pixi builds from the serialized parent chain. */
export function getNodeWorldMatrix(owner: NodeOwner, nodeId: string, profile: LayoutProfileId): AffineTransform | undefined {
  const nodesById = new Map(owner.nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();

  const visit = (id: string): { matrix: AffineTransform; size: LayoutSize } | undefined => {
    if (visiting.has(id)) return undefined;
    const node = nodesById.get(id);
    if (node === undefined) return undefined;
    visiting.add(id);
    const parent = node.parentId === null ? undefined : visit(node.parentId);
    visiting.delete(id);
    if (node.parentId !== null && parent === undefined) return undefined;
    const parentSize = parent?.size ?? owner.layout?.referenceViewports[profile];
    const transform = resolveAnchoredTransform(resolveProfileTransform(node, profile).transform, parentSize);
    return {
      matrix: multiply(parent?.matrix ?? IDENTITY, localTransformMatrix(transform)),
      size: node.parentId === null && owner.layout !== undefined
        ? owner.layout.referenceViewports[profile]
        : { width: transform.width, height: transform.height },
    };
  };

  return visit(nodeId)?.matrix;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * Converts a world matrix to a schema transform relative to a new parent.
 * Undefined means the result needs skew (or an inverse of a zero-scale parent), neither of which
 * the current document format can represent without changing the rendered object.
 */
export function transformRelativeToParent(
  worldMatrix: AffineTransform,
  parentWorldMatrix: AffineTransform | undefined,
  source: UINode["transform"],
): UINode["transform"] | undefined {
  const inverseParent = parentWorldMatrix === undefined ? IDENTITY : invert(parentWorldMatrix);
  if (inverseParent === undefined) return undefined;
  const local = multiply(inverseParent, worldMatrix);
  const scaleX = Math.hypot(local.a, local.b);
  if (scaleX < EPSILON) return undefined;
  const rotation = Math.atan2(local.b, local.a);
  const scaleY = (local.a * local.d - local.b * local.c) / scaleX;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const reconstructed = {
    a: cosine * scaleX,
    b: sine * scaleX,
    c: -sine * scaleY,
    d: cosine * scaleY,
  };
  if (!nearlyEqual(local.a, reconstructed.a) || !nearlyEqual(local.b, reconstructed.b)
    || !nearlyEqual(local.c, reconstructed.c) || !nearlyEqual(local.d, reconstructed.d)) return undefined;

  const pivotX = (source.pivotX ?? 0) * source.width;
  const pivotY = (source.pivotY ?? 0) * source.height;
  return {
    ...source,
    x: local.tx + local.a * pivotX + local.c * pivotY,
    y: local.ty + local.b * pivotX + local.d * pivotY,
    scaleX,
    scaleY,
    rotation,
  };
}
