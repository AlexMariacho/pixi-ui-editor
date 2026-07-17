import { commitCandidate, getEditingTarget } from "./helpers.js";
import type { EditorSlice } from "./types.js";

type Keys = "updateSlider" | "updateProgressBar" | "previewSliderValue" | "previewProgressBar";

export const createValueControlsSlice: EditorSlice<Keys> = (set) => ({
  updateSlider: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node?.type !== "slider") return state;
    Object.assign(node, patch);
    return commitCandidate(state, candidate, "Slider update was rejected because it makes the project document invalid.");
  }),
  updateProgressBar: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((item) => item.id === nodeId);
    if (node?.type !== "progress-bar") return state;
    Object.assign(node, patch);
    return commitCandidate(state, candidate, "Progress bar update was rejected because it makes the project document invalid.");
  }),
  previewSliderValue: (nodeId, value) => set((state) => ({ sliderPreviewValues: { ...state.sliderPreviewValues, [nodeId]: value } })),
  previewProgressBar: (nodeId, progress) => set((state) => ({ progressBarPreviewValues: { ...state.progressBarPreviewValues, [nodeId]: progress } })),
});
