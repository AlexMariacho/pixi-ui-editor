import { afterEach, describe, expect, it, vi } from "vitest";
import { validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";

const initialDocument = structuredClone(useEditorStore.getState().document);
const imageNodeId = "10000000-0000-4000-8000-000000000004";

afterEach(() => {
  useEditorStore.setState({
    document: structuredClone(initialDocument),
    sceneId: initialDocument.scenes[0]!.id,
    selectedNodeId: null,
  });
});

describe("addNode", () => {
  it("adds a valid node to the selected container", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("text");

    const document = useEditorStore.getState().document;
    const scene = document.scenes[0]!;
    const addedNode = scene.nodes.find((node) => !initialDocument.scenes[0]!.nodes.some((initialNode) => initialNode.id === node.id));

    expect(addedNode).toMatchObject({ type: "text", name: "Text 2", parentId: rootNodeId, text: "New text" });
    expect(scene.nodes.find((node) => node.id === rootNodeId)?.children).toContain(addedNode?.id);
    expect(validateProjectDocument(document).valid).toBe(true);
  });
});

describe("deleteNode", () => {
  it("deletes an entire subtree from both nodes and parent children", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("container");
    const containerId = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!.id;
    useEditorStore.getState().selectNode(containerId);
    useEditorStore.getState().addNode("text");
    const childId = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!.id;

    useEditorStore.getState().deleteNode(containerId);

    const state = useEditorStore.getState();
    const scene = state.document.scenes[0]!;
    expect(scene.nodes.some((node) => node.id === containerId || node.id === childId)).toBe(false);
    expect(scene.nodes.find((node) => node.id === rootNodeId)?.children).not.toContain(containerId);
    expect(state.selectedNodeId).toBeNull();
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("does not delete the last root node", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    const before = structuredClone(useEditorStore.getState().document);

    useEditorStore.getState().deleteNode(rootNodeId);

    expect(useEditorStore.getState().document).toEqual(before);
  });
});

describe("updateNode", () => {
  it("updates valid fields and rejects a patch that invalidates the document", () => {
    const store = useEditorStore.getState();
    store.updateNode(imageNodeId, { name: "Updated logo", transform: { ...store.document.scenes[0]!.nodes[1]!.transform, x: 42 } });

    const updated = useEditorStore.getState().document.scenes[0]!.nodes[1]!;
    expect(updated.name).toBe("Updated logo");
    expect(updated.transform.x).toBe(42);

    const documentBeforeInvalidPatch: ProjectDocument = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().updateNode(imageNodeId, { transform: { ...updated.transform, width: 0 } });

    expect(useEditorStore.getState().document).toEqual(documentBeforeInvalidPatch);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
