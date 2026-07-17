import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BUTTON_STATE_KEYS, type ButtonStateKey, type UINode } from "@pixi-ui-editor/schema";
import { resolveProfileTransform, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import { getEditingTarget, useEditorStore, type AnchorRect } from "./store.js";
import { loadEditorSceneSpines } from "./assets.js";
import { getNodeWorldMatrix } from "./transformCoordinates.js";

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

function NodeNameField({ nodeId, value, onCommit }: { nodeId: string; value: string; onCommit: (nodeId: string, value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(value);
      return;
    }
    if (draft !== value) onCommit(nodeId, draft);
  };

  return <InspectorField label="Name"><input
    type="text"
    value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        setDraft(value);
        event.currentTarget.blur();
      }
    }}
  /></InspectorField>;
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

const PIVOT_PRESETS: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
];

// Unity-стиль: по каждой оси якорь — это min/max пара; четвёртый вариант (0..1) растягивает объект вдоль оси.
const ANCHOR_AXIS_PRESETS: { min: number; max: number }[] = [
  { min: 0, max: 0 }, { min: 0.5, max: 0.5 }, { min: 1, max: 1 }, { min: 0, max: 1 },
];
const ANCHOR_PRESETS: AnchorRect[] = ANCHOR_AXIS_PRESETS.flatMap((yAxis) =>
  ANCHOR_AXIS_PRESETS.map((xAxis) => ({ minX: xAxis.min, maxX: xAxis.max, minY: yAxis.min, maxY: yAxis.max })));

const isStretched = (min: number, max: number) => max - min > 0.0001;
const sameAnchor = (left: AnchorRect, right: AnchorRect) =>
  samePivot(left.minX, right.minX) && samePivot(left.maxX, right.maxX) && samePivot(left.minY, right.minY) && samePivot(left.maxY, right.maxY);

