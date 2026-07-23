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
import { createParticlesSlice } from "./particles.slice.js";
import { createHistorySlice } from "./history.slice.js";
import { createWorkspaceSlice } from "./workspace.slice.js";
import type { EditorState } from "./types.js";
import { buildEditorJson } from "../shared/editorJson.js";
import { bootstrapProjectStore } from "../shared/projectStore/bootstrap.js";
import { projectStore } from "../shared/projectStore/index.js";
import { isWorkingCopyLoadSuppressed, withWorkingCopyLoadSuppressed } from "../shared/projectStore/loadGuard.js";
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
  particlePlayback: {},
  particleDiagnostics: {},
  ...createHistorySlice(set, get),
  ...createSelectionSlice(set, get),
  ...createScenesSlice(set, get),
  ...createNodesSlice(set, get),
  ...createAssetsSlice(set, get),
  ...createPrefabsSlice(set, get),
  ...createSpineSlice(set, get),
  ...createButtonSlice(set, get),
  ...createValueControlsSlice(set, get),
  ...createParticlesSlice(set, get),
  ...createWorkspaceSlice(set, get),
}));
// Autosave: every committed document/editor-state mutation goes straight to the IndexedDB working copy
// (`projectStore`) instead of `localStorage`. Both writes are fire-and-forget, same as the old localStorage
// write; a failure only logs a warning; the in-memory `document`/`sceneId`/`activeProfile` stay authoritative.
// Suppressed (`isWorkingCopyLoadSuppressed`) while a whole working copy is being *loaded* (bootstrap, Open):
// without it, replacing `document` via `setState` would re-trigger this subscriber, write the just-loaded
// document straight back into storage, and flip `dirty` to `true` right after loading a clean project.
useEditorStore.subscribe((state, previousState) => {
  if (state.document === previousState.document || isWorkingCopyLoadSuppressed()) return;
  useEditorStore.setState({ dirty: true });
  void projectStore.putDocument(state.document).catch((error) => console.warn("The project document could not be saved to the working copy.", error));
});
useEditorStore.subscribe((state, previousState) => {
  if ((state.sceneId === previousState.sceneId && state.activeProfile === previousState.activeProfile) || isWorkingCopyLoadSuppressed()) return;
  useEditorStore.setState({ dirty: true });
  void projectStore.putEditorState(buildEditorJson(state.sceneId, state.activeProfile)).catch((error) => console.warn("The editor view state could not be saved to the working copy.", error));
});

// Only in a real browser: loads an existing IndexedDB working copy, or migrates a legacy localStorage
// document into one. Guarded so the many editor-store tests (Node, no IndexedDB) keep using the synchronous
// `initialDocument` fallback unchanged. Never sets `projectOpen`: the editor always starts at the startup
// screen (New/Open/Continue) and only actually loads the canvas once the user picks one, even if a working
// copy is ready to go (TASK-047). `bootstrapping` flips to `false` once this resolves either way, so the
// startup screen knows whether "no Continue button" means "no working copy" or "still checking".
if (typeof indexedDB !== "undefined") {
  void bootstrapProjectStore().then((result) => {
    if (result === undefined) return;
    const sceneId = result.document.scenes.some((scene) => scene.id === result.editorState.activeSceneId)
      ? (result.editorState.activeSceneId as string)
      : result.document.scenes[0]?.id ?? useEditorStore.getState().sceneId;
    withWorkingCopyLoadSuppressed(() => {
      useEditorStore.setState({
        document: result.document,
        sceneId,
        activeProfile: result.editorState.activeProfile,
        manifest: result.manifest,
        folderName: result.folderName,
        dirty: result.dirty,
      });
    });
  }).catch((error) => console.warn("Unable to load the project working copy.", error))
    .finally(() => useEditorStore.setState({ bootstrapping: false }));
}
