import { useMemo } from "react";
import type { TextStyleDefinition } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField } from "../fields.js";

export const DEFAULT_TEXT_STYLE: TextStyleDefinition = { fontFamily: "Arial", fontSize: 24, fontWeight: "normal", fontStyle: "normal", fill: "#FFFFFF", align: "left", verticalAlign: "top", wordWrap: false, breakWords: false, letterSpacing: 0 };

/**
 * Font/style rows shared by every node type that carries a `TextStyleDefinition` (text, input, ...),
 * so a new consumer never grows its own parallel copy of the font-picker UI.
 */
export function TextStyleFields({ style, onChange }: { style: TextStyleDefinition; onChange: (patch: Partial<TextStyleDefinition>) => void }) {
  const assets = useEditorStore((state) => state.document.assets);
  const fonts = useMemo(() => assets.filter((asset) => asset.type === "font"), [assets]);

  return <>
    <InspectorField label="Font"><select value={style.fontAssetId ?? ""} onChange={(event) => onChange({ fontAssetId: event.target.value || undefined })}><option value="">System font (Arial)</option>{fonts.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}</select></InspectorField>
    <InspectorField label="Size"><input type="number" min="1" value={style.fontSize} onChange={(event) => onChange({ fontSize: Math.max(1, Number(event.target.value) || 1) })} /></InspectorField>
    <InspectorField label="Weight"><select value={style.fontWeight} onChange={(event) => onChange({ fontWeight: event.target.value as typeof style.fontWeight })}><option value="normal">normal</option><option value="bold">bold</option></select></InspectorField>
    <InspectorField label="Style"><select value={style.fontStyle} onChange={(event) => onChange({ fontStyle: event.target.value as typeof style.fontStyle })}><option value="normal">normal</option><option value="italic">italic</option></select></InspectorField>
    <InspectorField label="Color"><input type="color" value={style.fill.slice(0, 7)} onChange={(event) => onChange({ fill: event.target.value })} /></InspectorField>
    <InspectorField label="Align"><select value={style.align} onChange={(event) => onChange({ align: event.target.value as typeof style.align })}>{["left", "center", "right", "justify"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
    <InspectorField label="Vertical"><select value={style.verticalAlign} onChange={(event) => onChange({ verticalAlign: event.target.value as typeof style.verticalAlign })}>{["top", "middle", "bottom"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
    <InspectorField label="Wrap"><input type="checkbox" checked={style.wordWrap} onChange={(event) => onChange({ wordWrap: event.target.checked })} /></InspectorField>
    <InspectorField label="Break words"><input type="checkbox" checked={style.breakWords} onChange={(event) => onChange({ breakWords: event.target.checked })} /></InspectorField>
    <InspectorField label="Line height"><input type="number" min="1" placeholder="Auto" value={style.lineHeight ?? ""} onChange={(event) => onChange({ lineHeight: event.target.value === "" ? undefined : Math.max(1, Number(event.target.value) || 1) })} /></InspectorField>
    <InspectorField label="Letter spacing"><input type="number" value={style.letterSpacing} onChange={(event) => onChange({ letterSpacing: Number(event.target.value) || 0 })} /></InspectorField>
    <InspectorField label="Stroke"><input type="checkbox" checked={style.stroke !== undefined} onChange={(event) => onChange({ stroke: event.target.checked ? { color: "#000000", width: 1 } : undefined })} /></InspectorField>
    {style.stroke !== undefined && <><InspectorField label="Stroke color"><input type="color" value={style.stroke.color.slice(0, 7)} onChange={(event) => onChange({ stroke: { ...style.stroke!, color: event.target.value } })} /></InspectorField><InspectorField label="Stroke width"><input type="number" min="0" value={style.stroke.width} onChange={(event) => onChange({ stroke: { ...style.stroke!, width: Math.max(0, Number(event.target.value) || 0) } })} /></InspectorField></>}
  </>;
}
