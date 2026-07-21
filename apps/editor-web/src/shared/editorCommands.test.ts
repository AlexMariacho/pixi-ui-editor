import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_KEY_BINDINGS,
  EDITOR_COMMAND_IDS,
  EditorCommandRegistry,
  dispatchEditorKeyboardEvent,
  editorCommandRegistry,
  type EditorKeyBindings,
} from "./editorCommands.js";
import { useEditorStore } from "../store/index.js";
import { imageNodeId, initialDocument } from "../store/test-utils.js";

const keyboardEvent = (key: string) => ({
  key,
  code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
});

describe("editor command key bindings", () => {
  it("resolves commands through replaceable bindings", () => {
    const customBindings: EditorKeyBindings = {
      ...DEFAULT_EDITOR_KEY_BINDINGS,
      [EDITOR_COMMAND_IDS.panTool]: [{ key: "p", label: "P" }],
    };
    const registry = new EditorCommandRegistry(() => useEditorStore.getState(), customBindings);

    expect(registry.resolveKeyboardEvent(keyboardEvent("p"))).toBe(EDITOR_COMMAND_IDS.panTool);
    expect(registry.resolveKeyboardEvent(keyboardEvent("q"))).toBeUndefined();
  });

  it("dispatches Delete through the same command used by the UI", () => {
    useEditorStore.getState().selectNode(imageNodeId);

    expect(editorCommandRegistry.dispatchKeyboardEvent(keyboardEvent("Delete"))).toBe(true);
    expect(useEditorStore.getState().document.scenes[0]!.nodes.some((node) => node.id === imageNodeId)).toBe(false);
    expect(useEditorStore.getState().document).not.toEqual(initialDocument);
  });

  it("maps Ctrl+Z and both redo shortcuts to history commands", () => {
    useEditorStore.getState().updateNode(imageNodeId, { name: "Changed" });
    let prevented = false;

    expect(dispatchEditorKeyboardEvent({ ...keyboardEvent("z"), ctrlKey: true, target: null, preventDefault: () => { prevented = true; } })).toBe(true);
    expect(prevented).toBe(true);
    expect(useEditorStore.getState().document).toEqual(initialDocument);
    expect(editorCommandRegistry.dispatchKeyboardEvent({ ...keyboardEvent("y"), ctrlKey: true })).toBe(true);
    expect(useEditorStore.getState().document).not.toEqual(initialDocument);
    expect(editorCommandRegistry.resolveKeyboardEvent({ ...keyboardEvent("z"), ctrlKey: true, shiftKey: true })).toBe(EDITOR_COMMAND_IDS.redo);
  });

  it("matches editor shortcuts by physical key when the active keyboard layout changes the character", () => {
    expect(editorCommandRegistry.resolveKeyboardEvent({ ...keyboardEvent("я"), code: "KeyZ", ctrlKey: true })).toBe(EDITOR_COMMAND_IDS.undo);
    expect(editorCommandRegistry.resolveKeyboardEvent({ ...keyboardEvent("й"), code: "KeyQ" })).toBe(EDITOR_COMMAND_IDS.panTool);
  });
});
