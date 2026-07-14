import { afterEach, describe, expect, it, vi } from "vitest";
import { createStableId, validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";

const initialDocument = structuredClone(useEditorStore.getState().document);
const imageNodeId = "10000000-0000-4000-8000-000000000004";
const textNodeId = "10000000-0000-4000-8000-000000000006";

afterEach(() => {
  useEditorStore.setState({
    document: structuredClone(initialDocument),
    sceneId: initialDocument.scenes[0]!.id,
    activeProfile: "desktop",
    selectedNodeId: null,
  });
});

describe("addNode", () => {
  it("adds a valid node to the selected container", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("text");

    const document = useEditorStore.getState().document;
    const scene = document.scenes[0]!;
    const addedNode = scene.nodes.find((node) => !initialDocument.scenes[0]!.nodes.some((initialNode) => initialNode.id === node.id));

    expect(addedNode).toMatchObject({ type: "text", name: "Text 2", parentId: rootNodeId, text: "New text" });
    expect(scene.nodes.find((node) => node.id === rootNodeId)?.children).toContain(addedNode?.id);
    expect(validateProjectDocument(document).valid).toBe(true);
  });
});

describe("addImageAsset", () => {
  it("adds a valid uploaded asset and rejects an asset with an empty URI", () => {
    useEditorStore.getState().addImageAsset("Uploaded", { uri: "data:image/png;base64,AAAA", mediaType: "image/png" });

    expect(useEditorStore.getState().document.assets).toContainEqual(expect.objectContaining({
      name: "Uploaded",
      type: "image",
      source: { uri: "data:image/png;base64,AAAA", mediaType: "image/png" },
    }));

    const beforeInvalidAsset = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().addImageAsset("Invalid", { uri: "", mediaType: "image/png" });

    expect(useEditorStore.getState().document).toEqual(beforeInvalidAsset);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("setImageNodeAsset", () => {
  it("changes Logo to an existing image asset and rejects a missing asset", () => {
    useEditorStore.getState().addImageAsset("Uploaded", { uri: "data:image/png;base64,AAAA", mediaType: "image/png" });
    const uploadedAssetId = useEditorStore.getState().document.assets.at(-1)!.id;

    useEditorStore.getState().setImageNodeAsset(imageNodeId, uploadedAssetId);
    expect(useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === imageNodeId)).toMatchObject({ assetId: uploadedAssetId });

    const beforeMissingAsset = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().setImageNodeAsset(imageNodeId, createStableId());

    expect(useEditorStore.getState().document).toEqual(beforeMissingAsset);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("asset source replacement and deletion", () => {
  it("replaces an asset source while preserving its ID", () => {
    const asset = useEditorStore.getState().document.assets[0]!;

    useEditorStore.getState().replaceAssetSource(asset.id, { uri: "data:image/png;base64,BBBB", mediaType: "image/png" });

    expect(useEditorStore.getState().document.assets[0]).toMatchObject({
      id: asset.id,
      source: { uri: "data:image/png;base64,BBBB", mediaType: "image/png", version: expect.any(String) },
    });
  });

  it("rejects deleting an asset in use, then deletes it after its last referencing node is removed", () => {
    const assetId = useEditorStore.getState().document.assets[0]!.id;
    const beforeDeletion = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().deleteAsset(assetId);
    expect(useEditorStore.getState().document).toEqual(beforeDeletion);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    useEditorStore.getState().deleteNode(imageNodeId);
    useEditorStore.getState().deleteAsset(assetId);
    expect(useEditorStore.getState().document.assets.some((asset) => asset.id === assetId)).toBe(false);
  });
});

describe("deleteNode", () => {
  it("deletes an entire subtree from both nodes and parent children", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    useEditorStore.getState().selectNode(rootNodeId);
    useEditorStore.getState().addNode("container");
    const containerId = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!.id;
    useEditorStore.getState().selectNode(containerId);
    useEditorStore.getState().addNode("text");
    const childId = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!.id;

    useEditorStore.getState().deleteNode(containerId);

    const state = useEditorStore.getState();
    const scene = state.document.scenes[0]!;
    expect(scene.nodes.some((node) => node.id === containerId || node.id === childId)).toBe(false);
    expect(scene.nodes.find((node) => node.id === rootNodeId)?.children).not.toContain(containerId);
    expect(state.selectedNodeId).toBeNull();
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("does not delete the last root node", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    const before = structuredClone(useEditorStore.getState().document);

    useEditorStore.getState().deleteNode(rootNodeId);

    expect(useEditorStore.getState().document).toEqual(before);
  });
});

describe("updateNode", () => {
  it("updates valid fields and rejects a patch that invalidates the document", () => {
    const store = useEditorStore.getState();
    store.updateNode(imageNodeId, { name: "Updated logo" });
    store.updateNodeProfileTransform(imageNodeId, { x: 42 });

    const updated = useEditorStore.getState().document.scenes[0]!.nodes[1]!;
    expect(updated.name).toBe("Updated logo");
    expect(updated.transform.x).toBe(42);

    const documentBeforeInvalidPatch: ProjectDocument = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().updateNodeProfileTransform(imageNodeId, { width: 0 });

    expect(useEditorStore.getState().document).toEqual(documentBeforeInvalidPatch);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("updateReferenceViewport", () => {
  it("updates a valid mobile viewport and rejects an invalid one without changing the store", () => {
    useEditorStore.getState().updateReferenceViewport("mobile", { width: 500, height: 900 });
    expect(useEditorStore.getState().document.scenes[0]!.layout.referenceViewports.mobile).toEqual({ width: 500, height: 900 });

    const beforeInvalidUpdate = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useEditorStore.getState().updateReferenceViewport("mobile", { width: 0, height: 900 });

    expect(useEditorStore.getState().document).toEqual(beforeInvalidUpdate);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("updateNodeProfileTransform", () => {
  it("writes a partial mobile override without changing the base transform, then writes to the base in desktop", () => {
    const baseX = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === textNodeId)!.transform.x;

    useEditorStore.setState({ activeProfile: "mobile" });
    useEditorStore.getState().updateNodeProfileTransform(textNodeId, { x: 10 });

    const mobileNode = useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === textNodeId)!;
    expect(mobileNode.transform.x).toBe(baseX);
    expect(mobileNode.layoutOverrides?.mobile?.transform).toEqual({ x: 10 });

    useEditorStore.setState({ activeProfile: "desktop" });
    useEditorStore.getState().updateNodeProfileTransform(textNodeId, { x: 20 });

    expect(useEditorStore.getState().document.scenes[0]!.nodes.find((node) => node.id === textNodeId)!.transform.x).toBe(20);
  });
});

describe("setNodeOrientationVisibility", () => {
  it("writes false to a mobile override and removes the visible key and empty overrides when re-enabled", () => {
    useEditorStore.getState().setNodeOrientationVisibility(textNodeId, "mobile", false);

    let node = useEditorStore.getState().document.scenes[0]!.nodes.find((candidate) => candidate.id === textNodeId)!;
    expect(node.layoutOverrides?.mobile?.visible).toBe(false);
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);

    useEditorStore.getState().setNodeOrientationVisibility(textNodeId, "mobile", true);

    node = useEditorStore.getState().document.scenes[0]!.nodes.find((candidate) => candidate.id === textNodeId)!;
    expect(node.layoutOverrides).toBeUndefined();
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);
  });
});
