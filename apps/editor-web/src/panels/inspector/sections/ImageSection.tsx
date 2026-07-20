import type { UINode } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

type ImageNode = Extract<UINode, { type: "image" }>;

export function ImageSection({ node }: { node: ImageNode }) {
  const assets = useEditorStore((state) => state.document.assets);
  const setImageNodeAsset = useEditorStore((state) => state.setImageNodeAsset);
  const imageOptions = listImageAssetOptions(assets);

  return <InspectorWindow title="Image">
    <InspectorField label="Asset">
      <select value={node.assetId} onChange={(event) => setImageNodeAsset(node.id, event.target.value)}>
        {imageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </InspectorField>
  </InspectorWindow>;
}
