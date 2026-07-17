import { describe, expect, it, vi } from "vitest";
import { createStableId, validateProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "./index.js";
import { loadUiPrefs, UI_PREFS_STORAGE_KEY } from "../uiPrefs.js";
import { imageNodeId } from "./test-utils.js";

describe("loadUiPrefs", () => {
  it("returns safe defaults without throwing when localStorage contains invalid JSON", () => {
    const items = new Map<string, string>([[UI_PREFS_STORAGE_KEY, "{"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    });

    expect(loadUiPrefs()).toMatchObject({
      assetsWindowOpen: false,
      assetsViewMode: "list",
      presetsWindowOpen: false,
    });
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
    const rootNodeId = scene.rootNodeIds[0]!;
    expect(node).toMatchObject({ type: "spine", assetId: asset.id, parentId: rootNodeId, transform: { x: 123.45, y: 67.89, width: 200, height: 200 } });
    expect(scene.nodes.find((candidate) => candidate.id === rootNodeId)?.children).toContain(node.id);
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
