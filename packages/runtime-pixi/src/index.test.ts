import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeProjectDocument } from "@pixi-ui-editor/schema";
import { Sprite, Texture } from "pixi.js";
import { TextureAtlas } from "@esotericsoftware/spine-pixi-v8";
import { assignAtlasPageTextures, buildSceneView, fitSpineToTransform, parseProjectDocumentJson, ProjectDocumentJsonParseError, resolveProfileForViewport, resolveProfileTransform } from "./index.js";

const sampleUrl = new URL("../../../examples/sample-project/project.json", import.meta.url);
const sampleJson = readFileSync(sampleUrl, "utf8");
const ids = {
  scene: "10000000-0000-4000-8000-000000000002",
  root: "10000000-0000-4000-8000-000000000003",
  image: "10000000-0000-4000-8000-000000000004",
  asset: "10000000-0000-4000-8000-000000000005",
  text: "10000000-0000-4000-8000-000000000006",
};
const clone = <T>(value: T): T => structuredClone(value);

describe("sample project loader smoke test", () => {
  it("matches atlas pages to texture files by name", () => {
    const atlas = new TextureAtlas("second.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n\nfirst.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n");
    assignAtlasPageTextures(atlas, new Map([["first.png", Texture.WHITE], ["second.png", Texture.WHITE]]));
    expect(atlas.pages.every((page) => page.texture !== null)).toBe(true);
  });
  it("resolves base transforms, partial desktop overrides, and profile visibility", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const node = document.scenes[0]!.nodes[1]!;

    expect(resolveProfileTransform(node, "desktop")).toEqual({ transform: node.transform, visible: true });

    const withDesktopOverride = clone(node);
    withDesktopOverride.layoutOverrides = { desktop: { transform: { x: 12, scaleY: 2 } } };
    expect(resolveProfileTransform(withDesktopOverride, "desktop")).toEqual({
      transform: { ...node.transform, x: 12, scaleY: 2 },
      visible: true,
    });

    withDesktopOverride.layoutOverrides.desktop!.visible = false;
    expect(resolveProfileTransform(withDesktopOverride, "desktop").visible).toBe(false);
  });

  it("resolves the viewport profile on both sides of the breakpoint and picks mobile exactly on it", () => {
    const settings = { layoutProfileSelection: { mode: "aspect-ratio" as const, mobileMaxAspectRatio: 1 } };

    expect(resolveProfileForViewport(settings, 1920, 1080)).toBe("desktop");
    expect(resolveProfileForViewport(settings, 390, 844)).toBe("mobile");
    expect(resolveProfileForViewport(settings, 1000, 1000)).toBe("mobile");
  });

  it("fits Spine setup bounds to the node transform dimensions", () => {
    const transform = { x: 0, y: 0, width: 200, height: 200, scaleX: 1, scaleY: 1, rotation: 0 };

    expect(fitSpineToTransform({ x: -50, y: 20, width: 100, height: 400 }, transform)).toEqual({ scaleX: 2, scaleY: 0.5, x: 100, y: -10 });
    expect(fitSpineToTransform({ x: 0, y: 0, width: 0, height: 400 }, transform)).toBeUndefined();
  });

  it("uses supplied textures for image nodes and otherwise preserves the placeholder", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const textured = buildSceneView(document, ids.scene, "desktop", new Map([[ids.asset, Texture.WHITE]]));
    const sprite = textured.nodeViews.get(ids.image);
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite?.width).toBe(320);

    const placeholder = buildSceneView(document, ids.scene, "desktop").nodeViews.get(ids.image);
    expect(placeholder).not.toBeInstanceOf(Sprite);
  });

  it("loads the repository fixture through migration and validation", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const scene = document.scenes[0]!;
    expect(scene.id).toBe(ids.scene);
    expect(scene.rootNodeIds).toEqual([ids.root]);
    expect(scene.nodes.find((node) => node.id === ids.image && node.type === "image")).toMatchObject({ assetId: ids.asset });
    expect(scene.nodes.find((node) => node.id === ids.text)).toMatchObject({ binding: "welcomeLabel" });
    expect(scene.layout.referenceViewports).toHaveProperty("desktop");
    expect(scene.layout.referenceViewports).toHaveProperty("mobile");
  });

  it("round-trips deterministically while retaining semantic child order", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const serialized = serializeProjectDocument(document);
    const roundTripped = parseProjectDocumentJson(serialized);
    expect(roundTripped).toEqual(document);
    expect(serializeProjectDocument(roundTripped)).toBe(serialized);
    expect(roundTripped.scenes[0]!.nodes[0]!.children).toEqual([ids.image, ids.text]);
  });

  it("does not use display names as references", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const renamed = clone(document);
    renamed.scenes[0]!.nodes[1]!.name = "Renamed Logo";
    expect(parseProjectDocumentJson(serializeProjectDocument(renamed)).scenes[0]!.nodes[1]).toMatchObject({ id: ids.image, assetId: ids.asset });
  });

  it("surfaces schema validation codes through the JSON loading boundary", () => {
    const invalid = clone(parseProjectDocumentJson(sampleJson));
    (invalid.scenes[0]!.nodes[1] as { assetId: string }).assetId = ids.text;
    expect(() => parseProjectDocumentJson(JSON.stringify(invalid))).toThrow("MISSING_ASSET_REFERENCE");
  });

  it("distinguishes malformed JSON from schema errors", () => {
    expect(() => parseProjectDocumentJson("{not json")).toThrow(ProjectDocumentJsonParseError);
    const invalid = clone(parseProjectDocumentJson(sampleJson));
    delete (invalid.scenes[0]!.layout.referenceViewports as Record<string, unknown>).mobile;
    expect(() => parseProjectDocumentJson(JSON.stringify(invalid))).toThrow(TypeError);
  });
});
