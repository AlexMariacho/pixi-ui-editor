import { describe, expect, it } from "vitest";
import { useEditorStore } from "./store.js";
import { imageNodeId, textNodeId } from "./store.test-utils.js";

describe("node selection", () => {
  it("replaces, adds, toggles, and clears selected nodes while keeping the last selected node primary", () => {
    useEditorStore.getState().selectNode(imageNodeId);
    expect(useEditorStore.getState()).toMatchObject({ selectedNodeIds: [imageNodeId], selectedNodeId: imageNodeId });

    useEditorStore.getState().selectNode(textNodeId, true);
    expect(useEditorStore.getState()).toMatchObject({ selectedNodeIds: [imageNodeId, textNodeId], selectedNodeId: textNodeId });

    useEditorStore.getState().selectNode(textNodeId, true);
    expect(useEditorStore.getState()).toMatchObject({ selectedNodeIds: [imageNodeId], selectedNodeId: imageNodeId });

    useEditorStore.getState().selectNodes([textNodeId, imageNodeId, textNodeId]);
    expect(useEditorStore.getState()).toMatchObject({ selectedNodeIds: [textNodeId, imageNodeId], selectedNodeId: imageNodeId });

    useEditorStore.getState().selectNode(null);
    expect(useEditorStore.getState()).toMatchObject({ selectedNodeIds: [], selectedNodeId: null });
  });

  it("updates selected node transforms in one document commit", () => {
    useEditorStore.getState().updateNodeProfileTransforms([
      { nodeId: imageNodeId, patch: { x: 810, y: 170 } },
      { nodeId: textNodeId, patch: { x: 830, y: 410 } },
    ]);

    const nodes = useEditorStore.getState().document.scenes[0]!.nodes;
    expect(nodes.find((node) => node.id === imageNodeId)?.transform).toMatchObject({ x: 810, y: 170 });
    expect(nodes.find((node) => node.id === textNodeId)?.transform).toMatchObject({ x: 830, y: 410 });
  });
});
