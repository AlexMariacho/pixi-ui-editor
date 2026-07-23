import { describe, expect, it, vi } from "vitest";
import { CURRENT_SCHEMA_VERSION, serializeProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { createProjectStore } from "./index.js";
import { createMemoryProjectStoreBackend } from "./memoryBackend.js";
import { migrateLocalStorageDocument } from "./migration.js";

const imageAssetId = "50000000-0000-4000-8000-000000000001";
const sceneId = "50000000-0000-4000-8000-000000000002";
const rootId = "50000000-0000-4000-8000-000000000003";

function legacyDocument(): ProjectDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: { id: "50000000-0000-4000-8000-000000000000", name: "Legacy Project" },
    settings: { layoutProfileSelection: { mode: "aspect-ratio", mobileMaxAspectRatio: 1 } },
    assets: [{ id: imageAssetId, name: "Logo", type: "image", source: { uri: "data:image/png;base64,AAAA", mediaType: "image/png" } }],
    effects: [],
    prefabs: [],
    scenes: [{
      id: sceneId,
      name: "Main",
      rootNodeIds: [rootId],
      layout: { referenceViewports: { desktop: { width: 100, height: 100 }, mobile: { width: 100, height: 100 } } },
      nodes: [{ id: rootId, name: "Root", type: "container", parentId: null, children: [], visible: true, transform: { x: 0, y: 0, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0 } }],
    }],
  };
}

/** The same resolution rule `shared/assets.ts`'s `resolveFileUrl` uses for data URIs. */
const resolveFileUrl = (uri: string) => (uri.startsWith("data:") ? uri : undefined);

describe("migrateLocalStorageDocument", () => {
  it("turns a data-URI asset into a relative path plus a stored Blob, then clears the localStorage key", async () => {
    const store = createProjectStore(createMemoryProjectStoreBackend());
    const clear = vi.fn();

    const result = await migrateLocalStorageDocument(store, () => serializeProjectDocument(legacyDocument()), clear, resolveFileUrl);

    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") throw new Error("unreachable");
    const asset = result.document.assets[0]!;
    expect(asset.type === "image" && asset.source.uri).toBe(`assets/${imageAssetId}/Logo.png`);
    expect(serializeProjectDocument(result.document)).not.toContain("data:");
    expect(clear).toHaveBeenCalledOnce();

    const snapshot = await store.loadSnapshot();
    expect(snapshot.document).toEqual(result.document);
    expect(snapshot.manifest).toMatchObject({ formatVersion: 1, name: "Legacy Project" });
    expect(snapshot.assetBlobs.get(`assets/${imageAssetId}/Logo.png`)).toBeInstanceOf(Blob);
  });

  it("leaves a corrupt localStorage document untouched instead of destroying it", async () => {
    const store = createProjectStore(createMemoryProjectStoreBackend());
    const clear = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await migrateLocalStorageDocument(store, () => "{ not json", clear, resolveFileUrl);

    expect(result.kind).toBe("failed");
    expect(clear).not.toHaveBeenCalled();
    expect((await store.loadSnapshot()).document).toBeUndefined();
    warn.mockRestore();
  });
});
