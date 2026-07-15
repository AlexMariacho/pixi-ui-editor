import type { EditorTool } from "./store.js";

type EditorShortcut = { key: string; label: string };

export const EDITOR_SHORTCUTS = {
  pan: { key: "q", label: "Q" },
  select: { key: "w", label: "W" },
  resize: { key: "e", label: "E" },
  map: { key: "m", label: "M" },
  deleteNode: { key: "Delete", label: "Del" },
} as const satisfies Record<string, EditorShortcut>;

export const TOOL_SHORTCUTS: Readonly<Record<EditorTool, EditorShortcut>> = {
  pan: EDITOR_SHORTCUTS.pan,
  select: EDITOR_SHORTCUTS.select,
  resize: EDITOR_SHORTCUTS.resize,
};

export const TOOL_BY_SHORTCUT: Readonly<Record<string, EditorTool>> = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS).map(([tool, shortcut]) => [shortcut.key, tool as EditorTool]),
);

export function isEditorTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select")
    || target.isContentEditable
    || target.closest("[contenteditable='true']") !== null
  );
}
