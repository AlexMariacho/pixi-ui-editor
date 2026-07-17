import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnchorRect } from "../../store/index.js";
import { InspectorField } from "./fields.js";
import { samePivot } from "./PivotField.js";

export const ANCHOR_AXIS_PRESETS: { min: number; max: number }[] = [
  { min: 0, max: 0 }, { min: 0.5, max: 0.5 }, { min: 1, max: 1 }, { min: 0, max: 1 },
];
export const ANCHOR_PRESETS: AnchorRect[] = ANCHOR_AXIS_PRESETS.flatMap((yAxis) =>
  ANCHOR_AXIS_PRESETS.map((xAxis) => ({ minX: xAxis.min, maxX: xAxis.max, minY: yAxis.min, maxY: yAxis.max })));

export const isStretched = (min: number, max: number) => max - min > 0.0001;
export const sameAnchor = (left: AnchorRect, right: AnchorRect) =>
  samePivot(left.minX, right.minX) && samePivot(left.maxX, right.maxX) && samePivot(left.minY, right.minY) && samePivot(left.maxY, right.maxY);

export function AnchorPresetIcon({ anchor, pivotPreview = false }: { anchor: AnchorRect; pivotPreview?: boolean }) {
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
    {pivotPreview && <span className="anchor-preset-pivot-preview" style={{
      left: `${(stretchX ? 0.5 : anchor.minX) * 100}%`,
      top: `${(stretchY ? 0.5 : anchor.minY) * 100}%`,
    }} />}
  </span>;
}

/** Unity-like 4x4 anchor preset popup. */
export function AnchorField({ anchor, onSelect }: {
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
