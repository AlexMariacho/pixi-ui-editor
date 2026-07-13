import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";

const initialDocument = structuredClone(useEditorStore.getState().document);
const imageNodeId = "10000000-0000-4000-8000-000000000004";

afterEach(() => {
  useEditorStore.setState({ document: structuredClone(initialDocument), selectedNodeId: null });
});

describe("updateNode", () => {
  it("updates valid fields and rejects a patch that invalidates the document", () => {
    const store = useEditorStore.getState();
    store.updateNode(imageNodeId, { name: "Updated logo", transform: { ...store.document.scenes[0]!.nodes[1]!.transform, x: 42 } });

    const updated = useEditorStore.getState().document.scenes[0]!.nodes[1]!;
    expect(updated.name).toBe("Updated logo");
    expect(updated.transform.x).toBe(42);

    const documentBeforeInvalidPatch: ProjectDocument = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().updateNode(imageNodeId, { transform: { ...updated.transform, width: 0 } });

    expect(useEditorStore.getState().document).toEqual(documentBeforeInvalidPatch);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
