import { describe, expect, it } from "vitest";
import { groupSpineFileBundles } from "./spineImport.js";

describe("groupSpineFileBundles", () => {
  it("separates several Spine bundles from one file selection", () => {
    const files = ["hero.json", "hero.atlas", "hero.png", "enemy.json", "enemy.atlas", "enemy_0.png", "logo.png"].map((name) => ({ name }));

    const result = groupSpineFileBundles(files);

    expect(result.error).toBeUndefined();
    expect(result.bundles.map((bundle) => ({ name: bundle.name, textures: bundle.textures.map((texture) => texture.name) }))).toEqual([
      { name: "hero", textures: ["hero.png"] },
      { name: "enemy", textures: ["enemy_0.png"] },
    ]);
    expect(result.remaining.map((file) => file.name)).toEqual(["logo.png"]);
  });

  it("reports an incomplete bundle instead of assigning files from another Spine asset", () => {
    const result = groupSpineFileBundles(["hero.json", "hero.atlas", "enemy.json", "enemy.atlas", "enemy.png"].map((name) => ({ name })));

    expect(result.error).toContain("hero");
  });

  it("keeps arbitrary texture-page names working for a single bundle", () => {
    const result = groupSpineFileBundles(["hero.json", "hero.atlas", "page-a.png", "page-b.png"].map((name) => ({ name })));

    expect(result.error).toBeUndefined();
    expect(result.bundles[0]?.textures.map((file) => file.name)).toEqual(["page-a.png", "page-b.png"]);
  });
});
