import { afterEach, describe, expect, it, vi } from "vitest";
import { createStableId, validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./store.js";
import { loadUiPrefs, UI_PREFS_STORAGE_KEY } from "./uiPrefs.js";

const initialDocument = structuredClone(useEditorStore.getState().document);
const imageNodeId = "10000000-0000-4000-8000-000000000004";
const textNodeId = "10000000-0000-4000-8000-000000000006";

afterEach(() => {
  useEditorStore.setState({
    document: structuredClone(initialDocument),
    sceneId: initialDocument.scenes[0]!.id,
    activeProfile: "desktop",
    selectedNodeId: null,
    editingPrefabId: null,
  });
  vi.unstubAllGlobals();
});

describe("loadUiPrefs", () => {
  it("returns defaults without throwing when localStorage contains invalid JSON", () => {
    const items = new Map<string, string>([[UI_PREFS_STORAGE_KEY, "{"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    });

    expect(loadUiPrefs()).toEqual({
      assetsWindowOpen: false,
      assetsWindowPosition: { x: 16, y: 16 },
      assetsWindowSize: { width: 280, height: 360 },
      assetsViewMode: "list",
      presetsWindowOpen: false,
      presetsWindowPosition: { x: 16, y: 392 },
      presetsWindowSize: { width: 280, height: 280 },
    });
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

describe("Spine assets and nodes", () => {
  it("creates a Spine asset, node, and persisted animation selection", () => {
    useEditorStore.getState().addSpineAsset("Hero", {
      skeleton: { name: "hero.json", uri: "data:application/json;base64,e30=", mediaType: "application/json" },
      atlas: { name: "hero.atlas", uri: "data:text/plain;base64,", mediaType: "text/plain" },
      textures: [{ name: "hero.png", uri: "data:image/png;base64,AAAA", mediaType: "image/png" }],
    });
    const asset = useEditorStore.getState().document.assets.at(-1)!;
    useEditorStore.getState().addNode("spine");
    const node = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!;
    expect(node).toMatchObject({ type: "spine", assetId: asset.id, transform: { width: 200, height: 200 } });
    useEditorStore.getState().updateSpineNodeAnimation(node.id, "idle");
    useEditorStore.getState().updateSpineNodeLoop(node.id, false);
    expect(useEditorStore.getState().document.scenes[0]!.nodes.at(-1)).toMatchObject({ animation: "idle", loop: false });
    expect(validateProjectDocument(useEditorStore.getState().document).valid).toBe(true);
  });
});

describe("addNodeFromAsset", () => {
  it("creates a selected Spine node with the dropped asset ID", () => {
    useEditorStore.getState().addSpineAsset("Hero", {
      skeleton: { name: "hero.json", uri: "data:application/json;base64,e30=", mediaType: "application/json" },
      atlas: { name: "hero.atlas", uri: "data:text/plain;base64,", mediaType: "text/plain" },
      textures: [{ name: "hero.png", uri: "data:image/png;base64,AAAA", mediaType: "image/png" }],
    });
    const asset = useEditorStore.getState().document.assets.at(-1)!;

    useEditorStore.getState().addNodeFromAsset(asset.id, { x: 123.45, y: 67.89 });

    const scene = useEditorStore.getState().document.scenes[0]!;
    const node = scene.nodes.at(-1)!;
    expect(node).toMatchObject({ type: "spine", assetId: asset.id, parentId: null, transform: { x: 123.45, y: 67.89, width: 200, height: 200 } });
    expect(scene.rootNodeIds.at(-1)).toBe(node.id);
    expect(useEditorStore.getState().selectedNodeId).toBe(node.id);
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

describe("scenes", () => {
  it("addScene creates a valid document with two windows and activates the new one", () => {
    useEditorStore.getState().addScene();

    const state = useEditorStore.getState();
    expect(state.document.scenes).toHaveLength(2);
    const addedScene = state.document.scenes[1]!;
    expect(addedScene).toMatchObject({ name: "Window 2", rootNodeIds: [], nodes: [] });
    expect(addedScene.layout.referenceViewports).toEqual(initialDocument.scenes[0]!.layout.referenceViewports);
    expect(state.sceneId).toBe(addedScene.id);
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("deleteScene rejects deleting the last window", () => {
    const sceneId = useEditorStore.getState().document.scenes[0]!.id;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().deleteScene(sceneId);

    expect(useEditorStore.getState().document.scenes).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

describe("prefabs", () => {
  it("createPrefabFromNode creates a valid preset copy and leaves the source subtree untouched", () => {
    const rootNodeId = initialDocument.scenes[0]!.rootNodeIds[0]!;
    const sourceRoot = initialDocument.scenes[0]!.nodes.find((node) => node.id === rootNodeId)!;

    const error = useEditorStore.getState().createPrefabFromNode(rootNodeId);

    expect(error).toBeNull();
    const state = useEditorStore.getState();
    const prefab = state.document.prefabs.at(-1)!;
    const prefabRoot = prefab.nodes.find((node) => node.id === prefab.rootNodeIds[0])!;
    expect(prefab.name).toBe(sourceRoot.name);
    expect(prefab.exposedProperties).toEqual([]);
    expect(prefabRoot).toMatchObject({ parentId: null, transform: expect.objectContaining({ x: 0, y: 0 }) });
    expect(prefab.nodes.some((node) => initialDocument.scenes[0]!.nodes.some((sourceNode) => sourceNode.id === node.id))).toBe(false);
    expect(state.document.scenes).toEqual(initialDocument.scenes);
    expect(validateProjectDocument(state.document).valid).toBe(true);
  });

  it("createPrefabFromNode rejects a subtree that contains a preset instance", () => {
    useEditorStore.getState().createPrefabFromNode(textNodeId);
    const prefabId = useEditorStore.getState().document.prefabs.at(-1)!.id;
    useEditorStore.getState().addPrefabInstance(prefabId, { x: 10, y: 20 });
    const instanceNode = useEditorStore.getState().document.scenes[0]!.nodes.at(-1)!;
    expect(instanceNode).toMatchObject({ type: "prefab-instance", prefabId });
    const beforeRejectedCreation = structuredClone(useEditorStore.getState().document);

    const error = useEditorStore.getState().createPrefabFromNode(instanceNode.id);

    expect(error).not.toBeNull();
    expect(useEditorStore.getState().document).toEqual(beforeRejectedCreation);
  });

  it("deletePrefab is rejected while an instance of the preset exists", () => {
    useEditorStore.getState().createPrefabFromNode(textNodeId);
    const prefabId = useEditorStore.getState().document.prefabs.at(-1)!.id;
    useEditorStore.getState().addPrefabInstance(prefabId, { x: 0, y: 0 });
    const beforeRejectedDeletion = structuredClone(useEditorStore.getState().document);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useEditorStore.getState().deletePrefab(prefabId);

    expect(useEditorStore.getState().document).toEqual(beforeRejectedDeletion);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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
