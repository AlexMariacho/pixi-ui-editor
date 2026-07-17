import { useEffect, useState } from "react";
import type { UINode } from "@pixi-ui-editor/schema";
import type { SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import { loadEditorSceneSpines } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";

type SpineNode = Extract<UINode, { type: "spine" }>;

export function SpineSection({ node }: { node: SpineNode }) {
  const updateSpineNodeAnimation = useEditorStore((state) => state.updateSpineNodeAnimation);
  const updateSpineNodeLoop = useEditorStore((state) => state.updateSpineNodeLoop);
  const requestSpineFrame = useEditorStore((state) => state.requestSpineFrame);
  const setSpineAutoplay = useEditorStore((state) => state.setSpineAutoplay);
  const spineAutoplay = useEditorStore((state) => state.spineAutoplay[node.id] ?? true);
  const spinePlayback = useEditorStore((state) => state.spinePlaybackFrames[node.id]);
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const [spineData, setSpineData] = useState<SkeletonData | undefined>();

  useEffect(() => {
    let cancelled = false;
    void loadEditorSceneSpines(document, sceneId).then((spines) => {
      if (!cancelled) setSpineData(spines.get(node.assetId));
    });
    return () => { cancelled = true; };
  }, [document, sceneId, node]);

  const animation = node.animation
    ? spineData?.findAnimation(node.animation)
    : undefined;
  const fps = spineData?.fps && spineData.fps > 0 ? spineData.fps : 60;
  const total = spinePlayback?.total ?? Math.max(1, Math.round((animation?.duration ?? 0) * fps));
  const current = Math.min(total, spinePlayback?.current ?? 1);
  const setFrame = (frame: number) => requestSpineFrame(node.id, Math.min(total, Math.max(1, Math.round(frame))));

  return <InspectorWindow title="Spine">
    <InspectorField label="Animation">
      <select value={node.animation ?? ""} disabled={spineData === undefined} onChange={(event) => updateSpineNodeAnimation(node.id, event.target.value || undefined)}>
        <option value="">(none)</option>
        {spineData?.animations.map((candidate) => <option key={candidate.name} value={candidate.name}>{candidate.name}</option>)}
      </select>
    </InspectorField>
    <InspectorField label="Loop"><input type="checkbox" checked={node.loop ?? true} disabled={node.animation === undefined} onChange={(event) => updateSpineNodeLoop(node.id, event.target.checked)} /></InspectorField>
    <InspectorField label="Autoplay"><input type="checkbox" checked={spineAutoplay} disabled={node.animation === undefined} onChange={(event) => setSpineAutoplay(node.id, event.target.checked)} /></InspectorField>
    <NumberField label="Frame" value={current} step={1} onChange={setFrame} />
    <InspectorField label="Frames"><output>{current} / {total}</output><span><button type="button" disabled={node.animation === undefined || current <= 1} onClick={() => setFrame(current - 1)}>−</button><button type="button" disabled={node.animation === undefined || current >= total} onClick={() => setFrame(current + 1)}>+</button></span></InspectorField>
  </InspectorWindow>;
}
