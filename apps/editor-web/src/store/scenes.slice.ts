import { createStableId, type Scene } from "@pixi-ui-editor/schema";
import { commitCandidate, createSceneRoot, getSceneRoot } from "./helpers.js";
import type { EditorSlice } from "./types.js";
type Keys = "addScene" | "renameScene" | "setSceneAudio" | "deleteScene" | "updateReferenceViewport";
export const createScenesSlice: EditorSlice<Keys> = (set) => ({
  addScene: (name) => set((state) => {
    const candidate = structuredClone(state.document);
    const activeScene = candidate.scenes.find((scene) => scene.id === state.sceneId) ?? candidate.scenes[0];
    if (activeScene === undefined) {
      console.warn("Cannot add a window: the project document does not contain a scene to copy viewports from.");
      return state;
    }

    const trimmedName = name?.trim() ?? "";
    const scene: Scene = {
      id: createStableId(),
      name: trimmedName !== "" ? trimmedName : `Window ${candidate.scenes.length + 1}`,
      rootNodeIds: [],
      nodes: [],
      layout: { referenceViewports: structuredClone(activeScene.layout.referenceViewports) },
    };
    const root = createSceneRoot(scene);
    scene.rootNodeIds.push(root.id);
    scene.nodes.push(root);
    candidate.scenes.push(scene);

    const committed = commitCandidate(state, candidate, "Window creation was rejected because it makes the project document invalid.");
    return committed === state ? state : { ...committed, sceneId: scene.id, selectedNodeIds: [], selectedNodeId: null };
  }),
  renameScene: (sceneId, name) => set((state) => {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      console.warn(`Cannot rename window '${sceneId}': the name must not be empty.`);
      return state;
    }

    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === sceneId);
    if (scene === undefined) {
      console.warn(`Cannot rename window '${sceneId}': it does not exist.`);
      return state;
    }

    scene.name = trimmedName;
    return commitCandidate(state, candidate, "Window rename was rejected because it makes the project document invalid.");
  }),
  setSceneAudio: (sceneId, audio) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === sceneId);
    if (scene === undefined) {
      console.warn(`Cannot set audio for window '${sceneId}': it does not exist.`);
      return state;
    }
    if (audio === undefined || (audio.backgroundMusicAssetId === undefined && audio.volume === undefined)) delete scene.audio;
    else {
      const normalized: NonNullable<Scene["audio"]> = {};
      if (audio.backgroundMusicAssetId !== undefined) normalized.backgroundMusicAssetId = audio.backgroundMusicAssetId;
      if (audio.volume !== undefined) normalized.volume = audio.volume;
      scene.audio = normalized;
    }
    return commitCandidate(state, candidate, "Window audio update was rejected because it makes the project document invalid.");
  }),
  deleteScene: (sceneId) => set((state) => {
    if (state.document.scenes.length <= 1) {
      console.warn("Cannot delete the last window of the project.");
      return state;
    }

    const candidate = structuredClone(state.document);
    const sceneIndex = candidate.scenes.findIndex((scene) => scene.id === sceneId);
    if (sceneIndex === -1) {
      console.warn(`Cannot delete window '${sceneId}': it does not exist.`);
      return state;
    }

    candidate.scenes.splice(sceneIndex, 1);
    const committed = commitCandidate(state, candidate, "Window deletion was rejected because it makes the project document invalid.");
    if (committed === state) return state;
    if (state.sceneId !== sceneId) return committed;
    return { ...committed, sceneId: candidate.scenes[0]!.id, selectedNodeIds: [], selectedNodeId: null };
  }),
  updateReferenceViewport: (profile, viewport) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);

    if (scene === undefined) {
      console.warn(`Cannot update reference viewport: scene '${state.sceneId}' does not exist.`);
      return state;
    }

    scene.layout.referenceViewports[profile] = { ...viewport };
    const root = getSceneRoot(scene);
    if (root !== undefined) {
      if (profile === "desktop") root.transform = { ...root.transform, width: viewport.width, height: viewport.height };
      else {
        root.layoutOverrides ??= {};
        root.layoutOverrides.mobile ??= {};
        root.layoutOverrides.mobile.transform = { ...root.layoutOverrides.mobile.transform, width: viewport.width, height: viewport.height };
      }
    }
    return commitCandidate(state, candidate, "Reference viewport update was rejected because it makes the project document invalid.");
  }),
});
