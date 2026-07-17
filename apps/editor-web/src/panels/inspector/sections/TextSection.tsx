import type { UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";
import { DEFAULT_TEXT_STYLE, TextStyleFields } from "./TextStyleFields.js";

type TextNode = Extract<UINode, { type: "text" }>;

export function TextSection({ node }: { node: TextNode }) {
  const updateNode = useEditorStore((state) => state.updateNode);
  const style = node.style ?? DEFAULT_TEXT_STYLE;
  const setStyle = (patch: Partial<typeof style>) => updateNode(node.id, { style: { ...style, ...patch } });

  return <InspectorWindow title="Text">
    <InspectorField label="Text"><textarea rows={4} value={node.text} onChange={(event) => updateNode(node.id, { text: event.target.value })} /></InspectorField>
    <TextStyleFields style={style} onChange={setStyle} />
  </InspectorWindow>;
}
