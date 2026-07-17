import type { UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

type ImageNode = Extract<UINode, { type: "image" }>;

export function ImageSection({ node }: { node: ImageNode }) {
  const assets = useEditorStore((state) => state.document.assets);
  const setImageNodeAsset = useEditorStore((state) => state.setImageNodeAsset);
  const imageAssets = assets.filter((asset) => asset.type === "image");

  return <InspectorWindow title="Image">
    <InspectorField label="Asset">
      <select value={node.assetId} onChange={(event) => setImageNodeAsset(node.id, event.target.value)}>
        {imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
      </select>
    </InspectorField>
  </InspectorWindow>;
}
