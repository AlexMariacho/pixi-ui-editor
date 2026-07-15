import { loadProjectDocument, parseProjectDocumentJson, resolveProfileTransform } from "@pixi-ui-editor/runtime-pixi";
import {
  createStableId,
  serializeProjectDocument,
  validateProjectDocument,
  type LayoutProfileId,
  type AssetFile,
  type PrefabDefinition,
  type ProjectDocument,
  type Scene,
  type UINode,
} from "@pixi-ui-editor/schema";
import { create } from "zustand";
import sampleJson from "../../../examples/sample-project/project.json";
import { getCachedImageAssetSize } from "./assets.js";
import { getNodeWorldMatrix, transformRelativeToParent } from "./transformCoordinates.js";

export const DOCUMENT_STORAGE_KEY = "pixi-ui-editor:document";
export type EditorTool = "pan" | "select" | "resize";
export type ViewMode = "single" | "map";

export type EditorState = {
  document: ProjectDocument;
  sceneId: string;
  activeProfile: LayoutProfileId;
  activeTool: EditorTool;
  viewMode: ViewMode;
  selectedNodeIds: string[];
  selectedNodeId: string | null;
  editingPrefabId: string | null;
  spineFrameRequests: Record<string, number>;
  spinePlaybackFrames: Record<string, { current: number; total: number }>;
  spineAutoplay: Record<string, boolean>;
  setActiveProfile(profile: LayoutProfileId): void;
  setActiveTool(tool: EditorTool): void;
  setViewMode(mode: ViewMode): void;
  selectNode(id: string | null, additive?: boolean): void;
  selectNodes(ids: string[], additive?: boolean): void;
  selectScene(sceneId: string): void;
  addScene(name?: string): void;
  renameScene(sceneId: string, name: string): void;
  deleteScene(sceneId: string): void;
  updateReferenceViewport(profile: LayoutProfileId, viewport: { width: number; height: number }): void;
  updateNode(nodeId: string, patch: Partial<Pick<UINode, "name" | "visible">> & { text?: string }): void;
  updateNodeProfileTransform(nodeId: string, patch: Partial<UINode["transform"]>): void;
  updateNodeProfileTransforms(updates: { nodeId: string; patch: Partial<UINode["transform"]> }[]): void;
  setNodeOrientationVisibility(nodeId: string, profile: LayoutProfileId, visible: boolean): void;
  addImageAsset(name: string, source: { uri: string; mediaType: string }): void;
  addSpineAsset(name: string, files: { skeleton: AssetFile; atlas: AssetFile; textures: AssetFile[] }): void;
  setImageNodeAsset(nodeId: string, assetId: string): void;
  replaceAssetSource(assetId: string, source: { uri: string; mediaType: string }): void;
  replaceSpineAssetFiles(assetId: string, files: { skeleton: AssetFile; atlas: AssetFile; textures: AssetFile[] }): void;
  deleteAsset(assetId: string): void;
  updateSpineNodeAnimation(nodeId: string, animation: string | undefined): void;
  updateSpineNodeLoop(nodeId: string, loop: boolean): void;
  requestSpineFrame(nodeId: string, frame: number): void;
  setSpineAutoplay(nodeId: string, autoplay: boolean): void;
  reportSpinePlaybackFrame(nodeId: string, playback: { current: number; total: number }): void;
  addNode(type: "container" | "image" | "text" | "spine"): void;
  addNodeFromAsset(assetId: string, position: { x: number; y: number }): void;
  moveNode(nodeId: string, placement: { parentId: string | null; index: number }): void;
  deleteNode(nodeId: string): void;
  createPrefabFromNode(nodeId: string): string | null;
  addPrefabInstance(prefabId: string, position: { x: number; y: number }): void;
  renamePrefab(prefabId: string, name: string): void;
  deletePrefab(prefabId: string): void;
  setEditingPrefabId(prefabId: string | null): void;
  resetToSample(): void;
};

const sampleDocument = loadProjectDocument(sampleJson);
const firstScene = sampleDocument.scenes[0];

