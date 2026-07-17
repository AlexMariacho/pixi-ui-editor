import type { UINode } from "@pixi-ui-editor/schema";
import { ButtonSection } from "./sections/ButtonSection.js";
import { ImageSection } from "./sections/ImageSection.js";
import { NodeSection } from "./sections/NodeSection.js";
import { SpineSection } from "./sections/SpineSection.js";
import { TextSection } from "./sections/TextSection.js";
import { TransformSection } from "./sections/TransformSection.js";
import { LayoutGroupSection } from "./sections/LayoutGroupSection.js";

export function Inspector({ selectedNode, readOnly = false }: { selectedNode: UINode | undefined; readOnly?: boolean }) {
  if (selectedNode === undefined) return <p className="inspector-empty">Select a node</p>;

  return <fieldset className="inspector-content" disabled={readOnly}>
    {readOnly && <p className="inspector-empty">Preset content is read-only. Use Edit in Presets to change it.</p>}
    <NodeSection node={selectedNode} />
    {selectedNode.type === "image" && <ImageSection node={selectedNode} />}
    {selectedNode.type === "button" && <ButtonSection node={selectedNode} />}
    {selectedNode.type === "spine" && <SpineSection node={selectedNode} />}
    {(selectedNode.type === "horizontal-layout" || selectedNode.type === "vertical-layout" || selectedNode.type === "grid-layout") && <LayoutGroupSection node={selectedNode} />}
    <TransformSection node={selectedNode} readOnly={readOnly} />
    {selectedNode.type === "text" && <TextSection node={selectedNode} />}
  </fieldset>;
}
