import { afterEach, vi } from "vitest";
import { useEditorStore } from "./store.js";

export const initialDocument = structuredClone(useEditorStore.getState().document);
export const imageNodeId = "10000000-0000-4000-8000-000000000004";
export const textNodeId = "10000000-0000-4000-8000-000000000006";

afterEach(() => {
  useEditorStore.setState({
    document: structuredClone(initialDocument),
    sceneId: initialDocument.scenes[0]!.id,
    activeProfile: "desktop",
    selectedNodeIds: [],
    selectedNodeId: null,
    editingPrefabId: null,
  });
  vi.unstubAllGlobals();
});
