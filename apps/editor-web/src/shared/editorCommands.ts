import { getEditingTarget, useEditorStore, type EditorState } from "../store/index.js";
import { bindEditorCommands } from "./editorCommandBindings.js";

export const EDITOR_COMMAND_IDS = {
  panTool: "tool.pan",
  selectTool: "tool.select",
  resizeTool: "tool.resize",
  toggleMap: "view.toggle-map",
  cancelView: "view.cancel",
  deleteNode: "selection.delete-node",
  undo: "history.undo",
  redo: "history.redo",
} as const;

export type EditorCommandId = typeof EDITOR_COMMAND_IDS[keyof typeof EDITOR_COMMAND_IDS];

export type KeyBinding = {
  key: string;
  /** Physical keyboard key for layout-independent editor shortcuts (for example, KeyZ). */
  code?: string;
  label: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
};

export type EditorKeyBindings = Readonly<Record<EditorCommandId, readonly KeyBinding[]>>;

type KeyboardEventLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;
type EditorKeyboardEvent = KeyboardEventLike & Pick<KeyboardEvent, "target" | "preventDefault">;

type EditorCommand = {
  id: EditorCommandId;
  title: string;
  canExecute(state: EditorState): boolean;
};

export const DEFAULT_EDITOR_KEY_BINDINGS: EditorKeyBindings = {
  [EDITOR_COMMAND_IDS.panTool]: [{ key: "q", code: "KeyQ", label: "Q" }],
  [EDITOR_COMMAND_IDS.selectTool]: [{ key: "w", code: "KeyW", label: "W" }],
  [EDITOR_COMMAND_IDS.resizeTool]: [{ key: "e", code: "KeyE", label: "E" }],
  [EDITOR_COMMAND_IDS.toggleMap]: [{ key: "m", code: "KeyM", label: "M" }],
  [EDITOR_COMMAND_IDS.cancelView]: [{ key: "Escape", code: "Escape", label: "Esc" }],
  [EDITOR_COMMAND_IDS.deleteNode]: [{ key: "Delete", code: "Delete", label: "Del" }],
  [EDITOR_COMMAND_IDS.undo]: [{ key: "z", code: "KeyZ", label: "Ctrl+Z", ctrl: true, shift: false }],
  [EDITOR_COMMAND_IDS.redo]: [
    { key: "y", code: "KeyY", label: "Ctrl+Y", ctrl: true, shift: false },
    { key: "z", code: "KeyZ", label: "Ctrl+Shift+Z", ctrl: true, shift: true },
  ],
};

const commands: Readonly<Record<EditorCommandId, EditorCommand>> = {
  [EDITOR_COMMAND_IDS.panTool]: toolCommand(EDITOR_COMMAND_IDS.panTool, "Pan", "pan"),
  [EDITOR_COMMAND_IDS.selectTool]: toolCommand(EDITOR_COMMAND_IDS.selectTool, "Select", "select"),
  [EDITOR_COMMAND_IDS.resizeTool]: toolCommand(EDITOR_COMMAND_IDS.resizeTool, "Resize", "resize"),
  [EDITOR_COMMAND_IDS.toggleMap]: {
    id: EDITOR_COMMAND_IDS.toggleMap,
    title: "Map",
    canExecute: () => true,
  },
  [EDITOR_COMMAND_IDS.cancelView]: {
    id: EDITOR_COMMAND_IDS.cancelView,
    title: "Cancel current view",
    canExecute: (state) => state.editingPrefabId !== null || state.viewMode === "map",
  },
  [EDITOR_COMMAND_IDS.deleteNode]: {
    id: EDITOR_COMMAND_IDS.deleteNode,
    title: "Delete selected node",
    canExecute: canDeleteSelectedNode,
  },
  [EDITOR_COMMAND_IDS.undo]: {
    id: EDITOR_COMMAND_IDS.undo,
    title: "Undo",
    canExecute: (state) => state.undoStack.length > 0,
  },
  [EDITOR_COMMAND_IDS.redo]: {
    id: EDITOR_COMMAND_IDS.redo,
    title: "Redo",
    canExecute: (state) => state.redoStack.length > 0,
  },
};

