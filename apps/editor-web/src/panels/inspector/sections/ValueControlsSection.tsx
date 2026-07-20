import type { ProgressBarNode, SliderNode } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";
import { DEFAULT_TEXT_STYLE, TextStyleFields } from "./TextStyleFields.js";

function ImageAssetField({ label, value, onChange }: { label: string; value: string; onChange: (assetId: string) => void }) {
  const assets = useEditorStore((state) => state.document.assets);
  return <InspectorField label={label}><select value={value} onChange={(event) => onChange(event.target.value)}>{listImageAssetOptions(assets).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></InspectorField>;
}

function FillPaddingFields({ padding, onChange }: { padding: SliderNode["fillPadding"]; onChange: (padding: SliderNode["fillPadding"]) => void }) {
  return <>
    <NumberField label="Fill left" value={padding.left} step={1} onChange={(left) => onChange({ ...padding, left: Math.max(0, left) })} />
    <NumberField label="Fill right" value={padding.right} step={1} onChange={(right) => onChange({ ...padding, right: Math.max(0, right) })} />
    <NumberField label="Fill top" value={padding.top} step={1} onChange={(top) => onChange({ ...padding, top: Math.max(0, top) })} />
    <NumberField label="Fill bottom" value={padding.bottom} step={1} onChange={(bottom) => onChange({ ...padding, bottom: Math.max(0, bottom) })} />
  </>;
}

export function SliderSection({ node }: { node: SliderNode }) {
  const updateSlider = useEditorStore((state) => state.updateSlider);
  const previewSliderValue = useEditorStore((state) => state.previewSliderValue);
  const previewValue = useEditorStore((state) => state.sliderPreviewValues[node.id] ?? node.defaultValue);
  const valueTextStyle = node.valueTextStyle ?? DEFAULT_TEXT_STYLE;
  return <InspectorWindow title="Slider">
    <ImageAssetField label="Background" value={node.backgroundAssetId} onChange={(backgroundAssetId) => updateSlider(node.id, { backgroundAssetId })} />
    <ImageAssetField label="Fill" value={node.fillAssetId} onChange={(fillAssetId) => updateSlider(node.id, { fillAssetId })} />
    <ImageAssetField label="Handle" value={node.handleAssetId} onChange={(handleAssetId) => updateSlider(node.id, { handleAssetId })} />
    <NumberField label="Min" value={node.min} step={node.step} onChange={(min) => updateSlider(node.id, { min })} />
    <NumberField label="Max" value={node.max} step={node.step} onChange={(max) => updateSlider(node.id, { max })} />
    <NumberField label="Step" value={node.step} step={1} onChange={(step) => updateSlider(node.id, { step })} />
    <NumberField label="Default value" value={node.defaultValue} step={node.step} onChange={(defaultValue) => updateSlider(node.id, { defaultValue })} />
    <InspectorField label={`Preview (${previewValue})`}><input type="range" min={node.min} max={node.max} step={node.step} value={previewValue} onChange={(event) => previewSliderValue(node.id, Number(event.target.value))} /></InspectorField>
    <FillPaddingFields padding={node.fillPadding} onChange={(fillPadding) => updateSlider(node.id, { fillPadding })} />
    <InspectorField label="Show value"><input type="checkbox" checked={node.showValue ?? false} onChange={(event) => updateSlider(node.id, { showValue: event.target.checked, valueTextStyle })} /></InspectorField>
    {(node.showValue ?? false) && <TextStyleFields style={valueTextStyle} onChange={(patch) => updateSlider(node.id, { valueTextStyle: { ...valueTextStyle, ...patch } })} />}
  </InspectorWindow>;
}

export function ProgressBarSection({ node }: { node: ProgressBarNode }) {
  const updateProgressBar = useEditorStore((state) => state.updateProgressBar);
  const previewProgressBar = useEditorStore((state) => state.previewProgressBar);
  const preview = useEditorStore((state) => state.progressBarPreviewValues[node.id] ?? node.defaultProgress);
  return <InspectorWindow title="Progress Bar">
    <ImageAssetField label="Background" value={node.backgroundAssetId} onChange={(backgroundAssetId) => updateProgressBar(node.id, { backgroundAssetId })} />
    <ImageAssetField label="Fill" value={node.fillAssetId} onChange={(fillAssetId) => updateProgressBar(node.id, { fillAssetId })} />
    <NumberField label="Default progress" value={node.defaultProgress} step={1} onChange={(defaultProgress) => updateProgressBar(node.id, { defaultProgress })} />
    <InspectorField label={`Preview (${preview}%)`}><input type="range" min={0} max={100} step={1} value={preview} onChange={(event) => previewProgressBar(node.id, Number(event.target.value))} /></InspectorField>
    <FillPaddingFields padding={node.fillPadding} onChange={(fillPadding) => updateProgressBar(node.id, { fillPadding })} />
  </InspectorWindow>;
}
