import { InspectorField, NumberField } from "./fields.js";

export const PIVOT_PRESETS: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
];

export const samePivot = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** 3x3 grid for the common pivot positions. */
export function PivotGrid({ pivotX, pivotY, onSelect }: { pivotX: number; pivotY: number; onSelect: (x: number, y: number) => void }) {
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

export const toPercent = (fraction: number) => Math.round(fraction * 1000) / 10;
export const clampFraction = (value: number) => Math.min(1, Math.max(0, value));

/** Pivot as a normalized 0-1 fraction of width/height. */
export function PivotField({ pivotX, pivotY, onChange }: { pivotX: number; pivotY: number; onChange: (pivotX: number, pivotY: number) => void }) {
  return <>
    <InspectorField label="Pivot"><PivotGrid pivotX={pivotX} pivotY={pivotY} onSelect={onChange} /></InspectorField>
    <NumberField label="Pivot X %" value={toPercent(pivotX)} step={1} onChange={(value) => onChange(clampFraction(value / 100), pivotY)} />
    <NumberField label="Pivot Y %" value={toPercent(pivotY)} step={1} onChange={(value) => onChange(pivotX, clampFraction(value / 100))} />
  </>;
}
