import type { GridLayoutSettings, LayoutGroupNode, LinearLayoutSettings } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";

export function LayoutGroupSection({ node }: { node: LayoutGroupNode }) {
  const update = useEditorStore((state) => state.updateLayoutGroup);
  const setBackground = useEditorStore((state) => state.setLayoutGroupBackgroundAsset);
  // Zustand selectors are useSyncExternalStore snapshots: never allocate (e.g. .filter) inside
  // the selector, otherwise React sees a changed snapshot on every render and loops forever.
  const assets = useEditorStore((state) => state.document.assets);
  const imageOptions = listImageAssetOptions(assets);
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const settings = { ...node.layoutGroup.base, ...node.layoutGroup.overrides?.[activeProfile] } as LinearLayoutSettings | GridLayoutSettings;
  const patch = (value: Partial<LinearLayoutSettings | GridLayoutSettings>) => update(node.id, value);
  const isGrid = node.type === "grid-layout";
  return <InspectorWindow title={isGrid ? "Grid Layout Group" : node.type === "horizontal-layout" ? "Horizontal Layout Group" : "Vertical Layout Group"}>
    <p className="inspector-hint">{activeProfile === "desktop" ? "Base settings" : "Mobile override"}</p>
    <InspectorField label="Background image"><select value={node.backgroundAssetId ?? ""} onChange={(event) => setBackground(node.id, event.target.value || undefined)}><option value="">None</option>{imageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></InspectorField>
    <NumberField label="Padding left" value={settings.padding.left} step={1} onChange={(left) => patch({ padding: { ...settings.padding, left } })} />
    <NumberField label="Padding right" value={settings.padding.right} step={1} onChange={(right) => patch({ padding: { ...settings.padding, right } })} />
    <NumberField label="Padding top" value={settings.padding.top} step={1} onChange={(top) => patch({ padding: { ...settings.padding, top } })} />
    <NumberField label="Padding bottom" value={settings.padding.bottom} step={1} onChange={(bottom) => patch({ padding: { ...settings.padding, bottom } })} />
    {isGrid ? <GridFields settings={settings as GridLayoutSettings} patch={patch} /> : <LinearFields settings={settings as LinearLayoutSettings} patch={patch} />}
  </InspectorWindow>;
}

function LinearFields({ settings, patch }: { settings: LinearLayoutSettings; patch: (value: Partial<LinearLayoutSettings>) => void }) {
  return <>
    <NumberField label="Spacing" value={settings.spacing} step={1} onChange={(spacing) => patch({ spacing })} />
    <InspectorField label="Alignment"><select value={settings.childAlignment} onChange={(event) => patch({ childAlignment: event.target.value as LinearLayoutSettings["childAlignment"] })}>{ALIGNMENTS}</select></InspectorField>
    <InspectorField label="Reverse order"><input type="checkbox" checked={settings.reverseOrder} onChange={(event) => patch({ reverseOrder: event.target.checked })} /></InspectorField>
    <InspectorField label="Control child width"><input type="checkbox" checked={settings.controlChildWidth} onChange={(event) => patch({ controlChildWidth: event.target.checked })} /></InspectorField>
    <InspectorField label="Control child height"><input type="checkbox" checked={settings.controlChildHeight} onChange={(event) => patch({ controlChildHeight: event.target.checked })} /></InspectorField>
    <InspectorField label="Force expand width"><input type="checkbox" checked={settings.forceExpandWidth} onChange={(event) => patch({ forceExpandWidth: event.target.checked })} /></InspectorField>
    <InspectorField label="Force expand height"><input type="checkbox" checked={settings.forceExpandHeight} onChange={(event) => patch({ forceExpandHeight: event.target.checked })} /></InspectorField>
  </>;
}

function GridFields({ settings, patch }: { settings: GridLayoutSettings; patch: (value: Partial<GridLayoutSettings>) => void }) {
  return <>
    <NumberField label="Cell width" value={settings.cellWidth} step={1} onChange={(cellWidth) => patch({ cellWidth })} />
    <NumberField label="Cell height" value={settings.cellHeight} step={1} onChange={(cellHeight) => patch({ cellHeight })} />
    <NumberField label="Spacing X" value={settings.spacingX} step={1} onChange={(spacingX) => patch({ spacingX })} />
    <NumberField label="Spacing Y" value={settings.spacingY} step={1} onChange={(spacingY) => patch({ spacingY })} />
    <InspectorField label="Start corner"><select value={settings.startCorner} onChange={(event) => patch({ startCorner: event.target.value as GridLayoutSettings["startCorner"] })}><option value="upper-left">Upper left</option><option value="upper-right">Upper right</option><option value="lower-left">Lower left</option><option value="lower-right">Lower right</option></select></InspectorField>
    <InspectorField label="Start axis"><select value={settings.startAxis} onChange={(event) => patch({ startAxis: event.target.value as GridLayoutSettings["startAxis"] })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></InspectorField>
    <InspectorField label="Constraint"><select value={settings.constraint} onChange={(event) => patch({ constraint: event.target.value as GridLayoutSettings["constraint"] })}><option value="flexible">Flexible</option><option value="fixed-column-count">Fixed columns</option><option value="fixed-row-count">Fixed rows</option></select></InspectorField>
    {settings.constraint !== "flexible" && <NumberField label="Constraint count" value={settings.constraintCount ?? 1} step={1} onChange={(constraintCount) => patch({ constraintCount })} />}
  </>;
}

const ALIGNMENTS = <>{["upper-left", "upper-center", "upper-right", "middle-left", "middle-center", "middle-right", "lower-left", "lower-center", "lower-right"].map((value) => <option key={value} value={value}>{value}</option>)}</>;
