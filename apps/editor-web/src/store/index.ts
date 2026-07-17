import { serializeProjectDocument } from "@pixi-ui-editor/schema";
import { create } from "zustand";
import { createAssetsSlice } from "./assets.slice.js";
import { createButtonSlice } from "./button.slice.js";
import { firstScene, initialDocument } from "./helpers.js";
import { createNodesSlice } from "./nodes.slice.js";
import { createPrefabsSlice } from "./prefabs.slice.js";
import { createScenesSlice } from "./scenes.slice.js";
import { createSelectionSlice } from "./selection.slice.js";
import { createSpineSlice } from "./spine.slice.js";
import { createValueControlsSlice } from "./value-controls.slice.js";
import { DOCUMENT_STORAGE_KEY, type EditorState } from "./types.js";
export * from "./helpers.js";
export * from "./types.js";
export const useEditorStore = create<EditorState>((set, get) => ({
  document: initialDocument,
  sceneId: initialDocument.scenes[0]?.id ?? firstScene.id,
  activeProfile: "desktop",
  activeTool: "select",
  viewMode: "single",
  selectedNodeIds: [],
  selectedNodeId: null,
  editingPrefabId: null,
  spineFrameRequests: {},
  spinePlaybackFrames: {},
  spineAutoplay: {},
  buttonPreviewStates: {},
  sliderPreviewValues: {},
  progressBarPreviewValues: {},
  ...createSelectionSlice(set, get),
  ...createScenesSlice(set, get),
  ...createNodesSlice(set, get),
  ...createAssetsSlice(set, get),
  ...createPrefabsSlice(set, get),
  ...createSpineSlice(set, get),
  ...createButtonSlice(set, get),
  ...createValueControlsSlice(set, get),
}));
useEditorStore.subscribe((state, previousState) => {
  if (state.document === previousState.document) return;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DOCUMENT_STORAGE_KEY, serializeProjectDocument(state.document));
  } catch (error) {
    console.warn("The project document could not be saved to localStorage.", error);
  }
});
