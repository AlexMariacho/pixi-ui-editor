import { describe, expect, it } from "vitest";
import { serializeProjectDocument, validateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";
import { buildExportEntries } from "./exportPackage.js";

const imageAssetId = "20000000-0000-4000-8000-000000000001";
const spineAssetId = "20000000-0000-4000-8000-000000000002";

const sourceDocument: ProjectDocument = {
  schemaVersion: 1,
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
});