const samePivot = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** 3x3 grid for the common pivot positions used to rotate/scale around a point other than the top-left corner. */
function PivotGrid({ pivotX, pivotY, onSelect }: { pivotX: number; pivotY: number; onSelect: (x: number, y: number) => void }) {
  return <div className="anchor-grid" role="group" aria-label="Pivot anchor">
    {PIVOT_PRESETS.map((preset) => {
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
    <InspectorField label="Pivot"><PivotGrid pivotX={pivotX} pivotY={pivotY} onSelect={onChange} /></InspectorField>
    <NumberField label="Pivot X %" value={toPercent(pivotX)} step={1} onChange={(value) => onChange(clampFraction(value / 100), pivotY)} />
    <NumberField label="Pivot Y %" value={toPercent(pivotY)} step={1} onChange={(value) => onChange(pivotX, clampFraction(value / 100))} />
  </>;
}

function AnchorPresetIcon({ anchor, pivotPreview = false }: { anchor: AnchorRect; pivotPreview?: boolean }) {
  const stretchX = isStretched(anchor.minX, anchor.maxX);
  const stretchY = isStretched(anchor.minY, anchor.maxY);
  return <span className="anchor-preset-icon">
    <span className="anchor-preset-guide anchor-preset-guide-x" style={{ left: `${anchor.minX * 100}%` }} />
    {stretchX && <span className="anchor-preset-guide anchor-preset-guide-x" style={{ left: `${anchor.maxX * 100}%` }} />}
    <span className="anchor-preset-guide anchor-preset-guide-y" style={{ top: `${anchor.minY * 100}%` }} />
    {stretchY && <span className="anchor-preset-guide anchor-preset-guide-y" style={{ top: `${anchor.maxY * 100}%` }} />}
    {!stretchX && !stretchY
      ? <span className="anchor-preset-marker-point" style={{ left: `${anchor.minX * 100}%`, top: `${anchor.minY * 100}%` }} />
      : <span className="anchor-preset-marker-stretch" style={{
          left: stretchX ? "3px" : `calc(${anchor.minX * 100}% - 1.5px)`,
          right: stretchX ? "3px" : undefined,
          width: stretchX ? undefined : "3px",
          top: stretchY ? "3px" : `calc(${anchor.minY * 100}% - 1.5px)`,
          bottom: stretchY ? "3px" : undefined,
          height: stretchY ? undefined : "3px",
        }} />}
    {/* Shift-превью: точка показывает pivot, который получит нода (0.5 на растянутой оси). */}
    {pivotPreview && <span className="anchor-preset-pivot-preview" style={{
      left: `${(stretchX ? 0.5 : anchor.minX) * 100}%`,
      top: `${(stretchY ? 0.5 : anchor.minY) * 100}%`,
    }} />}
  </span>;
}

/** Unity-like 4x4 anchor preset popup: the last row/column stretches the node along that axis. Shift couples the object's pivot; Ctrl+Shift also snaps it to the chosen parent point or anchor rectangle. */
function AnchorField({ anchor, onSelect }: {
  anchor: AnchorRect;
  onSelect: (anchor: AnchorRect, options: { setPivot: boolean; snap: boolean }) => void;
}) {
  const [modifiers, setModifiers] = useState({ shift: false, ctrl: false });
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = (event: KeyboardEvent) => setModifiers({ shift: event.shiftKey, ctrl: event.ctrlKey });
    const reset = () => setModifiers({ shift: false, ctrl: false });
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", reset);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const placePopover = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const width = 206;
      const height = popoverRef.current?.offsetHeight ?? 190;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
      const top = rect.top >= height + 8
        ? rect.top - height - 6
        : Math.min(window.innerHeight - height - 8, rect.bottom + 6);
      setPopoverPosition({ left, top: Math.max(8, top) });
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    placePopover();
    window.addEventListener("resize", placePopover);
    document.addEventListener("scroll", placePopover, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", placePopover);
      document.removeEventListener("scroll", placePopover, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  const popover = open ? <div ref={popoverRef} className="anchor-presets-popover" style={popoverPosition}>
      <div className="anchor-presets-grid" role="group" aria-label="Anchor presets">
        {ANCHOR_PRESETS.map((preset) => {
          const active = sameAnchor(preset, anchor);
          const label = (min: number, max: number) => (isStretched(min, max) ? "stretch" : `${min * 100}%`);
          return <button
            key={`${preset.minX}-${preset.maxX}-${preset.minY}-${preset.maxY}`}
            type="button"
            className={active ? "anchor-preset anchor-preset-active" : "anchor-preset"}
            aria-label={`Anchor ${label(preset.minX, preset.maxX)} x ${label(preset.minY, preset.maxY)}`}
            aria-pressed={active}
            onClick={(event) => onSelect(preset, { setPivot: event.shiftKey, snap: event.shiftKey && event.ctrlKey })}
          ><AnchorPresetIcon anchor={preset} pivotPreview={modifiers.shift} /></button>;
        })}
      </div>
      <p className={modifiers.shift && modifiers.ctrl ? "anchor-presets-hint anchor-presets-hint-active" : "anchor-presets-hint"}>
        {modifiers.shift && modifiers.ctrl ? "Shift + Ctrl: set pivot and snap" : modifiers.shift ? "Shift: set matching pivot" : "Click: preserve position"}
      </p>
    </div> : null;

  return <InspectorField label="Anchors"><span className="anchor-presets">
    <button ref={triggerRef} type="button" className={open ? "anchor-presets-trigger anchor-presets-trigger-open" : "anchor-presets-trigger"} aria-label="Open anchor presets" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <AnchorPresetIcon anchor={anchor} />
    </button>
    {popover !== null && createPortal(popover, document.body)}
  </span></InspectorField>;
}

/** Пользовательское «Clicked» — это удержание pointer down; в schema/runtime оно называется pressed. */
const BUTTON_STATE_LABELS: Record<ButtonStateKey, string> = {
  normal: "Normal",
  hover: "Hover",
  pressed: "Clicked (Pressed)",
  disabled: "Disabled",
};

export function Inspector({ selectedNode, readOnly = false }: { selectedNode: UINode | undefined; readOnly?: boolean }) {
  const updateNode = useEditorStore((state) => state.updateNode);
  const assets = useEditorStore((state) => state.document.assets);
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const updateNodeProfileTransform = useEditorStore((state) => state.updateNodeProfileTransform);
  const setNodeProfileAnchor = useEditorStore((state) => state.setNodeProfileAnchor);
  const setNodeOrientationVisibility = useEditorStore((state) => state.setNodeOrientationVisibility);
  const setImageNodeAsset = useEditorStore((state) => state.setImageNodeAsset);
  const setButtonStateAsset = useEditorStore((state) => state.setButtonStateAsset);
  const setButtonEnabled = useEditorStore((state) => state.setButtonEnabled);
  const previewButtonState = useEditorStore((state) => state.previewButtonState);
  const buttonPreviewState = useEditorStore((state) => selectedNode?.type === "button" ? state.buttonPreviewStates[selectedNode.id] ?? "normal" : "normal");
  const updateSpineNodeAnimation = useEditorStore((state) => state.updateSpineNodeAnimation);
  const updateSpineNodeLoop = useEditorStore((state) => state.updateSpineNodeLoop);
  const requestSpineFrame = useEditorStore((state) => state.requestSpineFrame);
  const setSpineAutoplay = useEditorStore((state) => state.setSpineAutoplay);
  const spineAutoplay = useEditorStore((state) => selectedNode?.type === "spine" ? state.spineAutoplay[selectedNode.id] ?? true : true);
  const spinePlayback = useEditorStore((state) => selectedNode?.type === "spine" ? state.spinePlaybackFrames[selectedNode.id] : undefined);
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);
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
  const owner = readOnly
    ? document.prefabs.find((prefab) => prefab.nodes.some((node) => node.id === selectedNode.id))
    : getEditingTarget(document, { sceneId, editingPrefabId });
  const worldTransform = owner === undefined ? undefined : getNodeWorldMatrix(owner, selectedNode.id, activeProfile);
  const updateTransform = (patch: Partial<UINode["transform"]>) => {
    updateNodeProfileTransform(selectedNode.id, patch);
  };

  const pivotX = resolvedTransform.pivotX ?? 0;
  const pivotY = resolvedTransform.pivotY ?? 0;
  const anchorMinX = resolvedTransform.anchorMinX ?? 0;
  const anchorMinY = resolvedTransform.anchorMinY ?? 0;
  const anchor: AnchorRect = {
    minX: anchorMinX,
    minY: anchorMinY,
    maxX: resolvedTransform.anchorMaxX ?? anchorMinX,
    maxY: resolvedTransform.anchorMaxY ?? anchorMinY,
  };
  const stretchX = isStretched(anchor.minX, anchor.maxX);
  const stretchY = isStretched(anchor.minY, anchor.maxY);

  return <fieldset className="inspector-content" disabled={readOnly}>
    {readOnly && <p className="inspector-empty">Preset content is read-only. Use Edit in Presets to change it.</p>}
    <InspectorWindow title="Node">
      <NodeNameField nodeId={selectedNode.id} value={selectedNode.name} onCommit={(nodeId, name) => updateNode(nodeId, { name })} />
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
    {selectedNode.type === "button" && <InspectorWindow title="Button">
      {BUTTON_STATE_KEYS.map((state) => {
        const assetId = selectedNode.states[`${state}AssetId`];
        return <InspectorField key={state} label={BUTTON_STATE_LABELS[state]}>
          <select
            value={assetId ?? ""}
            onChange={(event) => setButtonStateAsset(selectedNode.id, state, event.target.value || undefined)}
          >
            {/* Normal обязателен; остальные состояния при пустом значении берут его изображение. */}
            {state !== "normal" && <option value="">(use Normal)</option>}
            {imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </InspectorField>;
      })}
      <InspectorField label="Enabled"><input type="checkbox" checked={selectedNode.enabled} onChange={(event) => setButtonEnabled(selectedNode.id, event.target.checked)} /></InspectorField>
      {/* Transient: показывает состояние на canvas, но не сериализуется и не влияет на Preview. */}
      <InspectorField label="Preview state">
        <select value={buttonPreviewState} onChange={(event) => previewButtonState(selectedNode.id, event.target.value as ButtonStateKey)}>
          {BUTTON_STATE_KEYS.map((state) => <option key={state} value={state}>{BUTTON_STATE_LABELS[state]}</option>)}
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
      <InspectorField label="Loop"><input type="checkbox" checked={selectedNode.loop ?? true} disabled={selectedNode.animation === undefined} onChange={(event) => updateSpineNodeLoop(selectedNode.id, event.target.checked)} /></InspectorField>
      <InspectorField label="Autoplay"><input type="checkbox" checked={spineAutoplay} disabled={selectedNode.animation === undefined} onChange={(event) => setSpineAutoplay(selectedNode.id, event.target.checked)} /></InspectorField>
      {(() => {
        const animation = selectedNode.animation
          ? spineData?.findAnimation(selectedNode.animation)
          : undefined;
        const fps = spineData?.fps && spineData.fps > 0 ? spineData.fps : 60;
        const total = spinePlayback?.total ?? Math.max(1, Math.round((animation?.duration ?? 0) * fps));
        const current = Math.min(total, spinePlayback?.current ?? 1);
        const setFrame = (frame: number) => requestSpineFrame(selectedNode.id, Math.min(total, Math.max(1, Math.round(frame))));
        return <>
          <NumberField label="Frame" value={current} step={1} onChange={setFrame} />
          <InspectorField label="Frames"><output>{current} / {total}</output><span><button type="button" disabled={selectedNode.animation === undefined || current <= 1} onClick={() => setFrame(current - 1)}>−</button><button type="button" disabled={selectedNode.animation === undefined || current >= total} onClick={() => setFrame(current + 1)}>+</button></span></InspectorField>
        </>;
      })()}
    </InspectorWindow>}
    <InspectorWindow title="Layout Visibility">
      <InspectorField label="Horizontal"><input type="checkbox" checked={selectedNode.layoutOverrides?.desktop?.visible !== false} onChange={(event) => setNodeOrientationVisibility(selectedNode.id, "desktop", event.target.checked)} /></InspectorField>
      <InspectorField label="Vertical"><input type="checkbox" checked={selectedNode.layoutOverrides?.mobile?.visible !== false} onChange={(event) => setNodeOrientationVisibility(selectedNode.id, "mobile", event.target.checked)} /></InspectorField>
    </InspectorWindow>
    <InspectorWindow title="Transform">
      {/* Как в Unity: растянутая ось редактируется отступами от якорных точек (Left/Right, Top/Bottom) вместо позиции и размера. */}
      {stretchX
        ? <>
          <NumberField label="Left" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value, width: resolvedTransform.x + resolvedTransform.width - value })} />
          <NumberField label="Right" value={-(resolvedTransform.x + resolvedTransform.width)} step={1} onChange={(value) => updateTransform({ width: -value - resolvedTransform.x })} />
        </>
        : <NumberField label="Local X" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value })} />}
      {stretchY
        ? <>
          <NumberField label="Top" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value, height: resolvedTransform.y + resolvedTransform.height - value })} />
          <NumberField label="Bottom" value={-(resolvedTransform.y + resolvedTransform.height)} step={1} onChange={(value) => updateTransform({ height: -value - resolvedTransform.y })} />
        </>
        : <NumberField label="Local Y" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value })} />}
      <InspectorField label="Global X"><output>{worldTransform === undefined ? "—" : formatDegrees(worldTransform.tx)}</output></InspectorField>
      <InspectorField label="Global Y"><output>{worldTransform === undefined ? "—" : formatDegrees(worldTransform.ty)}</output></InspectorField>
      {!stretchX && <NumberField label="Width" value={resolvedTransform.width} step={1} onChange={(value) => updateTransform({ width: value })} />}
      {!stretchY && <NumberField label="Height" value={resolvedTransform.height} step={1} onChange={(value) => updateTransform({ height: value })} />}
      <NumberField label="Scale X" value={resolvedTransform.scaleX} step={0.1} onChange={(value) => updateTransform({ scaleX: value })} />
      <NumberField label="Scale Y" value={resolvedTransform.scaleY} step={0.1} onChange={(value) => updateTransform({ scaleY: value })} />
      <RotationField radians={resolvedTransform.rotation} onChangeRadians={(value) => updateTransform({ rotation: value })} />
      <AnchorField anchor={anchor} onSelect={(nextAnchor, options) => setNodeProfileAnchor(selectedNode.id, nextAnchor, options)} />
      <PivotField pivotX={pivotX} pivotY={pivotY} onChange={(x, y) => updateTransform({ pivotX: x, pivotY: y })} />
    </InspectorWindow>
    {selectedNode.type === "text" && <InspectorWindow title="Text">
      <InspectorField label="Text"><input type="text" value={selectedNode.text} onChange={(event) => updateNode(selectedNode.id, { text: event.target.value })} /></InspectorField>
    </InspectorWindow>}
  </fieldset>;
}