function toolCommand(id: EditorCommandId, title: string, tool: EditorState["activeTool"]): EditorCommand {
  return {
    id,
    title,
    canExecute: (state) => state.viewMode !== "map" || tool === "pan",
  };
}

function canDeleteSelectedNode(state: EditorState): boolean {
  if (state.selectedNodeId === null) return false;
  const owner = getEditingTarget(state.document, state);
  const node = owner?.nodes.find((candidate) => candidate.id === state.selectedNodeId);
  if (owner === undefined || node === undefined) return false;
  return node.parentId !== null || owner.rootNodeIds.length > 1;
}

function bindingMatchesEvent(binding: KeyBinding, event: KeyboardEventLike): boolean {
  return (binding.code === undefined ? binding.key.toLowerCase() === event.key.toLowerCase() : binding.code === event.code)
    && (binding.ctrl ?? false) === event.ctrlKey
    && (binding.alt ?? false) === event.altKey
    && (binding.meta ?? false) === event.metaKey
    && (binding.shift === undefined || binding.shift === event.shiftKey);
}

export class EditorCommandRegistry {
  private readonly listeners = new Map<EditorCommandId, Set<() => void>>();

  constructor(
    private readonly getState: () => EditorState,
    private keyBindings: EditorKeyBindings = DEFAULT_EDITOR_KEY_BINDINGS,
  ) {}

  execute(commandId: EditorCommandId): boolean {
    const command = commands[commandId];
    const state = this.getState();
    if (!command.canExecute(state)) return false;
    this.listeners.get(commandId)?.forEach((listener) => listener());
    return true;
  }

  /** Command consumers subscribe by semantic ID; input sources never know what the command does. */
  subscribe(commandId: EditorCommandId, listener: () => void): () => void {
    const listeners = this.listeners.get(commandId) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(commandId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(commandId);
    };
  }

  isEnabled(commandId: EditorCommandId): boolean {
    return commands[commandId].canExecute(this.getState());
  }

  getTitle(commandId: EditorCommandId): string {
    return commands[commandId].title;
  }

  getShortcutLabel(commandId: EditorCommandId): string | undefined {
    return this.keyBindings[commandId][0]?.label;
  }

  setKeyBindings(keyBindings: EditorKeyBindings): void {
    this.keyBindings = keyBindings;
  }

  resolveKeyboardEvent(event: KeyboardEventLike): EditorCommandId | undefined {
    return (Object.keys(this.keyBindings) as EditorCommandId[]).find((commandId) =>
      this.keyBindings[commandId].some((binding) => bindingMatchesEvent(binding, event)),
    );
  }

  dispatchKeyboardEvent(event: KeyboardEventLike): boolean {
    const commandId = this.resolveKeyboardEvent(event);
    return commandId === undefined ? false : this.execute(commandId);
  }
}

export const editorCommandRegistry = new EditorCommandRegistry(() => useEditorStore.getState());
bindEditorCommands(editorCommandRegistry, () => useEditorStore.getState());

/** Single keyboard boundary for the editor; callers may register it in capture phase to beat canvas handlers. */
export function dispatchEditorKeyboardEvent(event: EditorKeyboardEvent): boolean {
  if (isEditorTextInput(event.target)) return false;
  if (!editorCommandRegistry.dispatchKeyboardEvent(event)) return false;
  event.preventDefault();
  return true;
}

export function isEditorTextInput(target: EventTarget | null): boolean {
  return typeof HTMLElement !== "undefined" && target instanceof HTMLElement && (
    target.matches("input, textarea, select")
    || target.isContentEditable
    || target.closest("[contenteditable='true']") !== null
  );
}
