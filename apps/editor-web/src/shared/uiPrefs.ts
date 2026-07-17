import { create } from "zustand";

export const UI_PREFS_STORAGE_KEY = "pixi-ui-editor:ui-prefs";

export type FloatingWindowPositionPref = { x: number; y: number };
export type FloatingWindowSizePref = { width: number; height: number };
export type AssetsWindowPosition = FloatingWindowPositionPref;
export type AssetsWindowSize = FloatingWindowSizePref;
export type AssetsViewMode = "list" | "compact" | "grid";

type PersistedUiPrefs = {
  assetsWindowOpen: boolean;
  assetsWindowPosition: FloatingWindowPositionPref;
  assetsWindowSize: FloatingWindowSizePref;
  assetsViewMode: AssetsViewMode;
  presetsWindowOpen: boolean;
  presetsWindowPosition: FloatingWindowPositionPref;
  presetsWindowSize: FloatingWindowSizePref;
};

export type UiPrefsState = PersistedUiPrefs & {
  setAssetsWindowOpen(open: boolean): void;
  setAssetsWindowPosition(position: FloatingWindowPositionPref): void;
  setAssetsWindowSize(size: FloatingWindowSizePref): void;
  setAssetsViewMode(mode: AssetsViewMode): void;
  setPresetsWindowOpen(open: boolean): void;
  setPresetsWindowPosition(position: FloatingWindowPositionPref): void;
  setPresetsWindowSize(size: FloatingWindowSizePref): void;
};

const defaults: PersistedUiPrefs = {
  assetsWindowOpen: false,
  assetsWindowPosition: { x: 16, y: 16 },
  assetsWindowSize: { width: 280, height: 360 },
  assetsViewMode: "list",
  presetsWindowOpen: false,
  presetsWindowPosition: { x: 16, y: 392 },
  presetsWindowSize: { width: 280, height: 280 },
};

function isPosition(value: unknown): value is FloatingWindowPositionPref {
  if (typeof value !== "object" || value === null) return false;
  const position = value as Record<string, unknown>;
  return typeof position.x === "number" && Number.isFinite(position.x)
    && typeof position.y === "number" && Number.isFinite(position.y);
}

function isSize(value: unknown): value is FloatingWindowSizePref {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Record<string, unknown>;
  return typeof size.width === "number" && Number.isFinite(size.width) && size.width > 0
    && typeof size.height === "number" && Number.isFinite(size.height) && size.height > 0;
}

export function loadUiPrefs(): PersistedUiPrefs {
  if (typeof localStorage === "undefined") return structuredClone(defaults);

  const storedPrefs = localStorage.getItem(UI_PREFS_STORAGE_KEY);
  if (storedPrefs === null) return structuredClone(defaults);

  try {
    const parsedPrefs: unknown = JSON.parse(storedPrefs);
    if (typeof parsedPrefs !== "object" || parsedPrefs === null) return structuredClone(defaults);
    const prefs = parsedPrefs as Record<string, unknown>;
    if (typeof prefs.assetsWindowOpen !== "boolean" || !isPosition(prefs.assetsWindowPosition)) return structuredClone(defaults);
    return {
      assetsWindowOpen: prefs.assetsWindowOpen,
      assetsWindowPosition: { ...prefs.assetsWindowPosition },
      assetsWindowSize: isSize(prefs.assetsWindowSize) ? { ...prefs.assetsWindowSize } : { ...defaults.assetsWindowSize },
      assetsViewMode: prefs.assetsViewMode === "grid" || prefs.assetsViewMode === "compact" ? prefs.assetsViewMode : "list",
      presetsWindowOpen: typeof prefs.presetsWindowOpen === "boolean" ? prefs.presetsWindowOpen : defaults.presetsWindowOpen,
      presetsWindowPosition: isPosition(prefs.presetsWindowPosition) ? { ...prefs.presetsWindowPosition } : { ...defaults.presetsWindowPosition },
      presetsWindowSize: isSize(prefs.presetsWindowSize) ? { ...prefs.presetsWindowSize } : { ...defaults.presetsWindowSize },
    };
  } catch {
    return structuredClone(defaults);
  }
}

const initialPrefs = loadUiPrefs();

export const useUiPrefsStore = create<UiPrefsState>((set) => ({
  ...initialPrefs,
  setAssetsWindowOpen: (assetsWindowOpen) => set({ assetsWindowOpen }),
  setAssetsWindowPosition: (assetsWindowPosition) => set({ assetsWindowPosition }),
  setAssetsWindowSize: (assetsWindowSize) => set({ assetsWindowSize }),
  setAssetsViewMode: (assetsViewMode) => set({ assetsViewMode }),
  setPresetsWindowOpen: (presetsWindowOpen) => set({ presetsWindowOpen }),
  setPresetsWindowPosition: (presetsWindowPosition) => set({ presetsWindowPosition }),
  setPresetsWindowSize: (presetsWindowSize) => set({ presetsWindowSize }),
}));

useUiPrefsStore.subscribe((state) => {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({
      assetsWindowOpen: state.assetsWindowOpen,
      assetsWindowPosition: state.assetsWindowPosition,
      assetsWindowSize: state.assetsWindowSize,
      assetsViewMode: state.assetsViewMode,
      presetsWindowOpen: state.presetsWindowOpen,
      presetsWindowPosition: state.presetsWindowPosition,
      presetsWindowSize: state.presetsWindowSize,
    }));
  } catch (error) {
    console.warn("The editor UI preferences could not be saved to localStorage.", error);
  }
});
