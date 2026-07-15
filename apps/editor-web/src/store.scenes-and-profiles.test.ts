import { describe, expect, it, vi } from "vitest";
import { validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";
import { imageNodeId, initialDocument, textNodeId } from "./store.test-utils.js";

describe("scenes", () => {
  it("addScene creates a valid document with two windows and activates the new one", () => {
    useEditorStore.getState().addScene();

    const state = useEditorStore.getState();
    expect(state.document.scenes).toHaveLength(2);
    const addedScene = state.document.scenes[1]!;
    expect(addedScene).toMatchObject({ name: "Window 2", rootNodeIds: [expect.any(String)] });
    expect(addedScene.nodes).toHaveLength(1);
    expect(addedScene.nodes[0]).toMatchObject({ id: addedScene.rootNodeIds[0], name: "Root", type: "container", parentId: null, children: [] });
    expect(addedScene.nodes[0]?.layoutOverrides?.mobile?.transform).toMatchObject(addedScene.layout.referenceViewports.mobile);
    expect(addedScene.layout.referenceViewports).toEqual(initialDocument.scenes[0]!.layout.referenceViewports);
    expect(state.sceneId).toBe(addedScene.id);
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("deleteScene rejects deleting the last window", () => {
    const sceneId = useEditorStore.getState().document.scenes[0]!.id;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().deleteScene(sceneId);

    expect(useEditorStore.getState().document.scenes).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("updateNode", () => {
  it("updates valid fields and rejects a patch that invalidates the document", () => {
    const store = useEditorStore.getState();
    store.updateNode(imageNodeId, { name: "Updated logo" });
    store.updateNodeProfileTransform(imageNodeId, { x: 42 });

    const updated = useEditorStore.getState().document.scenes[0]!.nodes[1]!;
    expect(updated.name).toBe("Updated logo");
    expect(updated.transform.x).toBe(42);

    const documentBeforeInvalidPatch: ProjectDocument = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().updateNodeProfileTransform(imageNodeId, { width: 0 });

    expect(useEditorStore.getState().document).toEqual(documentBeforeInvalidPatch);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("updateReferenceViewport", () => {
  it("updates a valid mobile viewport and rejects an invalid one without changing the store", () => {
    useEditorStore.getState().updateReferenceViewport("mobile", { width: 500, height: 900 });
    expect(useEditorStore.getState().document.scenes[0]!.layout.referenceViewports.mobile).toEqual({ width: 500, height: 900 });

    const beforeInvalidUpdate = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().updateReferenceViewport("mobile", { width: 0, height: 900 });

    expect(useEditorStore.getState().document).toEqual(beforeInvalidUpdate);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("updateNodeProfileTransform", () => {
  it("writes a partial mobile override without changing the base transform, then writes to the base in desktop", () => {
    const baseX = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === textNodeId)!.transform.x;

    useEditorStore.setState({ activeProfile: "mobile" });
    useEditorStore.getState().updateNodeProfileTransform(textNodeId, { x: 10 });

    const mobileNode = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === textNodeId)!;
    expect(mobileNode.transform.x).toBe(baseX);
    expect(mobileNode.layoutOverrides?.mobile?.transform).toEqual({ x: 10 });

    useEditorStore.setState({ activeProfile: "desktop" });
    useEditorStore.getState().updateNodeProfileTransform(textNodeId, { x: 20 });

    expect(useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === textNodeId)!.transform.x).toBe(20);
  });
});

describe("setNodeOrientationVisibility", () => {
  it("writes false to a mobile override and removes the visible key and empty overrides when re-enabled", () => {
    useEditorStore.getState().setNodeOrientationVisibility(textNodeId, "mobile", false);

    let node = useEditorStore.getState().document.scenes[0]!.nodes.find((candidate) => candidate.id === textNodeId)!;
    expect(node.layoutOverrides?.mobile?.visible).toBe(false);
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);

    useEditorStore.getState().setNodeOrientationVisibility(textNodeId, "mobile", true);

    node = useEditorStore.getState().document.scenes[0]!.nodes.find((candidate) => candidate.id === textNodeId)!;
    expect(node.layoutOverrides).toBeUndefined();
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);
  });
});
