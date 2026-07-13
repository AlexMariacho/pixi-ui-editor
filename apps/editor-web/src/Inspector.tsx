import type { ChangeEvent, ReactNode } from "react";
import type { UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";

type InspectorWindowProps = {
  title: string;
  children: ReactNode;
};

type InspectorFieldProps = {
  label: string;
  children: ReactNode;
};

/** Shared inspector window frame for all property groups. */
function InspectorWindow({ title, children }: InspectorWindowProps) {
  return <section className="inspector-window"><h2>{title}</h2><div className="inspector-window-content">{children}</div></section>;
}

/** Shared label/control geometry for every editable and read-only inspector row. */
function InspectorField({ label, children }: InspectorFieldProps) {
  return <label className="inspector-field"><span>{label}</span>{children}</label>;
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  const applyValue = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (event.target.value === "" || !Number.isFinite(value)) return;
    onChange(value);
  };

  return <InspectorField label={label}><input type="number" value={value} step={step} onChange={applyValue} /></InspectorField>;
}

export function Inspector({ selectedNode }: { selectedNode: UINode | undefined }) {
  const updateNode = useEditorStore((state) => state.updateNode);

  if (selectedNode === undefined) return <p className="inspector-empty">Select a node</p>;

  const updateTransform = (property: keyof UINode["transform"], value: number) => {
    updateNode(selectedNode.id, { transform: { ...selectedNode.transform, [property]: value } });
  };

  return <div className="inspector-content">
    <InspectorWindow title="Node">
      <InspectorField label="Name"><input type="text" value={selectedNode.name} onChange={(event) => updateNode(selectedNode.id, { name: event.target.value })} /></InspectorField>
      <InspectorField label="Visible"><input type="checkbox" checked={selectedNode.visible} onChange={(event) => updateNode(selectedNode.id, { visible: event.target.checked })} /></InspectorField>
      <InspectorField label="Type"><output>{selectedNode.type}</output></InspectorField>
      <InspectorField label="ID"><output className="inspector-id">{selectedNode.id}</output></InspectorField>
    </InspectorWindow>
    <InspectorWindow title="Transform">
      <NumberField label="X" value={selectedNode.transform.x} step={1} onChange={(value) => updateTransform("x", value)} />
      <NumberField label="Y" value={selectedNode.transform.y} step={1} onChange={(value) => updateTransform("y", value)} />
      <NumberField label="Width" value={selectedNode.transform.width} step={1} onChange={(value) => updateTransform("width", value)} />
      <NumberField label="Height" value={selectedNode.transform.height} step={1} onChange={(value) => updateTransform("height", value)} />
      <NumberField label="Scale X" value={selectedNode.transform.scaleX} step={0.1} onChange={(value) => updateTransform("scaleX", value)} />
      <NumberField label="Scale Y" value={selectedNode.transform.scaleY} step={0.1} onChange={(value) => updateTransform("scaleY", value)} />
      <NumberField label="Rotation" value={selectedNode.transform.rotation} step={1} onChange={(value) => updateTransform("rotation", value)} />
    </InspectorWindow>
    {selectedNode.type === "text" && <InspectorWindow title="Text">
      <InspectorField label="Text"><input type="text" value={selectedNode.text} onChange={(event) => updateNode(selectedNode.id, { text: event.target.value })} /></InspectorField>
    </InspectorWindow>}
  </div>;
}
