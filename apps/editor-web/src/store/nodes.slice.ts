import { resolveAnchoredTransform, resolveProfileTransform } from "@pixi-ui-editor/runtime-pixi";
import { createStableId, type LayoutProfileId, type UINode } from "@pixi-ui-editor/schema";
import { getCachedImageAssetSize } from "../shared/assets.js";
import { getNodeWorldMatrix, transformRelativeToParent, worldPointToLocal } from "../canvas/transformCoordinates.js";
import { commitCandidate, createAnchorPatch, getEditingTarget, getParentLayoutSize, getSceneRoot } from "./helpers.js";
import type { EditorSlice } from "./types.js";
type Keys = "addNode" | "addNodeFromAsset" | "updateNode" | "updateNodeProfileTransform" | "updateNodeProfileTransforms" | "setNodeProfileAnchor" | "setNodeOrientationVisibility" | "moveNode" | "deleteNode";
export const createNodesSlice: EditorSlice<Keys> = (set) => ({
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
  setNodeProfileAnchor: (nodeId, anchor, options) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (target === undefined || node === undefined) {
      console.warn(`Cannot update node anchor '${nodeId}': it does not exist in the editing target.`);
      return state;
    }

    const transform = resolveProfileTransform(node, state.activeProfile).transform;
    const parentSize = getParentLayoutSize(target, node, state.activeProfile);
    let snapPointInParent: { x: number; y: number } | undefined;
    if (options.snap && "layout" in target) {
      const viewport = target.layout.referenceViewports[state.activeProfile];
      const parentWorldMatrix = node.parentId === null ? undefined : getNodeWorldMatrix(target, node.parentId, state.activeProfile);
      snapPointInParent = worldPointToLocal(parentWorldMatrix, {
        x: anchor.minX * viewport.width,
        y: anchor.minY * viewport.height,
      });
    }
    const patch = createAnchorPatch(transform, parentSize, anchor, options, snapPointInParent);
    if (state.activeProfile === "desktop") {
      const previousMobile = resolveProfileTransform(node, "mobile").transform;
      const previousMobileOverride = node.layoutOverrides?.mobile?.transform;
      node.transform = { ...node.transform, ...patch };
      const inheritedKeys = (Object.keys(patch) as (keyof UINode["transform"])[])
        .filter((key) => previousMobileOverride?.[key] === undefined);
      if (inheritedKeys.length > 0) {
        node.layoutOverrides ??= {};
        node.layoutOverrides.mobile ??= {};
        const mobilePatch: Partial<UINode["transform"]> = {};
        for (const key of inheritedKeys) {
          const value = previousMobile[key]
            ?? (key === "anchorMaxX" ? previousMobile.anchorMinX ?? 0
              : key === "anchorMaxY" ? previousMobile.anchorMinY ?? 0
              : (key === "anchorMinX" || key === "anchorMinY" || key === "pivotX" || key === "pivotY") ? 0
              : undefined);
          if (value !== undefined) mobilePatch[key] = value;
        }
        node.layoutOverrides.mobile.transform = { ...node.layoutOverrides.mobile.transform, ...mobilePatch };
      }
    }
    else {
      node.layoutOverrides ??= {};
      node.layoutOverrides.mobile ??= {};
      node.layoutOverrides.mobile.transform = { ...node.layoutOverrides.mobile.transform, ...patch };
    }
    return commitCandidate(state, candidate, "Node anchor update was rejected because it makes the project document invalid.");
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
    } else if (type === "button") {
      // Только normal обязателен: остальные состояния пользователь назначает в Inspector.
      const asset = candidate.assets.find((candidateAsset) => candidateAsset.type === "image");
      if (asset === undefined) {
        console.warn("Cannot add a button node: the project document does not contain an image asset.");
        return state;
      }
      node = { ...base, type, states: { normalAssetId: asset.id }, enabled: true };
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
        // Матрицы работают с rendered-прямоугольником, поэтому якоря применяются до и вычитаются после.
        const renderedTransform = resolveAnchoredTransform(resolvedTransform, getParentLayoutSize(target, node, profile));
        const preserved = worldMatrix === undefined
          ? undefined
          : transformRelativeToParent(worldMatrix, parentWorldMatrix, renderedTransform);
        if (preserved === undefined) {
          console.warn(`Cannot move node '${nodeId}': preserving its visual transform would require skew or an invertible destination parent.`);
          return state;
        }
        const destinationParentSize = getParentLayoutSize(target, { ...node, parentId: placement.parentId }, profile);
        const anchorMinX = resolvedTransform.anchorMinX ?? 0;
        const anchorMinY = resolvedTransform.anchorMinY ?? 0;
        const spanX = (resolvedTransform.anchorMaxX ?? anchorMinX) - anchorMinX;
        const spanY = (resolvedTransform.anchorMaxY ?? anchorMinY) - anchorMinY;
        preservedTransforms.set(profile, {
          ...preserved,
          x: preserved.x - anchorMinX * destinationParentSize.width,
          y: preserved.y - anchorMinY * destinationParentSize.height,
          width: preserved.width - spanX * destinationParentSize.width,
          height: preserved.height - spanY * destinationParentSize.height,
        });
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
      // На растянутой оси width/height — это дельта к якорному прямоугольнику нового родителя, поэтому она profile-специфична.
      const mobileMinX = mobile.anchorMinX ?? 0;
      const mobileMinY = mobile.anchorMinY ?? 0;
      node.layoutOverrides.mobile.transform = {
        ...node.layoutOverrides.mobile.transform,
        x: mobile.x,
        y: mobile.y,
        scaleX: mobile.scaleX,
        scaleY: mobile.scaleY,
        rotation: mobile.rotation,
        ...((mobile.anchorMaxX ?? mobileMinX) > mobileMinX ? { width: mobile.width } : {}),
        ...((mobile.anchorMaxY ?? mobileMinY) > mobileMinY ? { height: mobile.height } : {}),
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
});
