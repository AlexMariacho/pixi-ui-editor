import { loadProjectDocument, parseProjectDocumentJson } from "@pixi-ui-editor/runtime-pixi";
import {
  createStableId,
  serializeProjectDocument,
  validateProjectDocument,
  type LayoutProfileId,
  type AssetFile,
  type ProjectDocument,
  type Scene,
  type UINode,
} from "@pixi-ui-editor/schema";
import { create } from "zustand";
import sampleJson from "../../../examples/sample-project/project.json";
import { getCachedImageAssetSize } from "./assets.js";

export const DOCUMENT_STORAGE_KEY = "pixi-ui-editor:document";
export type EditorTool = "pan" | "select" | "resize";
export type ViewMode = "single" | "map";

export type EditorState = {
  document: ProjectDocument;
  sceneId: string;
  activeProfile: LayoutProfileId;
  activeTool: EditorTool;
  viewMode: ViewMode;
  selectedNodeId: string | null;
  spineFrameRequests: Record<string, number>;
  spinePlaybackFrames: Record<string, { current: number; total: number }>;
  spineAutoplay: Record<string, boolean>;
  setActiveProfile(profile: LayoutProfileId): void;
  setActiveTool(tool: EditorTool): void;
  setViewMode(mode: ViewMode): void;
  selectNode(id: string | null): void;
  selectScene(sceneId: string): void;
  addScene(name?: string): void;
  renameScene(sceneId: string, name: string): void;
  deleteScene(sceneId: string): void;
  updateReferenceViewport(profile: LayoutProfileId, viewport: { width: number; height: number }): void;
  updateNode(nodeId: string, patch: Partial<Pick<UINode, "name" | "visible">> & { text?: string }): void;
  updateNodeProfileTransform(nodeId: string, patch: Partial<UINode["transform"]>): void;
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
  deleteNode(nodeId: string): void;
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

let skipNextPersistence = false;
const initialDocument = loadInitialDocument();

export const useEditorStore = create<EditorState>((set) => ({
  document: initialDocument,
  sceneId: initialDocument.scenes[0]?.id ?? firstScene.id,
  activeProfile: "desktop",
  activeTool: "select",
  viewMode: "single",
  selectedNodeId: null,
  spineFrameRequests: {},
  spinePlaybackFrames: {},
  spineAutoplay: {},
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setViewMode: (mode) => set((state) => {
    if (mode === state.viewMode) return state;
    return mode === "map" ? { viewMode: mode, selectedNodeId: null, activeTool: "pan" } : { viewMode: mode };
  }),
  selectNode: (id) => set({ selectedNodeId: id }),
  selectScene: (sceneId) => set((state) => {
    if (!state.document.scenes.some((scene) => scene.id === sceneId)) {
      console.warn(`Cannot select scene '${sceneId}': it does not exist.`);
      return state;
    }
    return { sceneId, selectedNodeId: null };
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
    candidate.scenes.push(scene);

    const committed = commitCandidate(state, candidate, "Window creation was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, sceneId: scene.id, selectedNodeId: null };
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
    return { ...committed, sceneId: candidate.scenes[0]!.id, selectedNodeId: null };
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
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const node = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node '${nodeId}': it does not exist in the selected scene.`);
      return state;
    }

    if (patch.name !== undefined) node.name = patch.name;
    if (patch.visible !== undefined) node.visible = patch.visible;
    if (patch.text !== undefined && node.type === "text") node.text = patch.text;

    return commitCandidate(state, candidate, "Node update was rejected because it makes the project document invalid.");
  }),
  updateNodeProfileTransform: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const node = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node transform '${nodeId}': it does not exist in the selected scene.`);
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
  setNodeOrientationVisibility: (nodeId, profile, visible) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const node = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node orientation visibility '${nodeId}': it does not exist in the selected scene.`);
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
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const node = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot set image asset for node '${nodeId}': it does not exist in the selected scene.`);
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
    const node = candidate.scenes.find((scene) => scene.id === state.sceneId)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
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
    const node = candidate.scenes.find((scene) => scene.id === state.sceneId)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
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
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    if (scene === undefined) {
      console.warn(`Cannot add a node: scene '${state.sceneId}' does not exist.`);
      return state;
    }

    const selectedNode = scene.nodes.find((node) => node.id === state.selectedNodeId);
    const selectedParent = selectedNode?.type === "container" ? selectedNode : undefined;
    const leafParent = selectedNode?.parentId === null || selectedNode?.parentId === undefined
      ? undefined
      : scene.nodes.find((node) => node.id === selectedNode.parentId && node.type === "container");
    const parent = selectedParent ?? leafParent;
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

    scene.nodes.push(node);
    if (parent === undefined) scene.rootNodeIds.push(node.id);
    else parent.children.push(node.id);

    return commitCandidate(state, candidate, "Node creation was rejected because it makes the project document invalid.");
  }),
  addNodeFromAsset: (assetId, position) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const asset = candidate.assets.find((candidateAsset) => candidateAsset.id === assetId);
    if (scene === undefined || asset === undefined) {
      console.warn(`Cannot add a node from asset '${assetId}': the scene or asset does not exist.`);
      return state;
    }

    const isImage = asset.type === "image";
    const imageSize = getCachedImageAssetSize(asset);
    const width = isImage ? imageSize?.width ?? 100 : 200;
    const height = isImage ? imageSize?.height ?? 100 : 200;
    const node: UINode = {
      id: createStableId(),
      name: asset.name,
      type: isImage ? "image" : "spine",
      assetId: asset.id,
      parentId: null,
      children: [],
      visible: true,
      transform: { x: position.x, y: position.y, width, height, scaleX: 1, scaleY: 1, rotation: 0 },
    };
    scene.nodes.push(node);
    scene.rootNodeIds.push(node.id);

    const committed = commitCandidate(state, candidate, "Asset node creation was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, selectedNodeId: node.id };
  }),
  deleteNode: (nodeId) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const node = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (scene === undefined || node === undefined) {
      console.warn(`Cannot delete node '${nodeId}': it does not exist in the selected scene.`);
      return state;
    }
    if (node.parentId === null && scene.rootNodeIds.length === 1) return state;

    const nodesById = new Map(scene.nodes.map((candidateNode) => [candidateNode.id, candidateNode]));
    const deletedIds = new Set<string>();
    const collectSubtree = (id: string) => {
      if (deletedIds.has(id)) return;
      deletedIds.add(id);
      nodesById.get(id)?.children.forEach(collectSubtree);
    };
    collectSubtree(node.id);

    scene.nodes = scene.nodes.filter((candidateNode) => !deletedIds.has(candidateNode.id));
    scene.rootNodeIds = scene.rootNodeIds.filter((rootNodeId) => !deletedIds.has(rootNodeId));
    for (const remainingNode of scene.nodes) {
      remainingNode.children = remainingNode.children.filter((childId) => !deletedIds.has(childId));
    }

    const committed = commitCandidate(state, candidate, "Node deletion was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, selectedNodeId: null };
  }),
  resetToSample: () => set(() => {
    if (typeof localStorage !== "undefined") {
      skipNextPersistence = true;
      localStorage.removeItem(DOCUMENT_STORAGE_KEY);
    }
    return { document: structuredClone(sampleDocument), sceneId: firstScene.id, selectedNodeId: null };
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
