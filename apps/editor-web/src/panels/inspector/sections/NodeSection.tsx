import type { UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NodeNameField } from "../fields.js";

export function NodeSection({ node }: { node: UINode }) {
  const updateNode = useEditorStore((state) => state.updateNode);

  return <InspectorWindow title="Node">
    <NodeNameField nodeId={node.id} value={node.name} onCommit={(nodeId, name) => updateNode(nodeId, { name })} />
    <InspectorField label="Visible"><input type="checkbox" checked={node.visible} onChange={(event) => updateNode(node.id, { visible: event.target.checked })} /></InspectorField>
    <InspectorField label="Type"><output>{node.type}</output></InspectorField>
    <InspectorField label="ID"><output className="inspector-id">{node.id}</output></InspectorField>
  </InspectorWindow>;
}
