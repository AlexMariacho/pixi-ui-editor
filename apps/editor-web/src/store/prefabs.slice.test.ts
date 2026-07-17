import { describe, expect, it, vi } from "vitest";
import { validateProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./index.js";
import { initialDocument, textNodeId } from "./test-utils.js";

describe("prefabs", () => {
  it("createPrefabFromNode creates a valid preset copy and replaces the source subtree with its preset instance", () => {
    const sourceRoot = initialDocument.scenes[0]!.nodes.find((node) => node.id === textNodeId)!;

    const error = useEditorStore.getState().createPrefabFromNode(textNodeId);

    expect(error).toBeNull();
    const state = useEditorStore.getState();
    const prefab = state.document.prefabs.at(-1)!;
    const prefabRoot = prefab.nodes.find((node) => node.id === prefab.rootNodeIds[0])!;
    expect(prefab.name).toBe(sourceRoot.name);
    expect(prefab.exposedProperties).toEqual([]);
    expect(prefabRoot).toMatchObject({ parentId: null, transform: expect.objectContaining({ x: 0, y: 0 }) });
    expect(prefab.nodes.some((node) => initialDocument.scenes[0]!.nodes.some((sourceNode) => sourceNode.id === node.id))).toBe(false);
    const instance = state.document.scenes[0]!.nodes.find((node) => node.type === "prefab-instance");
    expect(instance).toMatchObject({ name: sourceRoot.name, prefabId: prefab.id, parentId: sourceRoot.parentId, transform: sourceRoot.transform });
    expect(state.document.scenes[0]!.nodes.some((node) => node.id === textNodeId)).toBe(false);
    expect(state.selectedNodeId).toBe(instance?.id);
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("promotes a container transform to the preset instance without retaining a duplicate container", () => {
    const sourceRoot = initialDocument.scenes[0]!.nodes.find((node) => node.id === initialDocument.scenes[0]!.rootNodeIds[0])!;

    const error = useEditorStore.getState().createPrefabFromNode(sourceRoot.id);

    expect(error).toBeNull();
    const state = useEditorStore.getState();
    const prefab = state.document.prefabs.at(-1)!;
    const instance = state.document.scenes[0]!.nodes.find((node) => node.type === "prefab-instance")!;
    expect(prefab.nodes.some((node) => node.name === sourceRoot.name && node.type === "container")).toBe(false);
    expect(prefab.rootNodeIds).toHaveLength(sourceRoot.children.length);
    expect(instance.transform).toEqual(sourceRoot.transform);
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("createPrefabFromNode rejects a subtree that contains a preset instance", () => {
    useEditorStore.getState().createPrefabFromNode(textNodeId);
    const prefabId = useEditorStore.getState().document.prefabs.at(-1)!.id;
    useEditorStore.getState().addPrefabInstance(prefabId, { x: 10, y: 20 });
    const instanceNode = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!;
    expect(instanceNode).toMatchObject({ type: "prefab-instance", prefabId });
    const beforeRejectedCreation = structuredClone(useEditorStore.getState().document);

    const error = useEditorStore.getState().createPrefabFromNode(instanceNode.id);

    expect(error).not.toBeNull();
    expect(useEditorStore.getState().document).toEqual(beforeRejectedCreation);
  });

  it("deletePrefab is rejected while an instance of the preset exists", () => {
    useEditorStore.getState().createPrefabFromNode(textNodeId);
    const prefabId = useEditorStore.getState().document.prefabs.at(-1)!.id;
    useEditorStore.getState().addPrefabInstance(prefabId, { x: 0, y: 0 });
    const beforeRejectedDeletion = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().deletePrefab(prefabId);

    expect(useEditorStore.getState().document).toEqual(beforeRejectedDeletion);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("leaves preset editing when a window is selected", () => {
    useEditorStore.getState().createPrefabFromNode(textNodeId);
    const prefabId = useEditorStore.getState().document.prefabs.at(-1)!.id;
    const sceneId = useEditorStore.getState().document.scenes[0]!.id;

    useEditorStore.getState().setEditingPrefabId(prefabId);
    useEditorStore.getState().selectScene(sceneId);

    expect(useEditorStore.getState()).toMatchObject({ sceneId, editingPrefabId: null, selectedNodeId: null, selectedNodeIds: [] });
  });

  it("leaves preset editing when opening map", () => {
    useEditorStore.getState().createPrefabFromNode(textNodeId);
    const prefabId = useEditorStore.getState().document.prefabs.at(-1)!.id;

    useEditorStore.getState().setEditingPrefabId(prefabId);
    useEditorStore.getState().setViewMode("map");

    expect(useEditorStore.getState()).toMatchObject({ editingPrefabId: null, viewMode: "map", selectedNodeId: null, selectedNodeIds: [], activeTool: "pan" });
  });
});
