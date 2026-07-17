import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { LayoutProfileId } from "@pixi-ui-editor/schema";
export type ScreenPreset = { label: string; width: number; height: number };

const SCREEN_PRESET_GROUPS: readonly { label: string; presets: readonly ScreenPreset[] }[] = [
  {
    label: "Mobile",
    presets: [
      { label: "640 × 1136 (iPhone SE 1st Gen)", width: 640, height: 1136 },
      { label: "750 × 1334 (iPhone 6, 7, 8, SE 2nd/3rd Gen)", width: 750, height: 1334 },
      { label: "828 × 1792 (iPhone XR, 11)", width: 828, height: 1792 },
      { label: "1080 × 1920 (Pixel 2, Galaxy S5-S7)", width: 1080, height: 1920 },
      { label: "1170 × 2532 (iPhone 12, 13, 14, 15)", width: 1170, height: 2532 },
      { label: "1284 × 2778 (iPhone 12/13/14/15 Pro Max)", width: 1284, height: 2778 },
      { label: "1440 × 3200 (Galaxy S22 Ultra, OnePlus 8 Pro)", width: 1440, height: 3200 },
    ],
  },
  {
    label: "Desktop",
    presets: [
      { label: "1024 × 768 (Older CRT, legacy monitors)", width: 1024, height: 768 },
      { label: "1366 × 768 (Common budget laptops)", width: 1366, height: 768 },
      { label: "1920 × 1080 (Standard 1080p monitors)", width: 1920, height: 1080 },
      { label: "2560 × 1440 (2K monitors, gaming displays)", width: 2560, height: 1440 },
      { label: "3024 × 1964 (MacBook Pro 14” 2021+)", width: 3024, height: 1964 },
      { label: "3840 × 2160 (4K UHD monitors)", width: 3840, height: 2160 },
      { label: "6016 × 3384 (6K Apple Pro Display XDR)", width: 6016, height: 3384 },
    ],
  },
  {
    label: "Tablet",
    presets: [
      { label: "768 × 1024 (iPad Mini 1st-5th Gen, iPad 1st-9th Gen)", width: 768, height: 1024 },
      { label: "810 × 1080 (iPad Mini 6th Gen)", width: 810, height: 1080 },
      { label: "834 × 1194 (iPad Air 3rd-5th Gen)", width: 834, height: 1194 },
      { label: "1024 × 1366 (iPad Pro 12.9”)", width: 1024, height: 1366 },
      { label: "1200 × 1920 (Galaxy Tab A7, Fire HD 10)", width: 1200, height: 1920 },
      { label: "1600 × 2560 (Galaxy Tab S7/S8/S9)", width: 1600, height: 2560 },
    ],
  },
] as const;

export const SCREEN_PRESETS = SCREEN_PRESET_GROUPS.flatMap((group) => group.presets);

export function toActiveViewport(preset: ScreenPreset, profile: LayoutProfileId) {
  const shortSide = Math.min(preset.width, preset.height);
  const longSide = Math.max(preset.width, preset.height);
  return profile === "desktop" ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide };
}

export function getPresetLabel(preset: ScreenPreset, profile: LayoutProfileId) {
  const viewport = toActiveViewport(preset, profile);
  return preset.label.replace(/^\d+ × \d+/, `${viewport.width} × ${viewport.height}`);
}

export function isCurrentPreset(preset: ScreenPreset, viewport: { width: number; height: number }, profile: LayoutProfileId) {
  const expectedViewport = toActiveViewport(preset, profile);
  return viewport.width === expectedViewport.width && viewport.height === expectedViewport.height;
}

export function ScreenNumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  const applyValue = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChange(parsed);
  };

  return <label className="toolbar-screen-number"><span>{label}</span><input type="number" value={text} step={1} onChange={applyValue} /></label>;
}

export function ScreenResolutionsMenu({
  activeProfile,
  viewport,
  setActiveProfile,
  updateReferenceViewport,
}: {
  activeProfile: LayoutProfileId;
  viewport: { width: number; height: number };
  setActiveProfile: (profile: LayoutProfileId) => void;
  updateReferenceViewport: (profile: LayoutProfileId, viewport: { width: number; height: number }) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const preferredGroupLabels = activeProfile === "desktop"
    ? ["Desktop", "Tablet", "Mobile"]
    : ["Mobile", "Tablet", "Desktop"];
  const selectedPreset = preferredGroupLabels
    .flatMap((groupLabel) => SCREEN_PRESET_GROUPS.find((group) => group.label === groupLabel)?.presets ?? [])
    .find((preset) => isCurrentPreset(preset, viewport, activeProfile));

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const updateViewportDimension = (dimension: "width" | "height", value: number) => {
    updateReferenceViewport(activeProfile, { ...viewport, [dimension]: value });
  };
  const applyPreset = (preset: ScreenPreset) => {
    updateReferenceViewport(activeProfile, toActiveViewport(preset, activeProfile));
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="screen-resolutions-menu">
      <button
        type="button"
        className={`screen-resolutions-trigger${isOpen ? " screen-resolutions-trigger-open" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
      >
        Screen Resolutions
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <section className="screen-resolutions-popover" aria-label="Screen Resolutions">
          {SCREEN_PRESET_GROUPS.map((group) => (
            <fieldset key={group.label} className="screen-resolution-group">
              <legend>{group.label}</legend>
              {group.presets.map((preset) => (
                <label key={preset.label} className="screen-resolution-option">
                  <input
                    type="radio"
                    name="screen-resolution"
                    checked={selectedPreset?.label === preset.label}
                    onChange={() => applyPreset(preset)}
                  />
                  <span>{getPresetLabel(preset, activeProfile)}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <fieldset className="screen-resolution-group screen-resolution-custom">
            <legend>Custom</legend>
            <div className="screen-resolution-custom-fields">
              <ScreenNumberField label="W" value={viewport.width} onChange={(value) => updateViewportDimension("width", value)} />
              <ScreenNumberField label="H" value={viewport.height} onChange={(value) => updateViewportDimension("height", value)} />
            </div>
          </fieldset>
          <fieldset className="screen-resolution-group">
            <legend>Orientation</legend>
            <label className="screen-resolution-option">
              <input type="radio" name="orientation" checked={activeProfile === "desktop"} onChange={() => setActiveProfile("desktop")} />
              <span>Horizontal</span>
            </label>
            <label className="screen-resolution-option">
              <input type="radio" name="orientation" checked={activeProfile === "mobile"} onChange={() => setActiveProfile("mobile")} />
              <span>Vertical</span>
            </label>
          </fieldset>
        </section>
      )}
    </div>
  );
}
