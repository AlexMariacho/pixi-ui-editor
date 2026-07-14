import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { UINode } from "@pixi-ui-editor/schema";
import { resolveProfileTransform, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import { useEditorStore } from "./store.js";
import { loadEditorSceneSpines } from "./assets.js";

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

/**
 * Keeps a free-typed text buffer for a number input. A plain `value={n}` controlled input snaps
 * back to the last committed number on every keystroke that isn't itself a finite number, which
 * makes it impossible to type a leading "-" or a stray "." — the character appears then vanishes.
 * The buffer only resyncs from `value` when it changes from the outside (e.g. selecting another node).
 */
function useNumberText(value: number, format: (value: number) => string = (n) => String(n)) {
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : format(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [text, setText] as const;
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  const [text, setText] = useNumberText(value);

  const applyValue = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChange(parsed);
  };

  return <InspectorField label={label}><input type="number" value={text} step={step} onChange={applyValue} /></InspectorField>;
}

const formatDegrees = (value: number) => String(Math.round(value * 100) / 100);

/** Rotation is stored in radians (PixiJS uses radians natively) but edited in degrees, unrestricted like Pixi itself: negative and >360 values are valid and are not wrapped. */
function RotationField({ radians, onChangeRadians }: { radians: number; onChangeRadians: (radians: number) => void }) {
  const degreesValue = (radians * 180) / Math.PI;
  const [text, setText] = useNumberText(degreesValue, formatDegrees);

  const applyDegrees = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChangeRadians((parsed * Math.PI) / 180);
  };

  return <InspectorField label="Rotation"><input type="number" value={text} step={1} onChange={applyDegrees} /></InspectorField>;
}

const ANCHOR_PRESETS: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
];

const samePivot = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** 3x3 anchor grid for the common pivot positions (corners, edges, center) used to rotate/scale around a point other than the top-left corner. */
function AnchorGrid({ pivotX, pivotY, onSelect }: { pivotX: number; pivotY: number; onSelect: (x: number, y: number) => void }) {
  return <div className="anchor-grid" role="group" aria-label="Pivot anchor">
    {ANCHOR_PRESETS.map((preset) => {
      const active = samePivot(preset.x, pivotX) && samePivot(preset.y, pivotY);
      return <button
        key={`${preset.x}-${preset.y}`}
        type="button"
        className={active ? "anchor-grid-cell anchor-grid-cell-active" : "anchor-grid-cell"}
        onClick={() => onSelect(preset.x, preset.y)}
        aria-label={`Anchor ${preset.x * 100}% x ${preset.y * 100}%`}
        aria-pressed={active}
      >
        <span className="anchor-grid-dot" />
      </button>;
    })}
  </div>;
}

const toPercent = (fraction: number) => Math.round(fraction * 1000) / 10;
const clampFraction = (value: number) => Math.min(1, Math.max(0, value));

/** Pivot as a normalized 0-1 fraction of width/height; 0,0 is the top-left corner (Pixi's default), 0.5,0.5 is the center. */
function PivotField({ pivotX, pivotY, onChange }: { pivotX: number; pivotY: number; onChange: (pivotX: number, pivotY: number) => void }) {
  return <>
    <InspectorField label="Pivot"><AnchorGrid pivotX={pivotX} pivotY={pivotY} onSelect={onChange} /></InspectorField>
    <NumberField label="Pivot X %" value={toPercent(pivotX)} step={1} onChange={(value) => onChange(clampFraction(value / 100), pivotY)} />
    <NumberField label="Pivot Y %" value={toPercent(pivotY)} step={1} onChange={(value) => onChange(pivotX, clampFraction(value / 100))} />
  </>;
}

