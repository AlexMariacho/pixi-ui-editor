import { describe, expect, it } from "vitest";
import { validateProjectDocument } from "@pixi-ui-editor/schema";
import { lookupAssetUrl, registerAssetUrl } from "../shared/assetUrlRegistry.js";
import { buildEditorJson } from "../shared/editorJson.js";
import { useEditorStore } from "./index.js";
import { imageNodeId, initialDocument } from "./test-utils.js";
import { applyWorkspaceSnapshot } from "./workspace.slice.js";

describe("createNewProject", () => {
  it("builds a fresh valid document with a new manifest and an unbound, dirty working copy", async () => {
    await useEditorStore.getState().createNewProject("My New Project");

    const state = useEditorStore.getState();
    expect(validateProjectDocument(state.document).valid).toBe(true);
    expect(state.document.project.name).toBe("My New Project");
    expect(state.document.project.id).not.toBe(initialDocument.project.id);
    expect(state.document.assets).toHaveLength(0);
    expect(state.document.scenes).toHaveLength(1);
    expect(state.document.scenes[0]!.nodes).toHaveLength(1);
    expect(state.document.scenes[0]!.nodes[0]).toMatchObject({ type: "container", parentId: null, children: [] });

    expect(state.manifest).toMatchObject({ formatVersion: 1, name: "My New Project" });
    expect(state.folderName).toBeNull();
    expect(state.dirty).toBe(true);
    expect(state.projectOpen).toBe(true);
  });
});

describe("applyWorkspaceSnapshot (New/Open project switch)", () => {
  it("resets selection/editing/transient state and leaves no asset-resolver entries from the previous project", async () => {
    // Pollute the store as if the previous project had a selection, an in-progress preset edit, and an
    // authoring-only transient record, then register a blob URL as if it belonged to that project's asset.
    useEditorStore.getState().selectNode(imageNodeId);
    useEditorStore.setState({ editingPrefabId: "stale-prefab", spineFrameRequests: { "stale-node": 12 }, historyGestureActive: true });
    registerAssetUrl("assets/stale-asset/old.png", "blob:stale-project-asset");
    expect(useEditorStore.getState().selectedNodeIds).not.toHaveLength(0);

    const document = structuredClone(initialDocument);
    document.project = { ...document.project, name: "Switched Project" };
    const editorState = buildEditorJson(document.scenes[0]!.id, "desktop");

    await applyWorkspaceSnapshot(useEditorStore.getState, useEditorStore.setState, {
      document,
      manifest: { formatVersion: 1, projectId: document.project.id, name: "Switched Project", createdAt: "2026-01-01T00:00:00.000Z", editorVersion: "0.0.0" },
      editorState,
      assetBlobs: new Map(),
      folderHandle: undefined,
      folderName: "switched-project-folder",
      dirty: false,
    });

    const state = useEditorStore.getState();
    expect(state.projectOpen).toBe(true);
    expect(state.document.project.name).toBe("Switched Project");
    expect(state.selectedNodeIds).toEqual([]);
    expect(state.selectedNodeId).toBeNull();
    expect(state.editingPrefabId).toBeNull();
    expect(state.historyGestureActive).toBe(false);
    expect(state.spineFrameRequests).toEqual({});
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
    expect(state.folderName).toBe("switched-project-folder");
    expect(state.dirty).toBe(false);
    expect(lookupAssetUrl("assets/stale-asset/old.png")).toBeUndefined();
  });
});
