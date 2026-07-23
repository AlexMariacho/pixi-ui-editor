import type { LayoutProfileId } from "@pixi-ui-editor/schema";

/**
 * `editor.json` v1: the project's view-context (not personal preferences), so a recipient sees the
 * scene/orientation "as the author left it". Parsing is tolerant like `loadUiPrefs`: any mismatch
 * falls back to defaults and never blocks opening the project.
 */
export const EDITOR_JSON_FORMAT_VERSION = 1 as const;

export type EditorJson = {
  formatVersion: 1;
  activeSceneId: string | null;
  activeProfile: LayoutProfileId;
};

export const DEFAULT_EDITOR_JSON: EditorJson = {
  formatVersion: EDITOR_JSON_FORMAT_VERSION,
  activeSceneId: null,
  activeProfile: "desktop",
};

function isLayoutProfileId(value: unknown): value is LayoutProfileId {
  return value === "desktop" || value === "mobile";
}

/** Never throws: any shape mismatch (missing field, wrong type, garbage) yields safe defaults. */
export function parseEditorJson(input: unknown): EditorJson {
  if (typeof input !== "object" || input === null) return { ...DEFAULT_EDITOR_JSON };
  const candidate = input as Record<string, unknown>;
  const activeSceneId = typeof candidate.activeSceneId === "string" ? candidate.activeSceneId : candidate.activeSceneId === null ? null : DEFAULT_EDITOR_JSON.activeSceneId;
  const activeProfile = isLayoutProfileId(candidate.activeProfile) ? candidate.activeProfile : DEFAULT_EDITOR_JSON.activeProfile;
  return { formatVersion: EDITOR_JSON_FORMAT_VERSION, activeSceneId, activeProfile };
}

export function buildEditorJson(activeSceneId: string | null, activeProfile: LayoutProfileId): EditorJson {
  return { formatVersion: EDITOR_JSON_FORMAT_VERSION, activeSceneId, activeProfile };
}

/** Deterministic, human-diffable form for `editor.json`: fixed key order (see `EditorJson`), 2-space indent, trailing newline. */
export function serializeEditorJson(editorState: EditorJson): string {
  return `${JSON.stringify(editorState, null, 2)}\n`;
}
