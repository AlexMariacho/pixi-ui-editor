import { commitCandidate, getEditingTarget } from "./helpers.js";
import type { EditorSlice } from "./types.js";
type Keys = "updateSpineNodeAnimation" | "updateSpineNodeLoop" | "requestSpineFrame" | "setSpineAutoplay" | "reportSpinePlaybackFrame";
export const createSpineSlice: EditorSlice<Keys> = (set) => ({
  updateSpineNodeAnimation: (nodeId, animation) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (node?.type !== "spine") {
      console.warn(`Cannot update Spine animation for node '${nodeId}': it is not a Spine node.`);
      return state;
    }
    if (animation === undefined) delete node.animation;
    else node.animation = animation;
    return commitCandidate(state, candidate, "Spine animation update was rejected because it makes the project document invalid.");
  }),
  updateSpineNodeLoop: (nodeId, loop) => set((state) => {
    const candidate = structuredClone(state.document);
    const node = getEditingTarget(candidate, state)?.nodes.find((candidateNode) => candidateNode.id === nodeId);
    if (node?.type !== "spine") {
      console.warn(`Cannot update Spine loop for node '${nodeId}': it is not a Spine node.`);
      return state;
    }
    node.loop = loop;
    return commitCandidate(state, candidate, "Spine loop update was rejected because it makes the project document invalid.");
  }),
  requestSpineFrame: (nodeId, frame) => set((state) => ({ spineFrameRequests: { ...state.spineFrameRequests, [nodeId]: frame } })),
  setSpineAutoplay: (nodeId, autoplay) => set((state) => ({ spineAutoplay: { ...state.spineAutoplay, [nodeId]: autoplay } })),
  reportSpinePlaybackFrame: (nodeId, playback) => set((state) => {
    const current = state.spinePlaybackFrames[nodeId];
    return current?.current === playback.current && current.total === playback.total
      ? state
      : { spinePlaybackFrames: { ...state.spinePlaybackFrames, [nodeId]: playback } };
  }),
});
