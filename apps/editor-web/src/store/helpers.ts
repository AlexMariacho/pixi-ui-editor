import { loadProjectDocument, parseProjectDocumentJson, resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "@pixi-ui-editor/runtime-pixi";
import { createStableId, validateProjectDocument, type LayoutProfileId, type PrefabDefinition, type ProjectDocument, type Scene, type UINode } from "@pixi-ui-editor/schema";
import sampleJson from "../../../../examples/sample-project/project.json";
import { DOCUMENT_STORAGE_KEY, type AnchorRect, type EditingTarget, type EditorState } from "./types.js";

export const sampleDocument = loadProjectDocument(sampleJson);
export const firstScene = sampleDocument.scenes[0];

if (firstScene === undefined) {
  throw new Error("The sample project must contain at least one scene.");
}

export function loadInitialDocument(): ProjectDocument {
  if (typeof localStorage === "undefined") return structuredClone(sampleDocument);

  const storedDocument = localStorage.getItem(DOCUMENT_STORAGE_KEY);
  if (storedDocument === null) return structuredClone(sampleDocument);

  try {
    return parseProjectDocumentJson(storedDocument);
  } catch (error) {
    console.warn("The saved project document could not be loaded. The sample document will be used instead.", error);
    return structuredClone(sampleDocument);
  }
}

export function commitCandidate(state: EditorState, candidate: ProjectDocument, failureMessage: string): Partial<EditorState> | EditorState {
  const validation = validateProjectDocument(candidate);
  if (!validation.valid) {
    console.warn(failureMessage, validation.issues);
    return state;
  }

  return { document: candidate };
}

/** The first root container of a scene is its technical screen boundary, not an editable hierarchy item. */
export function getSceneRoot(scene: Scene): UINode | undefined {
  const rootNodeId = scene.rootNodeIds[0];
  const root = rootNodeId === undefined ? undefined : scene.nodes.find((node) => node.id === rootNodeId);
  return root?.type === "container" ? root : undefined;
}

export function createSceneRoot(scene: Pick<Scene, "layout">): UINode {
  const desktop = scene.layout.referenceViewports.desktop;
  const mobile = scene.layout.referenceViewports.mobile;
  return {
    id: createStableId(),
    name: "Root",
    type: "container",
    parentId: null,
    children: [],
    visible: true,
    transform: { x: 0, y: 0, width: desktop.width, height: desktop.height, scaleX: 1, scaleY: 1, rotation: 0 },
    layoutOverrides: { mobile: { transform: { width: mobile.width, height: mobile.height } } },
  };
}

export function getParentLayoutSize(target: EditingTarget, node: UINode, profile: LayoutProfileId): LayoutSize {
  if (node.parentId !== null) {
    const parent = target.nodes.find((candidate) => candidate.id === node.parentId);
    if (parent !== undefined) {
      if ("layout" in target && parent.parentId === null) return target.layout.referenceViewports[profile];
      // Р РѕРґРёС‚РµР»СЊ РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃР°Рј СЂР°СЃС‚СЏРЅСѓС‚ СЏРєРѕСЂСЏРјРё, РїРѕСЌС‚РѕРјСѓ РµРіРѕ СЂР°Р·РјРµСЂ СЂР°Р·СЂРµС€Р°РµС‚СЃСЏ СЂРµРєСѓСЂСЃРёРІРЅРѕ.
      const transform = resolveAnchoredTransform(resolveProfileTransform(parent, profile).transform, getParentLayoutSize(target, parent, profile));
      return { width: transform.width, height: transform.height };
    }
  }
  return "layout" in target ? target.layout.referenceViewports[profile] : { width: 0, height: 0 };
}

/**
 * Changes the Unity-style anchors without jumping: on a stretched axis (min < max) the stored size
 * becomes a delta to the anchor rectangle. Shift can also move the pivot (edge pivot for point axes,
 * 0.5 for stretched ones), while Shift+Ctrl snaps: point axes put the pivot on the anchor point,
 * stretched axes zero their offsets so the node matches the anchor rectangle.
 */
export function createAnchorPatch(
  transform: UINode["transform"],
  parentSize: LayoutSize,
  anchor: AnchorRect,
  options: { setPivot: boolean; snap: boolean },
  snapPointInParent?: { x: number; y: number },
): Partial<UINode["transform"]> {
  const oldMinX = transform.anchorMinX ?? 0;
  const oldMinY = transform.anchorMinY ?? 0;
  const oldSpanX = (transform.anchorMaxX ?? oldMinX) - oldMinX;
  const oldSpanY = (transform.anchorMaxY ?? oldMinY) - oldMinY;
  const spanX = anchor.maxX - anchor.minX;
  const spanY = anchor.maxY - anchor.minY;
  const renderedWidth = transform.width + oldSpanX * parentSize.width;
  const renderedHeight = transform.height + oldSpanY * parentSize.height;

  const patch: Partial<UINode["transform"]> = { anchorMinX: anchor.minX, anchorMinY: anchor.minY, anchorMaxX: anchor.maxX, anchorMaxY: anchor.maxY };
  if (spanX !== oldSpanX) patch.width = renderedWidth - spanX * parentSize.width;
  if (spanY !== oldSpanY) patch.height = renderedHeight - spanY * parentSize.height;

  const nextPivotX = options.setPivot ? (spanX > 0 ? 0.5 : anchor.minX) : (transform.pivotX ?? 0);
  const nextPivotY = options.setPivot ? (spanY > 0 ? 0.5 : anchor.minY) : (transform.pivotY ?? 0);
  if (options.setPivot) {
    patch.pivotX = nextPivotX;
    patch.pivotY = nextPivotY;
  }
  if (options.snap) {
    const snapPoint = snapPointInParent ?? { x: anchor.minX * parentSize.width, y: anchor.minY * parentSize.height };
    if (spanX > 0) patch.width = 0;
    if (spanY > 0) patch.height = 0;
    patch.x = spanX > 0 ? 0 : snapPoint.x - anchor.minX * parentSize.width;
    patch.y = spanY > 0 ? 0 : snapPoint.y - anchor.minY * parentSize.height;
    return patch;
  }

  let x = transform.x + (oldMinX - anchor.minX) * parentSize.width;
  let y = transform.y + (oldMinY - anchor.minY) * parentSize.height;
  if (options.setPivot) {
    // Р‘РµР· snap РІРёРґРёРјС‹Р№ РїСЂСЏРјРѕСѓРіРѕР»СЊРЅРёРє СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ, РїРѕСЌС‚РѕРјСѓ pivot-РєРѕРјРїРµРЅСЃР°С†РёСЏ СЃС‡РёС‚Р°РµС‚СЃСЏ РїРѕ rendered-СЂР°Р·РјРµСЂСѓ.
    const oldPivotX = (transform.pivotX ?? 0) * renderedWidth;
    const oldPivotY = (transform.pivotY ?? 0) * renderedHeight;
    const newPivotX = nextPivotX * renderedWidth;
    const newPivotY = nextPivotY * renderedHeight;
    const cosine = Math.cos(transform.rotation);
    const sine = Math.sin(transform.rotation);
    const a = cosine * transform.scaleX;
    const b = sine * transform.scaleX;
    const c = -sine * transform.scaleY;
    const d = cosine * transform.scaleY;
    x += a * (newPivotX - oldPivotX) + c * (newPivotY - oldPivotY);
    y += b * (newPivotX - oldPivotX) + d * (newPivotY - oldPivotY);
  }
  patch.x = x;
  patch.y = y;
  return patch;
}

/** Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РµРєСѓС‰РµРіРѕ РІР»Р°РґРµР»СЊС†Р° nodes: СЂРµРґР°РєС‚РёСЂСѓРµРјС‹Р№ РїСЂРµСЃРµС‚ Р»РёР±Рѕ Р°РєС‚РёРІРЅРѕРµ РѕРєРЅРѕ. */
export function getEditingTarget(candidate: ProjectDocument, state: Pick<EditorState, "editingPrefabId" | "sceneId">): EditingTarget | undefined {
  if (state.editingPrefabId !== null) return candidate.prefabs.find((prefab) => prefab.id === state.editingPrefabId);
  return candidate.scenes.find((scene) => scene.id === state.sceneId);
}

/** Р¤РѕСЂРјР°Р»СЊРЅС‹Р№ bounding box СЃРѕРґРµСЂР¶РёРјРѕРіРѕ РїСЂРµСЃРµС‚Р° РїРѕ desktop-РїСЂРѕС„РёР»СЋ (С‚РѕР»СЊРєРѕ С‚СЂР°РЅСЃР»СЏС†РёРё, fallback 100Г—100). */
export function computePrefabBoundingBox(prefab: PrefabDefinition): { width: number; height: number } {
  const nodesById = new Map(prefab.nodes.map((node) => [node.id, node]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (nodeId: string, offsetX: number, offsetY: number): void => {
    const node = nodesById.get(nodeId);
    if (node === undefined) return;
    const { transform } = resolveProfileTransform(node, "desktop");
    const x = offsetX + transform.x;
    const y = offsetY + transform.y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + transform.width * transform.scaleX);
    maxY = Math.max(maxY, y + transform.height * transform.scaleY);
    node.children.forEach((childId) => visit(childId, x, y));
  };

  prefab.rootNodeIds.forEach((rootNodeId) => visit(rootNodeId, 0, 0));
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return { width: 100, height: 100 };
  return { width: maxX - minX, height: maxY - minY };
}

export const initialDocument = loadInitialDocument();
