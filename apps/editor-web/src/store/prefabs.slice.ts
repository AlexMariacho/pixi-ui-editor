import { createStableId, type UINode } from "@pixi-ui-editor/schema";
import { commitCandidate, computePrefabBoundingBox, getSceneRoot } from "./helpers.js";
import type { EditorSlice } from "./types.js";
type Keys = "createPrefabFromNode" | "addPrefabInstance" | "renamePrefab" | "deletePrefab" | "setEditingPrefabId";
export const createPrefabsSlice: EditorSlice<Keys> = (set) => ({
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

      // РљРѕРїРёСЏ РїРѕРґРґРµСЂРµРІР° РїРѕР»СѓС‡Р°РµС‚ РЅРѕРІС‹Рµ stable ID: ID РіР»РѕР±Р°Р»СЊРЅРѕ СѓРЅРёРєР°Р»СЊРЅС‹ РІ РґРѕРєСѓРјРµРЅС‚Рµ.
      const sourceIsContainer = sourceNode.type === "container";
      const prefabSourceNodes = sourceIsContainer ? subtree.filter((node) => node.id !== sourceNode.id) : subtree;
      const idBySourceId = new Map(prefabSourceNodes.map((node) => [node.id, createStableId()]));
      const copies = prefabSourceNodes.map((node) => {
        const copy = structuredClone(node);
        copy.id = idBySourceId.get(node.id)!;
        copy.parentId = node.id === sourceNode.id || node.parentId === sourceNode.id
          ? null
          : idBySourceId.get(node.parentId!)!;
        copy.children = node.children.map((childId) => idBySourceId.get(childId)!);
        if (node.id === sourceNode.id) copy.transform = { ...copy.transform, x: 0, y: 0 };
        return copy;
      });

      const prefabId = createStableId();
      candidate.prefabs.push({
        id: prefabId,
        name: sourceNode.name,
        rootNodeIds: sourceIsContainer
          ? sourceNode.children.map((childId) => idBySourceId.get(childId)!)
          : [idBySourceId.get(sourceNode.id)!],
        nodes: copies,
        exposedProperties: [],
      });

      const sourceParent = sourceNode.parentId === null
        ? undefined
        : nodesById.get(sourceNode.parentId);
      const sourceSiblings = sourceParent?.children ?? scene.rootNodeIds;
      const sourceIndex = sourceSiblings.indexOf(sourceNode.id);
      if (sourceIndex < 0) {
        error = `Cannot create a preset from '${nodeId}': its hierarchy position is inconsistent.`;
        return state;
      }

      const instance: UINode = {
        id: createStableId(),
        name: sourceNode.name,
        type: "prefab-instance",
        prefabId,
        parentId: sourceNode.parentId,
        children: [],
        visible: sourceNode.visible,
        transform: structuredClone(sourceNode.transform),
        ...(sourceNode.layoutOverrides === undefined ? {} : { layoutOverrides: structuredClone(sourceNode.layoutOverrides) }),
      };
      const subtreeIds = new Set(subtree.map((node) => node.id));
      scene.nodes = scene.nodes.filter((node) => !subtreeIds.has(node.id));
      scene.nodes.push(instance);
      sourceSiblings.splice(sourceIndex, 1, instance.id);

      const committed = commitCandidate(state, candidate, "Preset creation was rejected because it makes the project document invalid.");
      if (committed === state) error = "Preset creation was rejected because it makes the project document invalid.";
      return committed === state ? state : { ...committed, selectedNodeIds: [instance.id], selectedNodeId: instance.id };
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
});
