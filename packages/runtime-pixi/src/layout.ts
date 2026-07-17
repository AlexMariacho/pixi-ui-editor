import { type LayoutProfileId, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";

export type ResolvedProfileTransform = {
  transform: UINode["transform"];
  visible: boolean;
};

export type LayoutSize = { width: number; height: number };

/** Resolves a node's base transform with a profile override applied field by field. */
export function resolveProfileTransform(node: UINode, profile: LayoutProfileId): ResolvedProfileTransform {
  const override = node.layoutOverrides?.[profile];

  return {
    transform: { ...node.transform, ...override?.transform },
    visible: override?.visible ?? node.visible,
  };
}

/**
 * Resolves normalized Unity-style anchors against the node's parent rectangle.
 * A point axis (anchorMin == anchorMax) offsets the stored x/y by the anchor point; missing anchors
 * preserve legacy top-left positioning. A stretched axis (anchorMin < anchorMax) additionally treats
 * the stored width/height as a delta to the anchor rectangle, so the node follows the parent's size.
 */
export function resolveAnchoredTransform(transform: UINode["transform"], parentSize?: LayoutSize): UINode["transform"] {
  if (parentSize === undefined) return transform;
  const minX = transform.anchorMinX ?? 0;
  const maxX = transform.anchorMaxX ?? minX;
  const minY = transform.anchorMinY ?? 0;
  const maxY = transform.anchorMaxY ?? minY;
  return {
    ...transform,
    x: transform.x + minX * parentSize.width,
    y: transform.y + minY * parentSize.height,
    width: Math.max(0, transform.width + (maxX - minX) * parentSize.width),
    height: Math.max(0, transform.height + (maxY - minY) * parentSize.height),
  };
}

/** Picks the layout profile for a viewport using the document's aspect-ratio rule; the breakpoint itself is mobile. */
export function resolveProfileForViewport(settings: ProjectDocument["settings"], width: number, height: number): LayoutProfileId {
  return width / height <= settings.layoutProfileSelection.mobileMaxAspectRatio ? "mobile" : "desktop";
}

export function fitSpineToTransform(
  bounds: { x: number; y: number; width: number; height: number },
  transform: UINode["transform"],
): { scaleX: number; scaleY: number; x: number; y: number } | undefined {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const scaleX = transform.width / bounds.width;
  const scaleY = transform.height / bounds.height;
  return Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0
    ? { scaleX, scaleY, x: -bounds.x * scaleX, y: -bounds.y * scaleY }
    : undefined;
}
