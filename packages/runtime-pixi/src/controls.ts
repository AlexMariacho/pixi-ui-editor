import { type SkeletonData, Spine } from "@esotericsoftware/spine-pixi-v8";
import { type ButtonStateKey } from "@pixi-ui-editor/schema";
import { Container } from "pixi.js";
import { ButtonNodeView } from "./views/ButtonNodeView.js";
import { NodeView } from "./views/NodeView.js";
import { ProgressBarNodeView, SliderNodeView } from "./views/ValueControlNodeViews.js";

function findSpineChild(view: Container): Spine | undefined {
  if (view instanceof NodeView) return view.getSpine();
  return view instanceof Spine ? view : view.children.find((child): child is Spine => child instanceof Spine);
}

/** Reads the current 1-based animation frame for an editor Spine node. */
export function getSpineViewPlayback(view: Container, skeletonData: SkeletonData, animation: string): { current: number; total: number } | undefined {
  const spine = findSpineChild(view);
  const track = spine?.state.tracks[0];
  const duration = skeletonData.findAnimation(animation)?.duration;
  if (track === null || track === undefined || duration === undefined || duration <= 0) return undefined;
  const fps = skeletonData.fps && skeletonData.fps > 0 ? skeletonData.fps : 60;
  const total = Math.max(1, Math.round(duration * fps));
  const time = track.loop ? track.trackTime % duration : Math.min(track.trackTime, duration);
  return { current: Math.min(total, Math.floor(time * fps) + 1), total };
}

/** Seeks an editor Spine node to a 1-based animation frame without changing its serialized animation settings. */
export function setSpineViewFrame(view: Container, frame: number, skeletonData: SkeletonData, animation: string): void {
  const spine = findSpineChild(view);
  const track = spine?.state.tracks[0];
  const duration = skeletonData.findAnimation(animation)?.duration;
  if (track === null || track === undefined || duration === undefined || duration <= 0) return;
  const fps = skeletonData.fps && skeletonData.fps > 0 ? skeletonData.fps : 60;
  const total = Math.max(1, Math.round(duration * fps));
  track.trackTime = Math.min(total, Math.max(1, Math.round(frame)) - 1) / fps;
  spine?.update(0);
}

/** Forces an editor-only button state; the node's serialized `enabled` and states stay untouched. */
export function setButtonViewState(view: Container, state: ButtonStateKey): void {
  if (view instanceof ButtonNodeView) view.setState(state);
}

/** Applies an editor-only slider preview value without touching the document. */
export function setSliderViewValue(view: Container, value: number): void {
  if (view instanceof SliderNodeView) view.value = value;
}

/** Applies an editor-only progress preview without touching the document. */
export function setProgressBarViewProgress(view: Container, progress: number): void {
  if (view instanceof ProgressBarNodeView) view.progress = progress;
}

/** Enables or pauses editor-only automatic playback without affecting serialized node data. */
export function setSpineViewAutoplay(view: Container, autoplay: boolean): void {
  const spine = findSpineChild(view);
  if (spine !== undefined) spine.autoUpdate = autoplay;
}
