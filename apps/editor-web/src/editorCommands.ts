import { getEditingTarget, useEditorStore, type EditorState } from "./store/index.js";

export const EDITOR_COMMAND_IDS = {
  panTool: "tool.pan",
  selectTool: "tool.select",
  resizeTool: "tool.resize",
  toggleMap: "view.toggle-map",
  cancelView: "view.cancel",
  deleteNode: "selection.delete-node",
} as const;

export type EditorCommandId = typeof EDITOR_COMMAND_IDS[keyof typeof EDITOR_COMMAND_IDS];

export type KeyBinding = {
  key: string;
  label: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
};

export type EditorKeyBindings = Readonly<Record<EditorCommandId, readonly KeyBinding[]>>;

type KeyboardEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

type EditorCommand = {
  id: EditorCommandId;
  title: string;
  canExecute(state: EditorState): boolean;
  execute(state: EditorState): void;
};

export const DEFAULT_EDITOR_KEY_BINDINGS: EditorKeyBindings = {
  [EDITOR_COMMAND_IDS.panTool]: [{ key: "q", label: "Q" }],
  [EDITOR_COMMAND_IDS.selectTool]: [{ key: "w", label: "W" }],
  [EDITOR_COMMAND_IDS.resizeTool]: [{ key: "e", label: "E" }],
  [EDITOR_COMMAND_IDS.toggleMap]: [{ key: "m", label: "M" }],
  [EDITOR_COMMAND_IDS.cancelView]: [{ key: "Escape", label: "Esc" }],
  [EDITOR_COMMAND_IDS.deleteNode]: [{ key: "Delete", label: "Del" }],
};

const commands: Readonly<Record<EditorCommandId, EditorCommand>> = {
  [EDITOR_COMMAND_IDS.panTool]: toolCommand(EDITOR_COMMAND_IDS.panTool, "Pan", "pan"),
  [EDITOR_COMMAND_IDS.selectTool]: toolCommand(EDITOR_COMMAND_IDS.selectTool, "Select", "select"),
  [EDITOR_COMMAND_IDS.resizeTool]: toolCommand(EDITOR_COMMAND_IDS.resizeTool, "Resize", "resize"),
  [EDITOR_COMMAND_IDS.toggleMap]: {
    id: EDITOR_COMMAND_IDS.toggleMap,
    title: "Map",
    canExecute: () => true,
    execute: (state) => state.setViewMode(state.viewMode === "map" ? "single" : "map"),
  },
  [EDITOR_COMMAND_IDS.cancelView]: {
    id: EDITOR_COMMAND_IDS.cancelView,
    title: "Cancel current view",
    canExecute: (state) => state.editingPrefabId !== null || state.viewMode === "map",
    execute: (state) => {
      if (state.editingPrefabId !== null) state.setEditingPrefabId(null);
      else if (state.viewMode === "map") state.setViewMode("single");
    },
  },
  [EDITOR_COMMAND_IDS.deleteNode]: {
    id: EDITOR_COMMAND_IDS.deleteNode,
    title: "Delete selected node",
    canExecute: canDeleteSelectedNode,
    execute: (state) => {
      if (state.selectedNodeId !== null) state.deleteNode(state.selectedNodeId);
    },
  },
};

function toolCommand(id: EditorCommandId, title: string, tool: EditorState["activeTool"]): EditorCommand {
  return {
    id,
    title,
    canExecute: (state) => state.viewMode !== "map" || tool === "pan",
    execute: (state) => state.setActiveTool(tool),
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
  return binding.key.toLowerCase() === event.key.toLowerCase()
    && (binding.ctrl ?? false) === event.ctrlKey
    && (binding.alt ?? false) === event.altKey
    && (binding.meta ?? false) === event.metaKey
    && (binding.shift === undefined || binding.shift === event.shiftKey);
}

export class EditorCommandRegistry {
  constructor(
    private readonly getState: () => EditorState,
    private keyBindings: EditorKeyBindings = DEFAULT_EDITOR_KEY_BINDINGS,
  ) {}

  execute(commandId: EditorCommandId): boolean {
    const command = commands[commandId];
    const state = this.getState();
    if (!command.canExecute(state)) return false;
    command.execute(state);
    return true;
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

export function isEditorTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select")
    || target.isContentEditable
    || target.closest("[contenteditable='true']") !== null
  );
}
