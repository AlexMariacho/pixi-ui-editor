import type { UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

type TextNode = Extract<UINode, { type: "text" }>;

export function TextSection({ node }: { node: TextNode }) {
  const updateNode = useEditorStore((state) => state.updateNode);

  return <InspectorWindow title="Text">
    <InspectorField label="Text"><input type="text" value={node.text} onChange={(event) => updateNode(node.id, { text: event.target.value })} /></InspectorField>
  </InspectorWindow>;
}
