import { useMemo } from "react";
import type { UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

type TextNode = Extract<UINode, { type: "text" }>;

export function TextSection({ node }: { node: TextNode }) {
  const updateNode = useEditorStore((state) => state.updateNode);
  const assets = useEditorStore((state) => state.document.assets);
  const fonts = useMemo(() => assets.filter((asset) => asset.type === "font"), [assets]);
  const style = node.style ?? { fontFamily: "Arial", fontSize: 24, fontWeight: "normal" as const, fontStyle: "normal" as const, fill: "#FFFFFF", align: "left" as const, verticalAlign: "top" as const, wordWrap: false, breakWords: false, letterSpacing: 0 };
  const setStyle = (patch: Partial<typeof style>) => updateNode(node.id, { style: { ...style, ...patch } });

  return <InspectorWindow title="Text">
    <InspectorField label="Text"><textarea rows={4} value={node.text} onChange={(event) => updateNode(node.id, { text: event.target.value })} /></InspectorField>
    <InspectorField label="Font"><select value={style.fontAssetId ?? ""} onChange={(event) => setStyle({ fontAssetId: event.target.value || undefined })}><option value="">System font (Arial)</option>{fonts.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}</select></InspectorField>
    <InspectorField label="Size"><input type="number" min="1" value={style.fontSize} onChange={(event) => setStyle({ fontSize: Math.max(1, Number(event.target.value) || 1) })} /></InspectorField>
    <InspectorField label="Weight"><select value={style.fontWeight} onChange={(event) => setStyle({ fontWeight: event.target.value as typeof style.fontWeight })}><option value="normal">normal</option><option value="bold">bold</option></select></InspectorField>
    <InspectorField label="Style"><select value={style.fontStyle} onChange={(event) => setStyle({ fontStyle: event.target.value as typeof style.fontStyle })}><option value="normal">normal</option><option value="italic">italic</option></select></InspectorField>
    <InspectorField label="Color"><input type="color" value={style.fill.slice(0, 7)} onChange={(event) => setStyle({ fill: event.target.value })} /></InspectorField>
    <InspectorField label="Align"><select value={style.align} onChange={(event) => setStyle({ align: event.target.value as typeof style.align })}>{["left", "center", "right", "justify"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
    <InspectorField label="Vertical"><select value={style.verticalAlign} onChange={(event) => setStyle({ verticalAlign: event.target.value as typeof style.verticalAlign })}>{["top", "middle", "bottom"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
    <InspectorField label="Wrap"><input type="checkbox" checked={style.wordWrap} onChange={(event) => setStyle({ wordWrap: event.target.checked })} /></InspectorField>
    <InspectorField label="Break words"><input type="checkbox" checked={style.breakWords} onChange={(event) => setStyle({ breakWords: event.target.checked })} /></InspectorField>
    <InspectorField label="Line height"><input type="number" min="1" placeholder="Auto" value={style.lineHeight ?? ""} onChange={(event) => setStyle({ lineHeight: event.target.value === "" ? undefined : Math.max(1, Number(event.target.value) || 1) })} /></InspectorField>
    <InspectorField label="Letter spacing"><input type="number" value={style.letterSpacing} onChange={(event) => setStyle({ letterSpacing: Number(event.target.value) || 0 })} /></InspectorField>
    <InspectorField label="Stroke"><input type="checkbox" checked={style.stroke !== undefined} onChange={(event) => setStyle({ stroke: event.target.checked ? { color: "#000000", width: 1 } : undefined })} /></InspectorField>
    {style.stroke !== undefined && <><InspectorField label="Stroke color"><input type="color" value={style.stroke.color.slice(0, 7)} onChange={(event) => setStyle({ stroke: { ...style.stroke!, color: event.target.value } })} /></InspectorField><InspectorField label="Stroke width"><input type="number" min="0" value={style.stroke.width} onChange={(event) => setStyle({ stroke: { ...style.stroke!, width: Math.max(0, Number(event.target.value) || 0) } })} /></InspectorField></>}
  </InspectorWindow>;
}
