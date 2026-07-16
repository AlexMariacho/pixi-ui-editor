import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { Sprite, Texture } from "pixi.js";
import { TextureAtlas } from "@esotericsoftware/spine-pixi-v8";
import { assignAtlasPageTextures, buildSceneView, fitSpineToTransform, parseProjectDocumentJson, ProjectDocumentJsonParseError, resolveAnchoredTransform, resolveProfileForViewport, resolveProfileTransform } from "./index.js";

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

  it("resolves normalized anchors against the parent rectangle", () => {
    const transform = { x: -160, y: -50, width: 320, height: 100, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 1 };
    expect(resolveAnchoredTransform(transform, { width: 1920, height: 1080 })).toMatchObject({ x: 800, y: 1030 });
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
    const imageView = textured.nodeViews.get(ids.image)!;
    const sprite = imageView.children[0];
    expect(imageView).not.toBeInstanceOf(Sprite);
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite?.width).toBe(320);

    const placeholder = buildSceneView(document, ids.scene, "desktop").nodeViews.get(ids.image)?.children[0];
    expect(placeholder).not.toBeInstanceOf(Sprite);

    const anchoredDocument = clone(document);
    const anchoredNode = anchoredDocument.scenes[0]!.nodes.find((node) => node.id === ids.image)!;
    anchoredNode.transform = { ...anchoredNode.transform, anchorX: 1, pivotX: 1, x: -anchoredNode.transform.width };
    const anchoredView = buildSceneView(anchoredDocument, ids.scene, "desktop", new Map([[ids.asset, Texture.WHITE]])).nodeViews.get(ids.image)!;
    const anchoredSprite = anchoredView.children[0] as Sprite;
    const renderedRight = anchoredView.position.x + (anchoredSprite.width - anchoredView.pivot.x) * anchoredView.scale.x;
    expect(renderedRight).toBe(anchoredDocument.scenes[0]!.layout.referenceViewports.desktop.width);

    const mobileNode = anchoredDocument.scenes[0]!.nodes.find((node) => node.id === ids.image)!;
    mobileNode.layoutOverrides!.mobile!.transform = { ...mobileNode.layoutOverrides!.mobile!.transform, anchorX: 1, pivotX: 1, x: -320 };
    const mobileView = buildSceneView(anchoredDocument, ids.scene, "mobile", new Map([[ids.asset, Texture.WHITE]])).nodeViews.get(ids.image)!;
    const mobileSprite = mobileView.children[0] as Sprite;
    const mobileRight = mobileView.position.x + (mobileSprite.width - mobileView.pivot.x) * mobileView.scale.x;
    expect(mobileRight).toBe(anchoredDocument.scenes[0]!.layout.referenceViewports.mobile.width);
  });

  it("applies identical layout coordinates to image, text, and Spine node containers", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const scene = document.scenes[0]!;
    const root = scene.nodes.find((node) => node.id === ids.root)!;
    const image = scene.nodes.find((node) => node.id === ids.image)!;
    const text = scene.nodes.find((node) => node.id === ids.text)!;
    const spineId = "10000000-0000-4000-8000-000000000007";
    const transform = { x: -240, y: -90, width: 320, height: 180, scaleX: 1.25, scaleY: 0.75, rotation: 0.2, anchorX: 1, anchorY: 0.5, pivotX: 0.75, pivotY: 0.5 };
    image.transform = { ...transform };
    text.transform = { ...transform };
    const spine: UINode = { id: spineId, name: "Spine", type: "spine", assetId: ids.asset, parentId: ids.root, children: [], visible: true, transform: { ...transform } };
    scene.nodes.push(spine);
    root.children.push(spineId);

    const views = buildSceneView(document, ids.scene, "desktop", new Map([[ids.asset, Texture.WHITE]])).nodeViews;
    const snapshot = (nodeId: string) => {
      const view = views.get(nodeId)!;
      return { position: { x: view.position.x, y: view.position.y }, pivot: { x: view.pivot.x, y: view.pivot.y }, scale: { x: view.scale.x, y: view.scale.y }, rotation: view.rotation };
    };

    expect(snapshot(ids.text)).toEqual(snapshot(ids.image));
    expect(snapshot(spineId)).toEqual(snapshot(ids.image));
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
