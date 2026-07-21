import { getEditingTarget } from "./helpers.js";
import type { EditorSlice, EditorState, HistoryEntry } from "./types.js";

export const HISTORY_LIMIT = 50;

type Keys = "undoStack" | "redoStack" | "historyGestureActive" | "historyGestureHasCommit" | "undo" | "redo" | "beginHistoryGesture" | "endHistoryGesture";

function captureHistoryEntry(state: EditorState): HistoryEntry {
  return {
    document: state.document,
    sceneId: state.sceneId,
    editingPrefabId: state.editingPrefabId,
    selectedNodeIds: state.selectedNodeIds,
  };
}

function appendEntry(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...stack, entry].slice(-HISTORY_LIMIT);
}

function restoreEntry(entry: HistoryEntry, stack: HistoryEntry[], oppositeStack: HistoryEntry[]): Partial<EditorState> {
  const sceneId = entry.document.scenes.some((scene) => scene.id === entry.sceneId)
    ? entry.sceneId
    : entry.document.scenes[0]?.id ?? entry.sceneId;
  const editingPrefabId = entry.editingPrefabId !== null && entry.document.prefabs.some((prefab) => prefab.id === entry.editingPrefabId)
    ? entry.editingPrefabId
    : null;
  const target = getEditingTarget(entry.document, { sceneId, editingPrefabId });
  const nodeIds = new Set(target?.nodes.map((node) => node.id));
  const selectedNodeIds = entry.selectedNodeIds.filter((nodeId) => nodeIds.has(nodeId));

  return {
    document: entry.document,
    sceneId,
    editingPrefabId,
    selectedNodeIds,
    selectedNodeId: selectedNodeIds.at(-1) ?? null,
    undoStack: stack,
    redoStack: oppositeStack,
  };
}

export const createHistorySlice: EditorSlice<Keys> = (set) => ({
  undoStack: [],
  redoStack: [],
  historyGestureActive: false,
  historyGestureHasCommit: false,
  beginHistoryGesture: () => set((state) => state.historyGestureActive ? state : { historyGestureActive: true, historyGestureHasCommit: false }),
  endHistoryGesture: () => set((state) => state.historyGestureActive ? { historyGestureActive: false, historyGestureHasCommit: false } : state),
  undo: () => set((state) => {
    const entry = state.undoStack.at(-1);
    if (entry === undefined) return state;
    return restoreEntry(entry, state.undoStack.slice(0, -1), appendEntry(state.redoStack, captureHistoryEntry(state)));
  }),
  redo: () => set((state) => {
    const entry = state.redoStack.at(-1);
    if (entry === undefined) return state;
    return restoreEntry(entry, appendEntry(state.undoStack, captureHistoryEntry(state)), state.redoStack.slice(0, -1));
  }),
});

export function recordHistoryCommit(state: EditorState): Pick<EditorState, "undoStack" | "redoStack" | "historyGestureHasCommit"> {
  if (state.historyGestureActive && state.historyGestureHasCommit) {
    return { undoStack: state.undoStack, redoStack: state.redoStack, historyGestureHasCommit: true };
  }
  return {
    undoStack: appendEntry(state.undoStack, captureHistoryEntry(state)),
    redoStack: [],
    historyGestureHasCommit: state.historyGestureActive,
  };
}

/** The history service knows only its semantic command IDs, never keyboard or toolbar bindings. */
type HistoryCommandRegistry = {
  subscribe(commandId: "history.undo" | "history.redo", listener: () => void): () => void;
};

export function bindHistoryCommands(registry: HistoryCommandRegistry, getState: () => EditorState): void {
  registry.subscribe("history.undo", () => getState().undo());
  registry.subscribe("history.redo", () => getState().redo());
}