if (firstScene === undefined) {
  throw new Error("The sample project must contain at least one scene.");
}

function loadInitialDocument(): ProjectDocument {
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

function commitCandidate(state: EditorState, candidate: ProjectDocument, failureMessage: string): Partial<EditorState> | EditorState {
  const validation = validateProjectDocument(candidate);
  if (!validation.valid) {
    console.warn(failureMessage, validation.issues);
    return state;
  }

  return { document: candidate };
}

export type EditingTarget = Scene | PrefabDefinition;

/** The first root container of a scene is its technical screen boundary, not an editable hierarchy item. */
export function getSceneRoot(scene: Scene): UINode | undefined {
  const rootNodeId = scene.rootNodeIds[0];
  const root = rootNodeId === undefined ? undefined : scene.nodes.find((node) => node.id === rootNodeId);
  return root?.type === "container" ? root : undefined;
}

function createSceneRoot(scene: Pick<Scene, "layout">): UINode {
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

/** Возвращает текущего владельца nodes: редактируемый пресет либо активное окно. */
export function getEditingTarget(candidate: ProjectDocument, state: Pick<EditorState, "editingPrefabId" | "sceneId">): EditingTarget | undefined {
  if (state.editingPrefabId !== null) return candidate.prefabs.find((prefab) => prefab.id === state.editingPrefabId);
  return candidate.scenes.find((scene) => scene.id === state.sceneId);
}

/** Формальный bounding box содержимого пресета по desktop-профилю (только трансляции, fallback 100×100). */
function computePrefabBoundingBox(prefab: PrefabDefinition): { width: number; height: number } {
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

let skipNextPersistence = false;
const initialDocument = loadInitialDocument();

export const useEditorStore = create<EditorState>((set) => ({
  document: initialDocument,
  sceneId: initialDocument.scenes[0]?.id ?? firstScene.id,
  activeProfile: "desktop",
  activeTool: "select",
  viewMode: "single",
  selectedNodeIds: [],
  selectedNodeId: null,
  editingPrefabId: null,
  spineFrameRequests: {},
  spinePlaybackFrames: {},
  spineAutoplay: {},
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setViewMode: (mode) => set((state) => {
    if (mode === state.viewMode) return state;
    if (mode === "map" && state.editingPrefabId !== null) {
      console.warn("The map mode is unavailable while a preset is being edited.");
      return state;
    }
    return mode === "map" ? { viewMode: mode, selectedNodeIds: [], selectedNodeId: null, activeTool: "pan" } : { viewMode: mode };
  }),
  selectNode: (id, additive = false) => set((state) => {
    if (id === null) return { selectedNodeIds: [], selectedNodeId: null };
    if (!additive) return { selectedNodeIds: [id], selectedNodeId: id };
    if (state.selectedNodeIds.includes(id)) {
      const selectedNodeIds = state.selectedNodeIds.filter((candidateId) => candidateId !== id);
      return { selectedNodeIds, selectedNodeId: selectedNodeIds.at(-1) ?? null };
    }
    return { selectedNodeIds: [...state.selectedNodeIds, id], selectedNodeId: id };
  }),
  selectNodes: (ids, additive = false) => set((state) => {
    const uniqueIds = [...new Set(ids)];
    if (!additive) return { selectedNodeIds: uniqueIds, selectedNodeId: uniqueIds.at(-1) ?? null };
    const selectedNodeIds = [...state.selectedNodeIds];
    for (const id of uniqueIds) {
      if (!selectedNodeIds.includes(id)) selectedNodeIds.push(id);
    }
    return { selectedNodeIds, selectedNodeId: selectedNodeIds.at(-1) ?? null };
  }),
  selectScene: (sceneId) => set((state) => {
    if (!state.document.scenes.some((scene) => scene.id === sceneId)) {
      console.warn(`Cannot select scene '${sceneId}': it does not exist.`);
      return state;
    }
    return { sceneId, selectedNodeIds: [], selectedNodeId: null };
  }),
  addScene: (name) => set((state) => {
    const candidate = structuredClone(state.document);
    const activeScene = candidate.scenes.find((scene) => scene.id === state.sceneId) ?? candidate.scenes[0];
    if (activeScene === undefined) {
      console.warn("Cannot add a window: the project document does not contain a scene to copy viewports from.");
      return state;
    }

    const trimmedName = name?.trim() ?? "";
    const scene: Scene = {
      id: createStableId(),
      name: trimmedName !== "" ? trimmedName : `Window ${candidate.scenes.length + 1}`,
      rootNodeIds: [],
      nodes: [],
      layout: { referenceViewports: structuredClone(activeScene.layout.referenceViewports) },
    };
    const root = createSceneRoot(scene);
    scene.rootNodeIds.push(root.id);
    scene.nodes.push(root);
    candidate.scenes.push(scene);

    const committed = commitCandidate(state, candidate, "Window creation was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, sceneId: scene.id, selectedNodeIds: [], selectedNodeId: null };
  }),
  renameScene: (sceneId, name) => set((state) => {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      console.warn(`Cannot rename window '${sceneId}': the name must not be empty.`);
      return state;
    }

    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === sceneId);
    if (scene === undefined) {
      console.warn(`Cannot rename window '${sceneId}': it does not exist.`);
      return state;
    }

    scene.name = trimmedName;
    return commitCandidate(state, candidate, "Window rename was rejected because it makes the project document invalid.");
  }),
  deleteScene: (sceneId) => set((state) => {
    if (state.document.scenes.length <= 1) {
      console.warn("Cannot delete the last window of the project.");
      return state;
    }

    const candidate = structuredClone(state.document);
    const sceneIndex = candidate.scenes.findIndex((scene) => scene.id === sceneId);
    if (sceneIndex === -1) {
      console.warn(`Cannot delete window '${sceneId}': it does not exist.`);
      return state;
    }

    candidate.scenes.splice(sceneIndex, 1);
    const committed = commitCandidate(state, candidate, "Window deletion was rejected because it makes the project document invalid.");
    if (committed === state) return state;
    if (state.sceneId !== sceneId) return committed;
    return { ...committed, sceneId: candidate.scenes[0]!.id, selectedNodeIds: [], selectedNodeId: null };
  }),
  updateReferenceViewport: (profile, viewport) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);

    if (scene === undefined) {
      console.warn(`Cannot update reference viewport: scene '${state.sceneId}' does not exist.`);
      return state;
    }

    scene.layout.referenceViewports[profile] = { ...viewport };
    return commitCandidate(state, candidate, "Reference viewport update was rejected because it makes the project document invalid.");
  }),
  updateNode: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node '${nodeId}': it does not exist in the editing target.`);
      return state;
    }

    if (patch.name !== undefined) node.name = patch.name;
    if (patch.visible !== undefined) node.visible = patch.visible;
    if (patch.text !== undefined && node.type === "text") node.text = patch.text;

    return commitCandidate(state, candidate, "Node update was rejected because it makes the project document invalid.");
  }),
  updateNodeProfileTransform: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node transform '${nodeId}': it does not exist in the editing target.`);
      return state;
    }

    if (state.activeProfile === "desktop") {
      node.transform = { ...node.transform, ...patch };
    } else {
      node.layoutOverrides ??= {};
      node.layoutOverrides.mobile ??= {};
      node.layoutOverrides.mobile.transform = { ...node.layoutOverrides.mobile.transform, ...patch };
    }

    return commitCandidate(state, candidate, "Node transform update was rejected because it makes the project document invalid.");
  }),
  updateNodeProfileTransforms: (updates) => set((state) => {
    if (updates.length === 0) return state;
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    if (target === undefined) {
      console.warn("Cannot update node transforms: the editing target does not exist.");
      return state;
    }

    const nodesById = new Map(target.nodes.map((node) => [node.id, node]));
    for (const { nodeId, patch } of updates) {
      const node = nodesById.get(nodeId);
      if (node === undefined) {
        console.warn(`Cannot update node transforms: node '${nodeId}' does not exist in the editing target.`);
        return state;
      }
      if (state.activeProfile === "desktop") {
        node.transform = { ...node.transform, ...patch };
      } else {
        node.layoutOverrides ??= {};
        node.layoutOverrides.mobile ??= {};
        node.layoutOverrides.mobile.transform = { ...node.layoutOverrides.mobile.transform, ...patch };
      }
    }

    return commitCandidate(state, candidate, "Node transform updates were rejected because they make the project document invalid.");
  }),
  setNodeOrientationVisibility: (nodeId, profile, visible) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node orientation visibility '${nodeId}': it does not exist in the editing target.`);
      return state;
    }

    if (!visible) {
      node.layoutOverrides ??= {};
      node.layoutOverrides[profile] ??= {};
      node.layoutOverrides[profile].visible = false;
    } else if (node.layoutOverrides?.[profile] !== undefined) {
      delete node.layoutOverrides[profile].visible;
      if (Object.keys(node.layoutOverrides[profile]).length === 0) delete node.layoutOverrides[profile];
      if (Object.keys(node.layoutOverrides).length === 0) delete node.layoutOverrides;
    }

    return commitCandidate(state, candidate, "Node orientation visibility update was rejected because it makes the project document invalid.");
  }),
  addImageAsset: (name, source) => set((state) => {
    const candidate = structuredClone(state.document);
    candidate.assets.push({ id: createStableId(), name, type: "image", source: { ...source } });

    return commitCandidate(state, candidate, "Image asset creation was rejected because it makes the project document invalid.");
  }),
  addSpineAsset: (name, files) => set((state) => {
    const candidate = structuredClone(state.document);
    candidate.assets.push({ id: createStableId(), name, type: "spine", files: structuredClone(files) });
    return commitCandidate(state, candidate, "Spine asset creation was rejected because it makes the project document invalid.");
  }),
  setImageNodeAsset: (nodeId, assetId) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot set image asset for node '${nodeId}': it does not exist in the editing target.`);
      return state;
    }
    if (node.type !== "image") {
      console.warn(`Cannot set image asset for node '${nodeId}': it is not an image node.`);
      return state;
    }

    node.assetId = assetId;
    return commitCandidate(state, candidate, "Image asset selection was rejected because it makes the project document invalid.");
  }),
  replaceAssetSource: (assetId, source) => set((state) => {
    const candidate = structuredClone(state.document);
    const asset = candidate.assets.find((candidateAsset) => candidateAsset.id === assetId);

    if (asset === undefined) {
      console.warn(`Cannot replace source for asset '${assetId}': it does not exist.`);
      return state;
    }

    if (asset.type !== "image") {
      console.warn(`Cannot replace image source for asset '${assetId}': it is not an image asset.`);
      return state;
    }
    asset.source = { ...source, version: new Date().toISOString() };
    return commitCandidate(state, candidate, "Asset source replacement was rejected because it makes the project document invalid.");
  }),
  replaceSpineAssetFiles: (assetId, files) => set((state) => {
    const candidate = structuredClone(state.document);
    const asset = candidate.assets.find((candidateAsset) => candidateAsset.id === assetId);
    if (asset?.type !== "spine") {
      console.warn(`Cannot replace Spine files for asset '${assetId}': it is not a Spine asset.`);
      return state;
    }
    asset.files = structuredClone(files);
    return commitCandidate(state, candidate, "Spine asset replacement was rejected because it makes the project document invalid.");
  }),
  deleteAsset: (assetId) => set((state) => {
    const candidate = structuredClone(state.document);
    candidate.assets = candidate.assets.filter((asset) => asset.id !== assetId);

    return commitCandidate(state, candidate, "Asset deletion was rejected because it makes the project document invalid.");
  }),
  updateSpineNodeAnimation: (nodeId, animation) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (node?.type !== "spine") {
      console.warn(`Cannot update Spine animation for node '${nodeId}': it is not a Spine node.`);
      return state;
    }
    if (animation === undefined) delete node.animation;
    else node.animation = animation;
    return commitCandidate(state, candidate, "Spine animation update was rejected because it makes the project document invalid.");
  }),
  updateSpineNodeLoop: (nodeId, loop) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (node?.type !== "spine") {
      console.warn(`Cannot update Spine loop for node '${nodeId}': it is not a Spine node.`);
      return state;
    }
    node.loop = loop;
    return commitCandidate(state, candidate, "Spine loop update was rejected because it makes the project document invalid.");
  }),
  requestSpineFrame: (nodeId, frame) => set((state) => ({ spineFrameRequests: { ...state.spineFrameRequests, [nodeId]: frame } })),
  setSpineAutoplay: (nodeId, autoplay) => set((state) => ({ spineAutoplay: { ...state.spineAutoplay, [nodeId]: autoplay } })),
  reportSpinePlaybackFrame: (nodeId, playback) => set((state) => {
    const current = state.spinePlaybackFrames[nodeId];
    return current?.current === playback.current && current.total === playback.total
      ? state
      : { spinePlaybackFrames: { ...state.spinePlaybackFrames, [nodeId]: playback } };
  }),
  addNode: (type) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    if (target === undefined) {
      console.warn("Cannot add a node: the editing target does not exist.");
      return state;
    }

    const selectedNode = target.nodes.find((node) => node.id === state.selectedNodeId);
    const selectedParent = selectedNode?.type === "container" ? selectedNode : undefined;
    const leafParent = selectedNode?.parentId === null || selectedNode?.parentId === undefined
      ? undefined
      : target.nodes.find((node) => node.id === selectedNode.parentId && node.type === "container");
    const sceneRoot = "layout" in target ? getSceneRoot(target) : undefined;
    const parent = selectedParent ?? leafParent ?? sceneRoot;
    const nodeNumber = candidate.scenes.reduce(
      (count, candidateScene) => count + candidateScene.nodes.filter((node) => node.type === type).length,
      candidate.prefabs.reduce((count, prefab) => count + prefab.nodes.filter((node) => node.type === type).length, 0),
    ) + 1;
    const transform = { x: 50, y: 50, width: type === "spine" ? 200 : 100, height: type === "spine" ? 200 : 100, scaleX: 1, scaleY: 1, rotation: 0 };
    const base = {
      id: createStableId(),
      name: `${type[0]!.toUpperCase()}${type.slice(1)} ${nodeNumber}`,
      parentId: parent?.id ?? null,
      children: [],
      visible: true,
      transform,
    };

    let node: UINode;
    if (type === "image") {
      const asset = candidate.assets.find((candidateAsset) => candidateAsset.type === "image");
      if (asset === undefined) {
        console.warn("Cannot add an image node: the project document does not contain an image asset.");
        return state;
      }
      node = { ...base, type, assetId: asset.id };
    } else if (type === "spine") {
      const asset = candidate.assets.find((candidateAsset) => candidateAsset.type === "spine");
      if (asset === undefined) {
        console.warn("Cannot add a Spine node: the project document does not contain a Spine asset.");
        return state;
      }
      node = { ...base, type, assetId: asset.id };
    } else if (type === "text") {
      node = { ...base, type, text: "New text" };
    } else {
      node = { ...base, type };
    }

    target.nodes.push(node);
    if (parent === undefined) target.rootNodeIds.push(node.id);
    else parent.children.push(node.id);

    return commitCandidate(state, candidate, "Node creation was rejected because it makes the project document invalid.");
  }),
  addNodeFromAsset: (assetId, position) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const asset = candidate.assets.find((candidateAsset) => candidateAsset.id === assetId);
    if (target === undefined || asset === undefined) {
      console.warn(`Cannot add a node from asset '${assetId}': the editing target or asset does not exist.`);
      return state;
    }

    const isImage = asset.type === "image";
    const sceneRoot = "layout" in target ? getSceneRoot(target) : undefined;
    const imageSize = getCachedImageAssetSize(asset);
    const width = isImage ? imageSize?.width ?? 100 : 200;
    const height = isImage ? imageSize?.height ?? 100 : 200;
    const node: UINode = {
      id: createStableId(),
      name: asset.name,
      type: isImage ? "image" : "spine",
      assetId: asset.id,
      parentId: sceneRoot?.id ?? null,
      children: [],
      visible: true,
      transform: { x: position.x, y: position.y, width, height, scaleX: 1, scaleY: 1, rotation: 0 },
    };
    target.nodes.push(node);
    if (sceneRoot === undefined) target.rootNodeIds.push(node.id);
    else sceneRoot.children.push(node.id);

    const committed = commitCandidate(state, candidate, "Asset node creation was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, selectedNodeIds: [node.id], selectedNodeId: node.id };
  }),
  moveNode: (nodeId, placement) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    const parent = placement.parentId === null
      ? undefined
      : target?.nodes.find((candidateNode) => candidateNode.id === placement.parentId);

    if (target === undefined || node === undefined || (placement.parentId !== null && parent === undefined)) {
      console.warn(`Cannot move node '${nodeId}': the editing target, node, or destination parent does not exist.`);
      return state;
    }

    const subtreeIds = new Set<string>();
    const nodesById = new Map(target.nodes.map((candidateNode) => [candidateNode.id, candidateNode]));
    const collectSubtree = (candidateNodeId: string): void => {
      if (subtreeIds.has(candidateNodeId)) return;
      subtreeIds.add(candidateNodeId);
      nodesById.get(candidateNodeId)?.children.forEach(collectSubtree);
    };
    collectSubtree(node.id);

    if (placement.parentId !== null && subtreeIds.has(placement.parentId)) {
      console.warn(`Cannot move node '${nodeId}' into itself or one of its descendants.`);
      return state;
    }

    const sourceChildren = node.parentId === null
      ? target.rootNodeIds
      : nodesById.get(node.parentId)?.children;
    const destinationChildren = parent?.children ?? target.rootNodeIds;
    const sourceIndex = sourceChildren?.indexOf(node.id) ?? -1;
    if (sourceChildren === undefined || sourceIndex < 0) {
      console.warn(`Cannot move node '${nodeId}': its current hierarchy position is inconsistent.`);
      return state;
    }

    const sameCollection = sourceChildren === destinationChildren;
    const requestedIndex = Number.isFinite(placement.index) ? Math.trunc(placement.index) : destinationChildren.length;
    const insertionIndex = Math.max(0, Math.min(
      requestedIndex - (sameCollection && sourceIndex < requestedIndex ? 1 : 0),
      destinationChildren.length - (sameCollection ? 1 : 0),
    ));
    if (sameCollection && insertionIndex === sourceIndex) return state;

    const parentChanged = node.parentId !== placement.parentId;
    const preservedTransforms = new Map<LayoutProfileId, UINode["transform"]>();
    if (parentChanged) {
      for (const profile of ["desktop", "mobile"] as const) {
        const worldMatrix = getNodeWorldMatrix(target, node.id, profile);
        const parentWorldMatrix = placement.parentId === null ? undefined : getNodeWorldMatrix(target, placement.parentId, profile);
        const resolvedTransform = resolveProfileTransform(node, profile).transform;
        const preserved = worldMatrix === undefined
          ? undefined
          : transformRelativeToParent(worldMatrix, parentWorldMatrix, resolvedTransform);
        if (preserved === undefined) {
          console.warn(`Cannot move node '${nodeId}': preserving its visual transform would require skew or an invertible destination parent.`);
          return state;
        }
        preservedTransforms.set(profile, preserved);
      }
    }

    sourceChildren.splice(sourceIndex, 1);
    destinationChildren.splice(insertionIndex, 0, node.id);
    node.parentId = placement.parentId;
    if (parentChanged) {
      const desktop = preservedTransforms.get("desktop")!;
      const mobile = preservedTransforms.get("mobile")!;
      node.transform = desktop;
      node.layoutOverrides ??= {};
      node.layoutOverrides.mobile ??= {};
      node.layoutOverrides.mobile.transform = {
        ...node.layoutOverrides.mobile.transform,
        x: mobile.x,
        y: mobile.y,
        scaleX: mobile.scaleX,
        scaleY: mobile.scaleY,
        rotation: mobile.rotation,
      };
    }

    return commitCandidate(state, candidate, "Node move was rejected because it makes the project document invalid.");
  }),
  deleteNode: (nodeId) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (target === undefined || node === undefined) {
      console.warn(`Cannot delete node '${nodeId}': it does not exist in the editing target.`);
      return state;
    }
    if (node.parentId === null && target.rootNodeIds.length === 1) return state;

    const nodesById = new Map(target.nodes.map((candidateNode) => [candidateNode.id, candidateNode]));
    const deletedIds = new Set<string>();
    const collectSubtree = (id: string) => {
      if (deletedIds.has(id)) return;
      deletedIds.add(id);
      nodesById.get(id)?.children.forEach(collectSubtree);
    };
    collectSubtree(node.id);

    target.nodes = target.nodes.filter((candidateNode) => !deletedIds.has(candidateNode.id));
    target.rootNodeIds = target.rootNodeIds.filter((rootNodeId) => !deletedIds.has(rootNodeId));
    for (const remainingNode of target.nodes) {
      remainingNode.children = remainingNode.children.filter((childId) => !deletedIds.has(childId));
    }

    const committed = commitCandidate(state, candidate, "Node deletion was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, selectedNodeIds: [], selectedNodeId: null };
  }),
  createPrefabFromNode: (nodeId) => {
    let error: string | null = null;
    set((state) => {
      if (state.editingPrefabId !== null) {
        error = "A preset cannot be created while another preset is being edited.";
        return state;
      }

      const candidate = structuredClone(state.document);
      const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
      const sourceNode = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);
      if (scene === undefined || sourceNode === undefined) {
        error = `The node '${nodeId}' does not exist in the active window.`;
        return state;
      }

      const nodesById = new Map(scene.nodes.map((candidateNode) => [candidateNode.id, candidateNode]));
      const subtree: UINode[] = [];
      const collectSubtree = (id: string): void => {
        const node = nodesById.get(id);
        if (node === undefined || subtree.includes(node)) return;
        subtree.push(node);
        node.children.forEach(collectSubtree);
      };
      collectSubtree(sourceNode.id);

      if (subtree.some((node) => node.type === "prefab-instance")) {
        error = "A preset cannot be created from a subtree that contains a preset instance.";
        return state;
      }

      // Копия поддерева получает новые stable ID: ID глобально уникальны в документе.
      const idBySourceId = new Map(subtree.map((node) => [node.id, createStableId()]));
      const copies = subtree.map((node) => {
        const copy = structuredClone(node);
        copy.id = idBySourceId.get(node.id)!;
        copy.parentId = node.id === sourceNode.id ? null : idBySourceId.get(node.parentId!)!;
        copy.children = node.children.map((childId) => idBySourceId.get(childId)!);
        if (node.id === sourceNode.id) copy.transform = { ...copy.transform, x: 0, y: 0 };
        return copy;
      });

      candidate.prefabs.push({
        id: createStableId(),
        name: sourceNode.name,
        rootNodeIds: [idBySourceId.get(sourceNode.id)!],
        nodes: copies,
        exposedProperties: [],
      });

      const committed = commitCandidate(state, candidate, "Preset creation was rejected because it makes the project document invalid.");
      if (committed === state) error = "Preset creation was rejected because it makes the project document invalid.";
      return committed;
    });
    return error;
  },
  addPrefabInstance: (prefabId, position) => set((state) => {
    if (state.editingPrefabId !== null) {
      console.warn("A preset instance cannot be added while a preset is being edited: nested presets are not supported.");
      return state;
    }

    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const prefab = candidate.prefabs.find((candidatePrefab) => candidatePrefab.id === prefabId);
    if (scene === undefined || prefab === undefined) {
      console.warn(`Cannot add a preset instance '${prefabId}': the window or preset does not exist.`);
      return state;
    }

    const boundingBox = computePrefabBoundingBox(prefab);
    const sceneRoot = getSceneRoot(scene);
    const node: UINode = {
      id: createStableId(),
      name: prefab.name,
      type: "prefab-instance",
      prefabId: prefab.id,
      parentId: sceneRoot?.id ?? null,
      children: [],
      visible: true,
      transform: { x: position.x, y: position.y, width: boundingBox.width, height: boundingBox.height, scaleX: 1, scaleY: 1, rotation: 0 },
    };
    scene.nodes.push(node);
    if (sceneRoot === undefined) scene.rootNodeIds.push(node.id);
    else sceneRoot.children.push(node.id);

    const committed = commitCandidate(state, candidate, "Preset instance creation was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, selectedNodeIds: [node.id], selectedNodeId: node.id };
  }),
  renamePrefab: (prefabId, name) => set((state) => {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      console.warn(`Cannot rename preset '${prefabId}': the name must not be empty.`);
      return state;
    }

    const candidate = structuredClone(state.document);
    const prefab = candidate.prefabs.find((candidatePrefab) => candidatePrefab.id === prefabId);
    if (prefab === undefined) {
      console.warn(`Cannot rename preset '${prefabId}': it does not exist.`);
      return state;
    }

    prefab.name = trimmedName;
    return commitCandidate(state, candidate, "Preset rename was rejected because it makes the project document invalid.");
  }),
  deletePrefab: (prefabId) => set((state) => {
    const instanceCount = state.document.scenes.reduce(
      (count, scene) => count + scene.nodes.filter((node) => node.type === "prefab-instance" && node.prefabId === prefabId).length,
      0,
    );
    if (instanceCount > 0) {
      console.warn(`Cannot delete preset '${prefabId}': it is used by ${instanceCount} instance(s).`);
      return state;
    }

    const candidate = structuredClone(state.document);
    const prefabIndex = candidate.prefabs.findIndex((prefab) => prefab.id === prefabId);
    if (prefabIndex === -1) {
      console.warn(`Cannot delete preset '${prefabId}': it does not exist.`);
      return state;
    }

    candidate.prefabs.splice(prefabIndex, 1);
    const committed = commitCandidate(state, candidate, "Preset deletion was rejected because it makes the project document invalid.");
    if (committed === state) return state;
    return state.editingPrefabId === prefabId ? { ...committed, editingPrefabId: null, selectedNodeIds: [], selectedNodeId: null } : committed;
  }),
  setEditingPrefabId: (prefabId) => set((state) => {
    if (prefabId === null) return { editingPrefabId: null, selectedNodeIds: [], selectedNodeId: null };
    if (!state.document.prefabs.some((prefab) => prefab.id === prefabId)) {
      console.warn(`Cannot edit preset '${prefabId}': it does not exist.`);
      return state;
    }
    return { editingPrefabId: prefabId, selectedNodeIds: [], selectedNodeId: null, viewMode: "single" };
  }),
  resetToSample: () => set(() => {
    if (typeof localStorage !== "undefined") {
      skipNextPersistence = true;
      localStorage.removeItem(DOCUMENT_STORAGE_KEY);
    }
    return { document: structuredClone(sampleDocument), sceneId: firstScene.id, selectedNodeIds: [], selectedNodeId: null, editingPrefabId: null };
  }),
}));

useEditorStore.subscribe((state, previousState) => {
  if (state.document === previousState.document) return;
  if (typeof localStorage === "undefined") return;
  if (skipNextPersistence) {
    skipNextPersistence = false;
    return;
  }

  try {
    localStorage.setItem(DOCUMENT_STORAGE_KEY, serializeProjectDocument(state.document));
  } catch (error) {
    console.warn("The project document could not be saved to localStorage.", error);
  }
});
