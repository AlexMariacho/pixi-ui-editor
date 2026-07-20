import type { UINode } from "@pixi-ui-editor/schema";
import { ButtonSection } from "./sections/ButtonSection.js";
import { ImageSection } from "./sections/ImageSection.js";
import { InputSection } from "./sections/InputSection.js";
import { NodeSection } from "./sections/NodeSection.js";
import { ScrollViewSection } from "./sections/ScrollViewSection.js";
import { SpineSection } from "./sections/SpineSection.js";
import { TextSection } from "./sections/TextSection.js";
import { TransformSection } from "./sections/TransformSection.js";
import { LayoutGroupSection } from "./sections/LayoutGroupSection.js";
import { ProgressBarSection, SliderSection } from "./sections/ValueControlsSection.js";
import { WindowSection } from "./sections/WindowSection.js";
import { useEditorStore } from "../../store/index.js";

export function Inspector({ selectedNode, readOnly = false }: { selectedNode: UINode | undefined; readOnly?: boolean }) {
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);
  if (selectedNode === undefined) return editingPrefabId === null ? <WindowSection /> : <p className="inspector-empty">Select a node</p>;

  return <fieldset className="inspector-content" disabled={readOnly}>
    {readOnly && <p className="inspector-empty">Preset content is read-only. Use Edit in Presets to change it.</p>}
    <NodeSection node={selectedNode} />
    {selectedNode.type === "image" && <ImageSection node={selectedNode} />}
    {selectedNode.type === "button" && <ButtonSection node={selectedNode} />}
    {selectedNode.type === "spine" && <SpineSection node={selectedNode} />}
    {(selectedNode.type === "horizontal-layout" || selectedNode.type === "vertical-layout" || selectedNode.type === "grid-layout") && <LayoutGroupSection node={selectedNode} />}
    {selectedNode.type === "scroll-view" && <ScrollViewSection node={selectedNode} />}
    {selectedNode.type === "input" && <InputSection node={selectedNode} />}
    {selectedNode.type === "slider" && <SliderSection node={selectedNode} />}
    {selectedNode.type === "progress-bar" && <ProgressBarSection node={selectedNode} />}
    <TransformSection node={selectedNode} readOnly={readOnly} />
    {selectedNode.type === "text" && <TextSection node={selectedNode} />}
  </fieldset>;
}
