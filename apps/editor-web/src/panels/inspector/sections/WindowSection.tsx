import { listSoundAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

export function WindowSection() {
  const sceneId = useEditorStore((state) => state.sceneId);
  const scene = useEditorStore((state) => state.document.scenes.find((candidate) => candidate.id === state.sceneId));
  const assets = useEditorStore((state) => state.document.assets);
  const setSceneAudio = useEditorStore((state) => state.setSceneAudio);
  if (scene === undefined) return <p className="inspector-empty">Window not found</p>;

  const musicAssetId = scene.audio?.backgroundMusicAssetId;
  const volume = scene.audio?.volume ?? 1;
  return <fieldset className="inspector-content">
    <InspectorWindow title={scene.name}>
      <InspectorField label="Background music"><select value={musicAssetId ?? ""} onChange={(event) => {
        const nextAssetId = event.target.value || undefined;
        setSceneAudio(sceneId, nextAssetId === undefined ? undefined : { backgroundMusicAssetId: nextAssetId, volume });
      }}><option value="">None</option>{listSoundAssetOptions(assets).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></InspectorField>
      {musicAssetId !== undefined && <InspectorField label={`Volume (${Math.round(volume * 100)}%)`}><input type="range" min={0} max={100} step={1} value={Math.round(volume * 100)} onChange={(event) => setSceneAudio(sceneId, { backgroundMusicAssetId: musicAssetId, volume: Number(event.target.value) / 100 })} /></InspectorField>}
    </InspectorWindow>
  </fieldset>;
}
