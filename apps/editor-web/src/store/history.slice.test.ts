import { describe, expect, it } from "vitest";
import { useEditorStore } from "./index.js";
import { HISTORY_LIMIT } from "./history.slice.js";
import { imageNodeId } from "./test-utils.js";

describe("document history", () => {
  it("restores a committed document and moves its current state between undo and redo", () => {
    const store = useEditorStore.getState();
    const before = store.document;
    store.updateNode(imageNodeId, { name: "Changed logo" });
    const changed = useEditorStore.getState().document;

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toBe(before);
    expect(useEditorStore.getState().redoStack).toHaveLength(1);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document).toBe(changed);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
  });

  it("clears redo when a new commit follows undo", () => {
    useEditorStore.getState().updateNode(imageNodeId, { name: "First" });
    useEditorStore.getState().undo();
    useEditorStore.getState().updateNode(imageNodeId, { name: "Replacement" });

    expect(useEditorStore.getState().redoStack).toEqual([]);
  });

  it("coalesces commits in one gesture into a single undo step", () => {
    const before = useEditorStore.getState().document;
    const store = useEditorStore.getState();
    store.beginHistoryGesture();
    store.updateNodeProfileTransform(imageNodeId, { x: 300 });
    useEditorStore.getState().updateNodeProfileTransform(imageNodeId, { x: 420 });
    useEditorStore.getState().endHistoryGesture();

    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toBe(before);
  });

  it("restores a deleted selection and discards the oldest entry at the history limit", () => {
    const store = useEditorStore.getState();
    store.selectNode(imageNodeId);
    store.deleteNode(imageNodeId);
    store.undo();

    const restored = useEditorStore.getState();
    expect(restored.document.scenes[0]!.nodes.some((node) => node.id === imageNodeId)).toBe(true);
    expect(restored.selectedNodeIds).toEqual([imageNodeId]);
    expect(restored.selectedNodeId).toBe(imageNodeId);

    for (let index = 0; index <= HISTORY_LIMIT; index += 1) {
      useEditorStore.getState().updateNode(imageNodeId, { name: `Logo ${index}` });
    }
    expect(useEditorStore.getState().undoStack).toHaveLength(HISTORY_LIMIT);
  });
});
