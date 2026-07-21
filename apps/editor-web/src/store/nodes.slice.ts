import { resolveAnchoredTransform, resolveProfileTransform } from "@pixi-ui-editor/runtime-pixi";
import { createStableId, type GridLayoutSettings, type LayoutProfileId, type LinearLayoutSettings, type ScrollViewSettings, type UINode } from "@pixi-ui-editor/schema";
import { getCachedAtlasFrameSize, getCachedImageAssetSize, getCachedSpineAssetSize } from "../shared/assets.js";
import { getNodeWorldMatrix, transformRelativeToParent, worldPointToLocal } from "../canvas/transformCoordinates.js";
import { commitCandidate, createAnchorPatch, getEditingTarget, getParentLayoutSize, getSceneRoot, resolveAssetReference } from "./helpers.js";
import type { EditorSlice } from "./types.js";
import { createDefaultParticleEffect } from "./particles.slice.js";
type Keys = "addNode" | "addNodeFromAsset" | "updateNode" | "updateNodeProfileTransform" | "updateNodeProfileTransforms" | "updateLayoutGroup" | "updateLayoutItem" | "setLayoutGroupBackgroundAsset" | "updateScrollView" | "updateInput" | "setNodeProfileAnchor" | "setNodeOrientationVisibility" | "moveNode" | "deleteNode";
export const createNodesSlice: EditorSlice<Keys> = (set) => ({
  setLayoutGroupBackgroundAsset: (nodeId, assetId) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node === undefined || (node.type !== "horizontal-layout" && node.type !== "vertical-layout" && node.type !== "grid-layout")) return state;
    if (assetId === undefined) delete node.backgroundAssetId;
    else node.backgroundAssetId = assetId;
    return commitCandidate(state, candidate, "Layout group background update was rejected because it makes the project document invalid.");
  }),
  updateLayoutGroup: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node === undefined || (node.type !== "horizontal-layout" && node.type !== "vertical-layout" && node.type !== "grid-layout")) return state;
    if (state.activeProfile === "desktop") node.layoutGroup.base = { ...node.layoutGroup.base, ...patch } as never;
    else {
      node.layoutGroup.overrides ??= {};
      node.layoutGroup.overrides.mobile = { ...node.layoutGroup.overrides.mobile, ...patch } as never;
    }
    return commitCandidate(state, candidate, "Layout group update was rejected because it makes the project document invalid.");
  }),
  updateLayoutItem: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node === undefined) return state;
    node.layoutItem = { flexGrow: node.layoutItem?.flexGrow ?? 0, flexShrink: node.layoutItem?.flexShrink ?? 0, ...node.layoutItem, ...patch };
    return commitCandidate(state, candidate, "Layout item update was rejected because it makes the project document invalid.");
  }),
  updateScrollView: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node === undefined || node.type !== "scroll-view") return state;
    node.scrollView = { ...node.scrollView, ...patch };
    return commitCandidate(state, candidate, "Scroll view update was rejected because it makes the project document invalid.");
  }),
  updateInput: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node === undefined || node.type !== "input") return state;
    if ("backgroundAssetId" in patch) { if (patch.backgroundAssetId === undefined) delete node.backgroundAssetId; else node.backgroundAssetId = patch.backgroundAssetId; }
    if ("maxLength" in patch) { if (patch.maxLength === undefined) delete node.maxLength; else node.maxLength = patch.maxLength; }
    if (patch.placeholder !== undefined) node.placeholder = patch.placeholder;
    if (patch.defaultValue !== undefined) node.defaultValue = patch.defaultValue;
    if (patch.secure !== undefined) node.secure = patch.secure;
    if (patch.align !== undefined) node.align = patch.align;
    if (patch.padding !== undefined) node.padding = patch.padding;
    if (patch.cleanOnFocus !== undefined) node.cleanOnFocus = patch.cleanOnFocus;
    if (patch.clipText !== undefined) node.clipText = patch.clipText;
    if (patch.textStyle !== undefined) node.textStyle = patch.textStyle;
    return commitCandidate(state, candidate, "Input update was rejected because it makes the project document invalid.");
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
    if (patch.style !== undefined && node.type === "text") node.style = patch.style;
    if (patch.opacity !== undefined && node.type === "image") node.opacity = patch.opacity;

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

    const canHostChildren = (node: UINode | undefined) => node?.type === "container" || node?.type === "horizontal-layout" || node?.type === "vertical-layout" || node?.type === "grid-layout" || node?.type === "scroll-view";
    const selectedNode = target.nodes.find((node) => node.id === state.selectedNodeId);
    const selectedParent = canHostChildren(selectedNode) ? selectedNode : undefined;
    const leafParent = selectedNode?.parentId === null || selectedNode?.parentId === undefined
      ? undefined
      : target.nodes.find((node) => node.id === selectedNode.parentId && canHostChildren(node));
    const sceneRoot = "layout" in target ? getSceneRoot(target) : undefined;
    const parent = selectedParent ?? leafParent ?? sceneRoot;
    const nodeNumber = candidate.scenes.reduce(
      (count, candidateScene) => count + candidateScene.nodes.filter((node) => node.type === type).length,
      candidate.prefabs.reduce((count, prefab) => count + prefab.nodes.filter((node) => node.type === type).length, 0),
    ) + 1;
    // Текстовые ноды по своей природе прямоугольны: квадратный дефолт под fontSize 24 выглядит нелепо.
    const defaultSize = type === "spine" ? { width: 200, height: 200 } : type === "text" || type === "input" || type === "slider" || type === "progress-bar" ? { width: 200, height: 40 } : type === "particle-emitter" ? { width: 160, height: 160 } : { width: 100, height: 100 };
    const transform = {
      x: 0,
      y: 0,
      width: defaultSize.width,
      height: defaultSize.height,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorMinX: 0.5,
      anchorMaxX: 0.5,
      anchorMinY: 0.5,
      anchorMaxY: 0.5,
      pivotX: 0.5,
      pivotY: 0.5,
    };
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
      node = { ...base, type, text: "New text", style: { fontFamily: "Arial", fontSize: 24, fontWeight: "normal", fontStyle: "normal", fill: "#FFFFFF", align: "left", verticalAlign: "top", wordWrap: false, breakWords: false, letterSpacing: 0 } };
    } else if (type === "horizontal-layout" || type === "vertical-layout") {
      const layoutGroup: LinearLayoutSettings = { padding: { left: 0, right: 0, top: 0, bottom: 0 }, spacing: 0, childAlignment: "upper-left", reverseOrder: false, controlChildWidth: true, controlChildHeight: true, forceExpandWidth: false, forceExpandHeight: false };
      node = { ...base, type, layoutGroup: { base: layoutGroup } };
    } else if (type === "grid-layout") {
      const layoutGroup: GridLayoutSettings = { padding: { left: 0, right: 0, top: 0, bottom: 0 }, spacingX: 0, spacingY: 0, cellWidth: 100, cellHeight: 100, startCorner: "upper-left", startAxis: "horizontal", childAlignment: "upper-left", constraint: "flexible" };
      node = { ...base, type, layoutGroup: { base: layoutGroup } };
    } else if (type === "scroll-view") {
      const scrollView: ScrollViewSettings = { direction: "vertical", padding: { left: 0, right: 0, top: 0, bottom: 0 }, itemSpacing: 0, cornerRadius: 0, easingEnabled: true };
      node = { ...base, type, scrollView };
    } else if (type === "input") {
      node = {
        ...base,
        type,
        placeholder: "Enter text",
        defaultValue: "",
        secure: false,
        align: "left",
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        cleanOnFocus: false,
        clipText: true,
        textStyle: { fontFamily: "Arial", fontSize: 24, fontWeight: "normal", fontStyle: "normal", fill: "#FFFFFF", align: "left", verticalAlign: "top", wordWrap: false, breakWords: false, letterSpacing: 0 },
      };
    } else if (type === "slider" || type === "progress-bar") {
      const asset = candidate.assets.find((candidateAsset) => candidateAsset.type === "image");
      if (asset === undefined) {
        console.warn(`Cannot add a ${type} node: the project document does not contain an image asset.`);
        return state;
      }
      const fillPadding = { left: 0, right: 0, top: 0, bottom: 0 };
      node = type === "slider"
        ? { ...base, type, backgroundAssetId: asset.id, fillAssetId: asset.id, handleAssetId: asset.id, min: 0, max: 100, step: 1, defaultValue: 50, fillPadding, showValue: false }
        : { ...base, type, backgroundAssetId: asset.id, fillAssetId: asset.id, defaultProgress: 50, fillPadding };
    } else if (type === "particle-emitter") {
      const existing = candidate.effects.find((effect) => effect.type === "particles");
      const image = candidate.assets.find((asset) => asset.type === "image");
      if (existing === undefined && image === undefined) { console.warn("Cannot add a particle emitter: the project document does not contain an image asset."); return state; }
      const effect = existing ?? createDefaultParticleEffect(createStableId(), `Particles ${candidate.effects.filter((item) => item.type === "particles").length + 1}`);
      if (existing === undefined) { if (effect.particle.visual.source.type === "single") effect.particle.visual.source.assetId = image!.id; candidate.effects.push(effect); }
      node = { ...base, type, effectId: effect.id, autoplay: true, simulationSpace: "local" };
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
    const resolved = resolveAssetReference(candidate, assetId);
    if (target === undefined || resolved === undefined) {
      console.warn(`Cannot add a node from asset '${assetId}': the editing target or asset does not exist.`);
      return state;
    }

    const isImage = resolved.kind === "atlasFrame" || resolved.asset.type === "image";
    const name = resolved.kind === "atlasFrame" ? `${resolved.atlas.name} / ${resolved.frameName}` : resolved.asset.name;
    const sceneRoot = "layout" in target ? getSceneRoot(target) : undefined;
    const imageSize = resolved.kind === "atlasFrame" ? getCachedAtlasFrameSize(resolved.atlas, resolved.frameName) : getCachedImageAssetSize(resolved.asset);
    const spineSize = resolved.kind === "asset" ? getCachedSpineAssetSize(resolved.asset) : undefined;
    const width = isImage ? imageSize?.width ?? 100 : spineSize?.width ?? 200;
    const height = isImage ? imageSize?.height ?? 100 : spineSize?.height ?? 200;
    const parentSize = getParentLayoutSize(target, { parentId: sceneRoot?.id ?? null } as UINode, state.activeProfile);
    const parentPosition = worldPointToLocal(
      sceneRoot === undefined ? undefined : getNodeWorldMatrix(target, sceneRoot.id, state.activeProfile),
      position,
    );
    if (parentPosition === undefined) {
      console.warn(`Cannot add a node from asset '${assetId}': the destination parent has a non-invertible transform.`);
      return state;
    }
    const x = parentPosition.x - parentSize.width * 0.5;
    const y = parentPosition.y - parentSize.height * 0.5;
    const node: UINode = {
      id: createStableId(),
      name,
      type: isImage ? "image" : "spine",
      assetId,
      parentId: sceneRoot?.id ?? null,
      children: [],
      visible: true,
      transform: {
        x: state.activeProfile === "desktop" ? x : 0,
        y: state.activeProfile === "desktop" ? y : 0,
        width,
        height,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorMinX: 0.5,
        anchorMaxX: 0.5,
        anchorMinY: 0.5,
        anchorMaxY: 0.5,
        pivotX: 0.5,
        pivotY: 0.5,
      },
    };
    if (state.activeProfile === "mobile") {
      node.layoutOverrides = { mobile: { transform: { x, y } } };
    }
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
