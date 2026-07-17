import { createStableId } from "@pixi-ui-editor/schema";
import { commitCandidate, getEditingTarget } from "./helpers.js";
import type { EditorSlice } from "./types.js";
type Keys = "addImageAsset" | "addSpineAsset" | "setImageNodeAsset" | "replaceAssetSource" | "replaceSpineAssetFiles" | "deleteAsset";
export const createAssetsSlice: EditorSlice<Keys> = (set) => ({
  addImageAsset: (name, source) => set((state) => {
    const candidate = structuredClone(state.document);
    candidate.assets.push({ id: createStableId(), name, type: "image", source: { ...source } });

    return commitCandidate(state, candidate, "Image asset creation was rejected because it makes the project document invalid.");
  }),
  addSpineAsset: (name, files) => set((state) => {
    const candidate = structuredClone(state.document);
    candidate.assets.push({ id: createStableId(), name, type: "spine", files: structuredClone(files) });
    return commitCandidate(state, candidate, "Spine asset creation was rejected because it makes the project document invalid.");
  }),
  setImageNodeAsset: (nodeId, assetId) => set((state) => {
    const candidate = structuredClone(state.document);
    const target = getEditingTarget(candidate, state);
    const node = target?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot set image asset for node '${nodeId}': it does not exist in the editing target.`);
      return state;
    }
    if (node.type !== "image") {
      console.warn(`Cannot set image asset for node '${nodeId}': it is not an image node.`);
      return state;
    }

    node.assetId = assetId;
    return commitCandidate(state, candidate, "Image asset selection was rejected because it makes the project document invalid.");
  }),
  replaceAssetSource: (assetId, source) => set((state) => {
    const candidate = structuredClone(state.document);
    const asset = candidate.assets.find((candidateAsset) => candidateAsset.id === assetId);

    if (asset === undefined) {
      console.warn(`Cannot replace source for asset '${assetId}': it does not exist.`);
      return state;
    }

    if (asset.type !== "image") {
      console.warn(`Cannot replace image source for asset '${assetId}': it is not an image asset.`);
      return state;
    }
    asset.source = { ...source, version: new Date().toISOString() };
    return commitCandidate(state, candidate, "Asset source replacement was rejected because it makes the project document invalid.");
  }),
  replaceSpineAssetFiles: (assetId, files) => set((state) => {
    const candidate = structuredClone(state.document);
    const asset = candidate.assets.find((candidateAsset) => candidateAsset.id === assetId);
    if (asset?.type !== "spine") {
      console.warn(`Cannot replace Spine files for asset '${assetId}': it is not a Spine asset.`);
      return state;
    }
    asset.files = structuredClone(files);
    return commitCandidate(state, candidate, "Spine asset replacement was rejected because it makes the project document invalid.");
  }),
  deleteAsset: (assetId) => set((state) => {
    const candidate = structuredClone(state.document);
    candidate.assets = candidate.assets.filter((asset) => asset.id !== assetId);

    return commitCandidate(state, candidate, "Asset deletion was rejected because it makes the project document invalid.");
  }),
});
