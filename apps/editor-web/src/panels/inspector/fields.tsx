import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

type InspectorWindowProps = {
  title: string;
  children: ReactNode;
};

type InspectorFieldProps = {
  label: string;
  children: ReactNode;
};

/** Shared inspector window frame for all property groups. */
export function InspectorWindow({ title, children }: InspectorWindowProps) {
  return <section className="inspector-window"><h2>{title}</h2><div className="inspector-window-content">{children}</div></section>;
}

/** Shared label/control geometry for every editable and read-only inspector row. */
export function InspectorField({ label, children }: InspectorFieldProps) {
  return <label className="inspector-field"><span>{label}</span>{children}</label>;
}

/** Keeps a free-typed text buffer for a number input. */
export function useNumberText(value: number, format: (value: number) => string = (n) => String(n)) {
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : format(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [text, setText] as const;
}

export function NumberField({ label = "", value, step = 1, onChange }: { label?: string; value: number; step?: number; onChange: (value: number) => void }) {
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

export function NodeNameField({ nodeId, value, onCommit }: { nodeId: string; value: string; onCommit: (nodeId: string, value: string) => void }) {
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

export const formatDegrees = (value: number) => String(Math.round(value * 100) / 100);

/** Rotation is stored in radians but edited in unrestricted degrees. */
export function RotationField({ radians, onChangeRadians }: { radians: number; onChangeRadians: (radians: number) => void }) {
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
