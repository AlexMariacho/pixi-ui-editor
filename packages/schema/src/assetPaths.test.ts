import { describe, expect, it } from "vitest";
import { assetFilePath, collectAssetFileEntries, imageFileName } from "./assetPaths.js";
import type { Asset } from "./index.js";

const assetId = "30000000-0000-4000-8000-000000000001";

describe("asset file naming", () => {
  it("derives an image file name from the sanitized asset name and its mediaType extension", () => {
    expect(imageFileName({ name: "Hero Icon", source: { mediaType: "image/jpeg" } })).toBe("Hero-Icon.jpg");
    expect(assetFilePath(assetId, imageFileName({ name: "Hero Icon", source: { mediaType: "image/jpeg" } }))).toBe(`assets/${assetId}/Hero-Icon.jpg`);
  });

  it("keeps atlas/Spine file names as uploaded when composing their relative path, matching export output", () => {
    const atlas: Asset = {
      id: assetId,
      name: "Sparkle Sheet",
      type: "atlas",
      files: {
        json: { name: "sparkles.json", uri: "assets/sparkles.json", mediaType: "application/json" },
        texture: { name: "sparkles.png", uri: "assets/sparkles.png", mediaType: "image/png" },
      },
      frames: {},
    };
    expect(collectAssetFileEntries(atlas)).toEqual([
      { path: `assets/${assetId}/sparkles.json`, fileName: "sparkles.json", mediaType: "application/json" },
      { path: `assets/${assetId}/sparkles.png`, fileName: "sparkles.png", mediaType: "image/png" },
    ]);
  });
});
