import type { UINode } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

type ImageNode = Extract<UINode, { type: "image" }>;

export function ImageSection({ node }: { node: ImageNode }) {
  const assets = useEditorStore((state) => state.document.assets);
  const setImageNodeAsset = useEditorStore((state) => state.setImageNodeAsset);
  const updateNode = useEditorStore((state) => state.updateNode);
  const imageOptions = listImageAssetOptions(assets);
  const opacity = node.opacity ?? 1;

  return <InspectorWindow title="Image">
    <InspectorField label="Asset">
      <select value={node.assetId} onChange={(event) => setImageNodeAsset(node.id, event.target.value)}>
        {imageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </InspectorField>
    <InspectorField label={`Opacity (${Math.round(opacity * 100)}%)`}>
      <input type="range" min={0} max={100} step={1} value={Math.round(opacity * 100)} onChange={(event) => updateNode(node.id, { opacity: Number(event.target.value) / 100 })} />
    </InspectorField>
  </InspectorWindow>;
}