export function Inspector({ selectedNode }: { selectedNode: UINode | undefined }) {
  const updateNode = useEditorStore((state) => state.updateNode);
  const assets = useEditorStore((state) => state.document.assets);
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const updateNodeProfileTransform = useEditorStore((state) => state.updateNodeProfileTransform);
  const setNodeOrientationVisibility = useEditorStore((state) => state.setNodeOrientationVisibility);
  const setImageNodeAsset = useEditorStore((state) => state.setImageNodeAsset);
  const updateSpineNodeAnimation = useEditorStore((state) => state.updateSpineNodeAnimation);
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const [spineData, setSpineData] = useState<SkeletonData | undefined>();

  useEffect(() => {
    let cancelled = false;
    if (selectedNode?.type !== "spine") {
      setSpineData(undefined);
      return () => { cancelled = true; };
    }
    void loadEditorSceneSpines(document, sceneId).then((spines) => {
      if (!cancelled) setSpineData(spines.get(selectedNode.assetId));
    });
    return () => { cancelled = true; };
  }, [document, sceneId, selectedNode]);

  if (selectedNode === undefined) return <p className="inspector-empty">Select a node</p>;

  const imageAssets = assets.filter((asset) => asset.type === "image");
  const resolvedTransform = resolveProfileTransform(selectedNode, activeProfile).transform;
  const updateTransform = (patch: Partial<UINode["transform"]>) => {
    updateNodeProfileTransform(selectedNode.id, patch);
  };

  const pivotX = resolvedTransform.pivotX ?? 0;
  const pivotY = resolvedTransform.pivotY ?? 0;

  return <div className="inspector-content">
    <InspectorWindow title="Node">
      <InspectorField label="Name"><input type="text" value={selectedNode.name} onChange={(event) => updateNode(selectedNode.id, { name: event.target.value })} /></InspectorField>
      <InspectorField label="Visible"><input type="checkbox" checked={selectedNode.visible} onChange={(event) => updateNode(selectedNode.id, { visible: event.target.checked })} /></InspectorField>
      <InspectorField label="Type"><output>{selectedNode.type}</output></InspectorField>
      <InspectorField label="ID"><output className="inspector-id">{selectedNode.id}</output></InspectorField>
    </InspectorWindow>
    {selectedNode.type === "image" && <InspectorWindow title="Image">
      <InspectorField label="Asset">
        <select value={selectedNode.assetId} onChange={(event) => setImageNodeAsset(selectedNode.id, event.target.value)}>
          {imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </InspectorField>
    </InspectorWindow>}
    {selectedNode.type === "spine" && <InspectorWindow title="Spine">
      <InspectorField label="Animation">
        <select value={selectedNode.animation ?? ""} disabled={spineData === undefined} onChange={(event) => updateSpineNodeAnimation(selectedNode.id, event.target.value || undefined)}>
          <option value="">(none)</option>
          {spineData?.animations.map((animation) => <option key={animation.name} value={animation.name}>{animation.name}</option>)}
        </select>
      </InspectorField>
    </InspectorWindow>}
    <InspectorWindow title="Layout Visibility">
      <InspectorField label="Horizontal"><input type="checkbox" checked={selectedNode.layoutOverrides?.desktop?.visible !== false} onChange={(event) => setNodeOrientationVisibility(selectedNode.id, "desktop", event.target.checked)} /></InspectorField>
      <InspectorField label="Vertical"><input type="checkbox" checked={selectedNode.layoutOverrides?.mobile?.visible !== false} onChange={(event) => setNodeOrientationVisibility(selectedNode.id, "mobile", event.target.checked)} /></InspectorField>
    </InspectorWindow>
    <InspectorWindow title="Transform">
      <NumberField label="X" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value })} />
      <NumberField label="Y" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value })} />
      <NumberField label="Width" value={resolvedTransform.width} step={1} onChange={(value) => updateTransform({ width: value })} />
      <NumberField label="Height" value={resolvedTransform.height} step={1} onChange={(value) => updateTransform({ height: value })} />
      <NumberField label="Scale X" value={resolvedTransform.scaleX} step={0.1} onChange={(value) => updateTransform({ scaleX: value })} />
      <NumberField label="Scale Y" value={resolvedTransform.scaleY} step={0.1} onChange={(value) => updateTransform({ scaleY: value })} />
      <RotationField radians={resolvedTransform.rotation} onChangeRadians={(value) => updateTransform({ rotation: value })} />
      <PivotField pivotX={pivotX} pivotY={pivotY} onChange={(x, y) => updateTransform({ pivotX: x, pivotY: y })} />
    </InspectorWindow>
    {selectedNode.type === "text" && <InspectorWindow title="Text">
      <InspectorField label="Text"><input type="text" value={selectedNode.text} onChange={(event) => updateNode(selectedNode.id, { text: event.target.value })} /></InspectorField>
    </InspectorWindow>}
  </div>;
}
