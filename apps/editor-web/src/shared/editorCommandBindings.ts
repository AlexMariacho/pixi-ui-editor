import type { EditorState } from "../store/index.js";
import { bindHistoryCommands } from "../store/history.slice.js";
import { EDITOR_COMMAND_IDS, type EditorCommandRegistry } from "./editorCommands.js";

/** Wires editor services to semantic commands. The registry itself has no action callbacks. */
export function bindEditorCommands(registry: EditorCommandRegistry, getState: () => EditorState): void {
  registry.subscribe(EDITOR_COMMAND_IDS.panTool, () => getState().setActiveTool("pan"));
  registry.subscribe(EDITOR_COMMAND_IDS.selectTool, () => getState().setActiveTool("select"));
  registry.subscribe(EDITOR_COMMAND_IDS.resizeTool, () => getState().setActiveTool("resize"));
  registry.subscribe(EDITOR_COMMAND_IDS.toggleMap, () => {
    const state = getState();
    state.setViewMode(state.viewMode === "map" ? "single" : "map");
  });
  registry.subscribe(EDITOR_COMMAND_IDS.cancelView, () => {
    const state = getState();
    if (state.editingPrefabId !== null) state.setEditingPrefabId(null);
    else if (state.viewMode === "map") state.setViewMode("single");
  });
  registry.subscribe(EDITOR_COMMAND_IDS.deleteNode, () => {
    const state = getState();
    if (state.selectedNodeId !== null) state.deleteNode(state.selectedNodeId);
  });
  bindHistoryCommands(registry, getState);
}
