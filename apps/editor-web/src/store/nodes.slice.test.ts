import { describe, expect, it, vi } from "vitest";
import { validateProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./index.js";
import { getNodeWorldMatrix } from "../canvas/transformCoordinates.js";
import { imageNodeId, initialDocument, textNodeId } from "./test-utils.js";

describe("addNode", () => {
  it("adds a valid node to the selected container", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("text");

    const document = useEditorStore.getState().document;
    const scene = document.scenes[0]!;
    const addedNode = scene.nodes.find((node) => !initialDocument.scenes[0]!.nodes.some((initialNode) => initialNode.id === node.id));

    expect(addedNode).toMatchObject({
      type: "text",
      name: "Text 2",
      parentId: rootNodeId,
      text: "New text",
      transform: {
        x: 0,
        y: 0,
        anchorMinX: 0.5,
        anchorMaxX: 0.5,
        anchorMinY: 0.5,
        anchorMaxY: 0.5,
        pivotX: 0.5,
        pivotY: 0.5,
      },
    });
    expect(scene.nodes.find((node) => node.id === rootNodeId)?.children).toContain(addedNode?.id);
    expect(validateProjectDocument(document).valid).toBe(true);
  });

  it("creates a button with only its required normal state assigned", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    const imageAssetId = initialDocument.assets.find((asset) => asset.type === "image")!.id;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("button");

    const document = useEditorStore.getState().document;
    const addedNode = document.scenes[0]!.nodes.at(-1)!;

    expect(addedNode).toMatchObject({ type: "button", parentId: rootNodeId, enabled: true, states: { normalAssetId: imageAssetId } });
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

describe("moveNode", () => {
  it("reparents and reorders nodes while keeping hierarchy references valid", () => {
    const scene = initialDocument.scenes[0]!;
    const rootNodeId = scene.rootNodeIds[0]!;

    useEditorStore.getState().moveNode(textNodeId, { parentId: rootNodeId, index: 0 });
    expect(useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === rootNodeId)?.children).toEqual([textNodeId, imageNodeId]);

    useEditorStore.getState().moveNode(imageNodeId, { parentId: textNodeId, index: 0 });

    let movedScene = useEditorStore.getState().document.scenes[0]!;
    expect(movedScene.nodes.find((node) => node.id === imageNodeId)?.parentId).toBe(textNodeId);
    expect(movedScene.nodes.find((node) => node.id === rootNodeId)?.children).toEqual([textNodeId]);
    expect(movedScene.nodes.find((node) => node.id === textNodeId)?.children).toEqual([imageNodeId]);

    useEditorStore.getState().moveNode(imageNodeId, { parentId: null, index: 0 });
    movedScene = useEditorStore.getState().document.scenes[0]!;
    expect(movedScene.rootNodeIds).toEqual([imageNodeId, rootNodeId]);
    expect(movedScene.nodes.find((node) => node.id === imageNodeId)?.parentId).toBeNull();
    expect(movedScene.nodes.find((node) => node.id === textNodeId)?.children).toEqual([]);
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);
  });

  it("rejects moving a node into its own subtree", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    const before = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().moveNode(rootNodeId, { parentId: imageNodeId, index: 0 });

    expect(useEditorStore.getState().document).toEqual(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("preserves the node world transform in both profiles when its parent changes", () => {
    const store = useEditorStore.getState();
    store.updateNodeProfileTransform(textNodeId, { x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 0.25 });
    store.setActiveProfile("mobile");
    useEditorStore.getState().updateNodeProfileTransform(textNodeId, { x: 20, y: 30, scaleX: 0.75, scaleY: 0.75, rotation: -0.1 });

    const beforeOwner = useEditorStore.getState().document.scenes[0]!;
    const beforeDesktop = getNodeWorldMatrix(beforeOwner, imageNodeId, "desktop")!;
    const beforeMobile = getNodeWorldMatrix(beforeOwner, imageNodeId, "mobile")!;

    useEditorStore.getState().moveNode(imageNodeId, { parentId: textNodeId, index: 0 });

    const afterOwner = useEditorStore.getState().document.scenes[0]!;
    const afterDesktop = getNodeWorldMatrix(afterOwner, imageNodeId, "desktop")!;
    const afterMobile = getNodeWorldMatrix(afterOwner, imageNodeId, "mobile")!;
    for (const key of ["a", "b", "c", "d", "tx", "ty"] as const) {
      expect(afterDesktop[key]).toBeCloseTo(beforeDesktop[key], 6);
      expect(afterMobile[key]).toBeCloseTo(beforeMobile[key], 6);
    }
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);
  });

  it("rejects a reparent that would require unsupported skew instead of moving the node visually", () => {
    useEditorStore.getState().updateNodeProfileTransform(textNodeId, { scaleX: 2, scaleY: 1, rotation: 0.5 });
    const before = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().moveNode(imageNodeId, { parentId: textNodeId, index: 0 });

    expect(useEditorStore.getState().document).toEqual(before);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("preserving its visual transform"));
    warn.mockRestore();
  });
});
