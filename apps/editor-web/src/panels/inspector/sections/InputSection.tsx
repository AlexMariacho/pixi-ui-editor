import { useMemo } from "react";
import type { InputNode } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";
import { TextStyleFields } from "./TextStyleFields.js";

export function InputSection({ node }: { node: InputNode }) {
  const updateInput = useEditorStore((state) => state.updateInput);
  const assets = useEditorStore((state) => state.document.assets);
  const imageOptions = useMemo(() => listImageAssetOptions(assets), [assets]);
  const padding = node.padding;

  return <InspectorWindow title="Input">
    <InspectorField label="Background">
      <select value={node.backgroundAssetId ?? ""} onChange={(event) => updateInput(node.id, { backgroundAssetId: event.target.value || undefined })}>
        <option value="">None (neutral placeholder)</option>
        {imageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </InspectorField>
    <InspectorField label="Placeholder"><input type="text" value={node.placeholder} onChange={(event) => updateInput(node.id, { placeholder: event.target.value })} /></InspectorField>
    <InspectorField label="Default value"><input type="text" value={node.defaultValue} onChange={(event) => updateInput(node.id, { defaultValue: event.target.value })} /></InspectorField>
    <InspectorField label="Max length"><input type="number" min="1" placeholder="Unlimited" value={node.maxLength ?? ""} onChange={(event) => updateInput(node.id, { maxLength: event.target.value === "" ? undefined : Math.max(1, Math.trunc(Number(event.target.value)) || 1) })} /></InspectorField>
    <InspectorField label="Secure"><input type="checkbox" checked={node.secure} onChange={(event) => updateInput(node.id, { secure: event.target.checked })} /></InspectorField>
    <InspectorField label="Align"><select value={node.align} onChange={(event) => updateInput(node.id, { align: event.target.value as InputNode["align"] })}>{["left", "center", "right"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
    <NumberField label="Padding left" value={padding.left} step={1} onChange={(left) => updateInput(node.id, { padding: { ...padding, left } })} />
    <NumberField label="Padding right" value={padding.right} step={1} onChange={(right) => updateInput(node.id, { padding: { ...padding, right } })} />
    <NumberField label="Padding top" value={padding.top} step={1} onChange={(top) => updateInput(node.id, { padding: { ...padding, top } })} />
    <NumberField label="Padding bottom" value={padding.bottom} step={1} onChange={(bottom) => updateInput(node.id, { padding: { ...padding, bottom } })} />
    <InspectorField label="Clean on focus"><input type="checkbox" checked={node.cleanOnFocus} onChange={(event) => updateInput(node.id, { cleanOnFocus: event.target.checked })} /></InspectorField>
    <InspectorField label="Clip text"><input type="checkbox" checked={node.clipText} onChange={(event) => updateInput(node.id, { clipText: event.target.checked })} /></InspectorField>
    <TextStyleFields style={node.textStyle} onChange={(patch) => updateInput(node.id, { textStyle: { ...node.textStyle, ...patch } })} />
  </InspectorWindow>;
}
