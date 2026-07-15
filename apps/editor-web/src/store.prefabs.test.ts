import { describe, expect, it, vi } from "vitest";
import { validateProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";
import { initialDocument, textNodeId } from "./store.test-utils.js";

describe("prefabs", () => {
  it("createPrefabFromNode creates a valid preset copy and leaves the source subtree untouched", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    const sourceRoot = initialDocument.scenes[0]!.nodes.find((node) => node.id === rootNodeId)!;

    const error = useEditorStore.getState().createPrefabFromNode(rootNodeId);

    expect(error).toBeNull();
    const state = useEditorStore.getState();
    const prefab = state.document.prefabs.at(-1)!;
    const prefabRoot = prefab.nodes.find((node) => node.id === prefab.rootNodeIds[0])!;
    expect(prefab.name).toBe(sourceRoot.name);
    expect(prefab.exposedProperties).toEqual([]);
    expect(prefabRoot).toMatchObject({ parentId: null, transform: expect.objectContaining({ x: 0, y: 0 }) });
    expect(prefab.nodes.some((node) => initialDocument.scenes[0]!.nodes.some((sourceNode) => sourceNode.id === node.id))).toBe(false);
    expect(state.document.scenes).toEqual(initialDocument.scenes);
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
});
