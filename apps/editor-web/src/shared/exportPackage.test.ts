import { describe, expect, it } from "vitest";
import { parseProjectDocumentJson } from "@pixi-ui-editor/runtime-pixi";
import { CURRENT_SCHEMA_VERSION, serializeProjectDocument, validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { strFromU8, unzipSync } from "fflate";
import { buildExportEntries, buildProjectPackageBlob } from "./exportPackage.js";

const imageAssetId = "20000000-0000-4000-8000-000000000001";
const spineAssetId = "20000000-0000-4000-8000-000000000002";

const sourceDocument: ProjectDocument = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  project: { id: "20000000-0000-4000-8000-000000000000", name: "Export Fixture" },
  settings: { layoutProfileSelection: { mode: "aspect-ratio", mobileMaxAspectRatio: 1 } },
  assets: [
    { id: imageAssetId, name: "Hero Icon", type: "image", source: { uri: "data:image/png;base64,AAAA", mediaType: "image/png" } },
    {
      id: spineAssetId,
      name: "Hero",
      type: "spine",
      files: {
        skeleton: { name: "hero.json", uri: "data:application/json;base64,BBBB", mediaType: "application/json" },
        atlas: { name: "hero.atlas", uri: "data:text/plain;base64,CCCC", mediaType: "text/plain" },
        textures: [{ name: "hero.png", uri: "assets/hero.png", mediaType: "image/png" }],
      },
    },
  ],
  effects: [{
    id: "20000000-0000-4000-8000-000000000003", name: "Export particles", type: "particles", maxParticles: 8, seed: 7,
    emission: { delay: 0, duration: 1, loop: false, rate: 0, bursts: [{ time: 0, count: 1 }] },
    particle: {
      lifetime: { min: 1, max: 1 }, spawnShape: { type: "point" }, movement: { speed: { min: 0, max: 0 }, directionDegrees: 0, spreadDegrees: 0, accelerationX: 0, accelerationY: 0, drag: 0 },
      visual: { source: { type: "sequence", assetIds: [imageAssetId], fps: 12, loop: true, randomStartFrame: false }, alpha: { start: 1, end: 0 }, scale: { start: { min: 1, max: 1 }, end: { min: 1, max: 1 } }, tint: { start: "#FFFFFF", end: "#FFFFFF" }, rotation: { initialDegrees: { min: 0, max: 0 }, angularVelocityDegrees: { min: 0, max: 0 } }, blendMode: "normal" },
    },
  }],
  prefabs: [],
  scenes: [],
};

describe("buildExportEntries", () => {
  it("rewrites data: and relative URIs to assets/<assetId>/<fileName> and keeps the package document valid", () => {
    const { document, files } = buildExportEntries(sourceDocument, (uri) => (uri.startsWith("data:") ? uri : `https://resolved.example/${uri}`));

    const image = document.assets[0]!;
    const spine = document.assets[1]!;
    expect(image.type === "image" && image.source.uri).toBe(`assets/${imageAssetId}/Hero-Icon.png`);
    expect(spine.type === "spine" && spine.files.textures[0]!.uri).toBe(`assets/${spineAssetId}/hero.png`);
    expect(files).toEqual([
      { path: `assets/${imageAssetId}/Hero-Icon.png`, url: "data:image/png;base64,AAAA" },
      { path: `assets/${spineAssetId}/hero.json`, url: "data:application/json;base64,BBBB" },
      { path: `assets/${spineAssetId}/hero.atlas`, url: "data:text/plain;base64,CCCC" },
      { path: `assets/${spineAssetId}/hero.png`, url: "https://resolved.example/assets/hero.png" },
    ]);
    expect(validateProjectDocument(document).valid).toBe(true);
    expect(serializeProjectDocument(document)).not.toContain("data:");
    // Исходный документ не мутируется.
    expect(sourceDocument.assets[0]).toMatchObject({ source: { uri: "data:image/png;base64,AAAA" } });
  });

  it("builds a ZIP whose document can be loaded through the runtime boundary", async () => {
    const packageSource = structuredClone(sourceDocument);
    const spine = packageSource.assets[1]!;
    if (spine.type !== "spine") throw new Error("Expected the Spine export fixture.");
    spine.files.textures[0]!.uri = "data:image/png;base64,DDDD";

    const blob = await buildProjectPackageBlob(packageSource, (uri) => uri);
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const projectJson = archive["project.json"];

    expect(projectJson).toBeDefined();
    const loaded = parseProjectDocumentJson(strFromU8(projectJson!));
    expect(validateProjectDocument(loaded).valid).toBe(true);
    expect(loaded.effects[0]).toMatchObject({ type: "particles", particle: { visual: { source: { type: "sequence", assetIds: [imageAssetId] } } } });
    expect(Object.keys(archive).sort()).toEqual([
      `assets/${imageAssetId}/Hero-Icon.png`,
      `assets/${spineAssetId}/hero.atlas`,
      `assets/${spineAssetId}/hero.json`,
      `assets/${spineAssetId}/hero.png`,
      "project.json",
    ].sort());
  });
});
