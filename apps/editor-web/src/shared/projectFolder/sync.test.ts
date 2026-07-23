import { describe, expect, it, vi } from "vitest";
import { CURRENT_SCHEMA_VERSION, type Asset, type ProjectDocument, type ProjectManifest } from "@pixi-ui-editor/schema";
import { buildEditorJson } from "../editorJson.js";
import { createMemoryProjectFolderHandle } from "./memoryHandle.js";
import { readProjectFolder, writeProjectFolder } from "./sync.js";
import { ProjectFolderError } from "./types.js";

const sceneId = "60000000-0000-4000-8000-000000000001";
const rootId = "60000000-0000-4000-8000-000000000002";

function imageAsset(id: string, name: string): Asset {
  return { id, name, type: "image", source: { uri: `assets/${id}/${name}.png`, mediaType: "image/png" } };
}

function buildDocument(assets: Asset[]): ProjectDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: { id: "60000000-0000-4000-8000-000000000000", name: "Round Trip Project" },
    settings: { layoutProfileSelection: { mode: "aspect-ratio", mobileMaxAspectRatio: 1 } },
    assets,
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

function buildManifest(): ProjectManifest {
  return { formatVersion: 1, projectId: "60000000-0000-4000-8000-0000000000ff", name: "Round Trip Project", createdAt: "2026-01-01T00:00:00.000Z", editorVersion: "0.0.0" };
}

async function textOf(blob: Blob): Promise<string> {
  return blob.text();
}

describe("projectFolder sync", () => {
  it("round-trips Save -> Open (document, manifest, editorState, asset bytes), and a repeat Save changes no file", async () => {
    const assetId = "60000000-0000-4000-8000-000000000010";
    const document = buildDocument([imageAsset(assetId, "Logo")]);
    const manifest = buildManifest();
    const editorState = buildEditorJson(sceneId, "desktop");
    const assetBlobs = new Map([[`assets/${assetId}/Logo.png`, new Blob(["PNGDATA"], { type: "image/png" })]]);

    const handle = createMemoryProjectFolderHandle();
    await writeProjectFolder(handle, { document, manifest, editorState, assetBlobs });

    const opened = await readProjectFolder(handle, { editorVersion: "0.0.0" });
    expect(opened.manifestRegenerated).toBe(false);
    expect(opened.snapshot.document).toEqual(document);
    expect(opened.snapshot.manifest).toEqual(manifest);
    expect(opened.snapshot.editorState).toEqual(editorState);
    expect(await textOf(opened.snapshot.assetBlobs.get(`assets/${assetId}/Logo.png`)!)).toBe("PNGDATA");

    const beforeRepeat = new Map([...handle.files].map(([path, blob]) => [path, blob]));
    const beforeRepeatBytes = await Promise.all([...beforeRepeat].map(async ([path, blob]) => [path, await textOf(blob)] as const));

    await writeProjectFolder(handle, { document, manifest, editorState, assetBlobs });

    expect([...handle.files.keys()].sort()).toEqual([...beforeRepeat.keys()].sort());
    for (const [path, text] of beforeRepeatBytes) {
      expect(await textOf(handle.files.get(path)!)).toBe(text);
    }
  });

  it("deletes an asset's files from assets/ once it's removed from the document, but leaves a stray root file untouched", async () => {
    const keptId = "60000000-0000-4000-8000-000000000020";
    const removedId = "60000000-0000-4000-8000-000000000021";
    const kept = imageAsset(keptId, "Kept");
    const removed = imageAsset(removedId, "Removed");
    const editorState = buildEditorJson(sceneId, "desktop");
    const manifest = buildManifest();

    const handle = createMemoryProjectFolderHandle("memory-project", { "README.md": new Blob(["hello"], { type: "text/plain" }) });

    await writeProjectFolder(handle, {
      document: buildDocument([kept, removed]),
      manifest,
      editorState,
      assetBlobs: new Map([
        [`assets/${keptId}/Kept.png`, new Blob(["KEPT"], { type: "image/png" })],
        [`assets/${removedId}/Removed.png`, new Blob(["REMOVED"], { type: "image/png" })],
      ]),
    });
    expect(handle.files.has(`assets/${keptId}/Kept.png`)).toBe(true);
    expect(handle.files.has(`assets/${removedId}/Removed.png`)).toBe(true);

    await writeProjectFolder(handle, {
      document: buildDocument([kept]),
      manifest,
      editorState,
      assetBlobs: new Map([[`assets/${keptId}/Kept.png`, new Blob(["KEPT"], { type: "image/png" })]]),
    });

    expect(handle.files.has(`assets/${keptId}/Kept.png`)).toBe(true);
    expect(handle.files.has(`assets/${removedId}/Removed.png`)).toBe(false);
    expect(await textOf(handle.files.get("README.md")!)).toBe("hello");
  });

  it("rejects Open when a referenced asset file is missing, with the exact list of missing paths", async () => {
    const assetId = "60000000-0000-4000-8000-000000000030";
    const document = buildDocument([imageAsset(assetId, "Logo")]);
    const manifest = buildManifest();
    const editorState = buildEditorJson(sceneId, "desktop");

    const handle = createMemoryProjectFolderHandle();
    // Write everything except the asset file itself (simulates a folder someone tampered with / a partial copy).
    await handle.writeFile("project.json", new Blob([JSON.stringify(document)], { type: "application/json" }));
    await handle.writeFile("manifest.json", new Blob([JSON.stringify(manifest)], { type: "application/json" }));
    await handle.writeFile("editor.json", new Blob([JSON.stringify(editorState)], { type: "application/json" }));

    await expect(readProjectFolder(handle, { editorVersion: "0.0.0" })).rejects.toMatchObject({
      code: "MISSING_ASSET_FILES",
      missingPaths: [`assets/${assetId}/Logo.png`],
    });
  });

  it("regenerates the manifest when manifest.json is missing", async () => {
    const document = buildDocument([]);
    const editorState = buildEditorJson(sceneId, "desktop");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const handle = createMemoryProjectFolderHandle();
    await handle.writeFile("project.json", new Blob([JSON.stringify(document)], { type: "application/json" }));
    await handle.writeFile("editor.json", new Blob([JSON.stringify(editorState)], { type: "application/json" }));

    const opened = await readProjectFolder(handle, { editorVersion: "1.2.3" });

    expect(opened.manifestRegenerated).toBe(true);
    expect(opened.snapshot.manifest).toMatchObject({ formatVersion: 1, name: "Round Trip Project", editorVersion: "1.2.3" });
    expect(opened.snapshot.manifest.projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
