import type { EditorSlice } from "./types.js";
type Keys = "selectNode" | "selectNodes" | "selectScene" | "setActiveProfile" | "setActiveTool" | "setViewMode";
export const createSelectionSlice: EditorSlice<Keys> = (set) => ({
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setViewMode: (mode) => set((state) => {
    if (mode === state.viewMode) return state;
    return mode === "map"
      ? { viewMode: mode, editingPrefabId: null, selectedNodeIds: [], selectedNodeId: null, activeTool: "pan" }
      : { viewMode: mode };
  }),
  selectNode: (id, additive = false) => set((state) => {
    if (id === null) return { selectedNodeIds: [], selectedNodeId: null };
    if (!additive) return { selectedNodeIds: [id], selectedNodeId: id };
    if (state.selectedNodeIds.includes(id)) {
      const selectedNodeIds = state.selectedNodeIds.filter((candidateId) => candidateId !== id);
      return { selectedNodeIds, selectedNodeId: selectedNodeIds.at(-1) ?? null };
    }
    return { selectedNodeIds: [...state.selectedNodeIds, id], selectedNodeId: id };
  }),
  selectNodes: (ids, additive = false) => set((state) => {
    const uniqueIds = [...new Set(ids)];
    if (!additive) return { selectedNodeIds: uniqueIds, selectedNodeId: uniqueIds.at(-1) ?? null };
    const selectedNodeIds = [...state.selectedNodeIds];
    for (const id of uniqueIds) {
      if (!selectedNodeIds.includes(id)) selectedNodeIds.push(id);
    }
    return { selectedNodeIds, selectedNodeId: selectedNodeIds.at(-1) ?? null };
  }),
  selectScene: (sceneId) => set((state) => {
    if (!state.document.scenes.some((scene) => scene.id === sceneId)) {
      console.warn(`Cannot select scene '${sceneId}': it does not exist.`);
      return state;
    }
    return { sceneId, editingPrefabId: null, selectedNodeIds: [], selectedNodeId: null };
  }),
});
