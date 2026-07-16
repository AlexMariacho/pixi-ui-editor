import { describe, expect, it, vi } from "vitest";
import { validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";
import { getNodeWorldMatrix } from "./transformCoordinates.js";
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

describe("setNodeProfileAnchor", () => {
  it("changes an anchor without moving the node, then Shift+Ctrl snaps its matching pivot to the scene edge", () => {
    const before = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === imageNodeId)!.transform;
    const mobileBefore = structuredClone(useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === imageNodeId)!.layoutOverrides?.mobile?.transform);
    const parentWidth = useEditorStore.getState().document.scenes[0]!.layout.referenceViewports.desktop.width;

    useEditorStore.getState().setNodeProfileAnchor(imageNodeId, 0.5, 0, { setPivot: false, snap: false });
    let transform = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === imageNodeId)!.transform;
    expect(transform).toMatchObject({ anchorX: 0.5, anchorY: 0, x: before.x - parentWidth * 0.5, y: before.y });

    useEditorStore.getState().setNodeProfileAnchor(imageNodeId, 1, 1, { setPivot: true, snap: true });
    transform = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === imageNodeId)!.transform;
    expect(transform).toMatchObject({ anchorX: 1, anchorY: 1, pivotX: 1, pivotY: 1, x: -before.width, y: -before.height });
    expect(useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === imageNodeId)!.layoutOverrides?.mobile?.transform).toMatchObject({
      ...mobileBefore,
      anchorX: 0,
      anchorY: 0,
      pivotX: 0,
      pivotY: 0,
    });
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);
  });

  it("stores anchor changes in the active mobile profile only", () => {
    useEditorStore.setState({ activeProfile: "mobile" });
    useEditorStore.getState().setNodeProfileAnchor(textNodeId, 0.5, 0.5, { setPivot: false, snap: false });

    const node = useEditorStore.getState().document.scenes[0]!.nodes.find((candidate) => candidate.id === textNodeId)!;
    expect(node.transform.anchorX).toBeUndefined();
    expect(node.layoutOverrides?.mobile?.transform).toMatchObject({ anchorX: 0.5, anchorY: 0.5 });
  });

  it("snaps a nested node to the scene edge instead of its immediate parent edge", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("container");
    const containerId = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!.id;
    useEditorStore.getState().updateNodeProfileTransform(containerId, { x: 300, y: 200, width: 400, height: 300 });
    useEditorStore.getState().moveNode(imageNodeId, { parentId: containerId, index: 0 });

    useEditorStore.getState().setNodeProfileAnchor(imageNodeId, 1, 1, { setPivot: true, snap: true });

    const scene = useEditorStore.getState().document.scenes[0]!;
    const image = scene.nodes.find((node) => node.id === imageNodeId)!;
    const world = getNodeWorldMatrix(scene, imageNodeId, "desktop")!;
    const pivotX = (image.transform.pivotX ?? 0) * image.transform.width;
    const pivotY = (image.transform.pivotY ?? 0) * image.transform.height;
    const worldPivot = {
      x: world.a * pivotX + world.c * pivotY + world.tx,
      y: world.b * pivotX + world.d * pivotY + world.ty,
    };
    expect(worldPivot.x).toBeCloseTo(scene.layout.referenceViewports.desktop.width, 6);
    expect(worldPivot.y).toBeCloseTo(scene.layout.referenceViewports.desktop.height, 6);
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
