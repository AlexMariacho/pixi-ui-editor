import { commitCandidate, getEditingTarget } from "./helpers.js";
import type { EditorSlice } from "./types.js";
type Keys = "setButtonStateAsset" | "setButtonEnabled" | "previewButtonState";
export const createButtonSlice: EditorSlice<Keys> = (set) => ({
  setButtonStateAsset: (nodeId, buttonState, assetId) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (node?.type !== "button") {
      console.warn(`Cannot set the '${buttonState}' asset for node '${nodeId}': it is not a button node.`);
      return state;
    }
    const field = `${buttonState}AssetId` as const;
    // Only normal is required; clearing an optional state falls back to the normal image at runtime.
    if (assetId === undefined && field !== "normalAssetId") delete node.states[field];
    else if (assetId !== undefined) node.states[field] = assetId;
    return commitCandidate(state, candidate, "The button state asset selection was rejected because it makes the project document invalid.");
  }),
  setButtonEnabled: (nodeId, enabled) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (node?.type !== "button") {
      console.warn(`Cannot set enabled for node '${nodeId}': it is not a button node.`);
      return state;
    }
    node.enabled = enabled;
    return commitCandidate(state, candidate, "The button enabled update was rejected because it makes the project document invalid.");
  }),
  previewButtonState: (nodeId, buttonState) => set((state) => ({ buttonPreviewStates: { ...state.buttonPreviewStates, [nodeId]: buttonState } })),
});
