import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_KEY_BINDINGS,
  EDITOR_COMMAND_IDS,
  EditorCommandRegistry,
  editorCommandRegistry,
  type EditorKeyBindings,
} from "./editorCommands.js";
import { useEditorStore } from "./store.js";
import { imageNodeId, initialDocument } from "./store.test-utils.js";

const keyboardEvent = (key: string) => ({
  key,
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
});
