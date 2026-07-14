import { create } from "zustand";

export const UI_PREFS_STORAGE_KEY = "pixi-ui-editor:ui-prefs";

export type AssetsWindowPosition = { x: number; y: number };
export type AssetsWindowSize = { width: number; height: number };
export type AssetsViewMode = "list" | "compact" | "grid";

export type UiPrefsState = {
  assetsWindowOpen: boolean;
  assetsWindowPosition: AssetsWindowPosition;
  assetsWindowSize: AssetsWindowSize;
  assetsViewMode: AssetsViewMode;
  setAssetsWindowOpen(open: boolean): void;
  setAssetsWindowPosition(position: AssetsWindowPosition): void;
  setAssetsWindowSize(size: AssetsWindowSize): void;
  setAssetsViewMode(mode: AssetsViewMode): void;
};

const defaults = {
  assetsWindowOpen: false,
  assetsWindowPosition: { x: 16, y: 16 },
  assetsWindowSize: { width: 280, height: 360 },
  assetsViewMode: "list" as AssetsViewMode,
};

function isPosition(value: unknown): value is AssetsWindowPosition {
  if (typeof value !== "object" || value === null) return false;
  const position = value as Record<string, unknown>;
  return typeof position.x === "number" && Number.isFinite(position.x)
    && typeof position.y === "number" && Number.isFinite(position.y);
}

function isSize(value: unknown): value is AssetsWindowSize {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Record<string, unknown>;
  return typeof size.width === "number" && Number.isFinite(size.width) && size.width > 0
    && typeof size.height === "number" && Number.isFinite(size.height) && size.height > 0;
}

export function loadUiPrefs(): Pick<UiPrefsState, "assetsWindowOpen" | "assetsWindowPosition" | "assetsWindowSize" | "assetsViewMode"> {
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
}));

useUiPrefsStore.subscribe((state) => {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({
      assetsWindowOpen: state.assetsWindowOpen,
      assetsWindowPosition: state.assetsWindowPosition,
      assetsWindowSize: state.assetsWindowSize,
      assetsViewMode: state.assetsViewMode,
    }));
  } catch (error) {
    console.warn("The editor UI preferences could not be saved to localStorage.", error);
  }
});
