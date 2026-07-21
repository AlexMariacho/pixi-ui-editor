import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeProjectDocument, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { Container, Sprite, Texture } from "pixi.js";
import { TextureAtlas } from "@esotericsoftware/spine-pixi-v8";
import { assignAtlasPageTextures, buildSceneView, ButtonNodeView, fitSpineToTransform, NodeView, parseProjectDocumentJson, ProjectDocumentJsonParseError, resolveAnchoredTransform, resolveProfileForViewport, resolveProfileTransform } from "./index.js";
import { createNodeView } from "./views/createNodeView.js";
import { ContainerNodeView } from "./views/basic.js";

const sampleUrl = new URL("../../../examples/sample-project/project.json", import.meta.url);
const sampleJson = readFileSync(sampleUrl, "utf8");
const ids = {
  scene: "10000000-0000-4000-8000-000000000002",
  root: "10000000-0000-4000-8000-000000000003",
  image: "10000000-0000-4000-8000-000000000051",
  asset: "10000000-0000-4000-8000-000000000010",
  text: "10000000-0000-4000-8000-000000000006",
};
const clone = <T>(value: T): T => structuredClone(value);
const buttonIds = { node: "10000000-0000-4000-8000-000000000008", pressedAsset: "10000000-0000-4000-8000-000000000009" };

/** Rendering contracts use a DOM-free mini scene; the repository sample itself also exercises Yoga groups. */
function renderDocument(): ProjectDocument {
  const document = parseProjectDocumentJson(sampleJson);
  const scene = document.scenes[0]!;
  const root = scene.nodes.find((node) => node.id === ids.root)!;
  const image = scene.nodes.find((node) => node.id === ids.image)!;
  const text = scene.nodes.find((node) => node.id === ids.text)!;
  image.parentId = root.id;
  text.parentId = root.id;
  root.children = [image.id, text.id];
  scene.nodes = [root, image, text];
  return document;
}

/** Sample scene plus a button whose pressed state has its own image and whose hover/disabled states have none. */
function documentWithButton(): ProjectDocument {
  const document = renderDocument();
  const scene = document.scenes[0]!;
  const root = scene.nodes.find((node) => node.id === ids.root)!;
  document.assets.push({ id: buttonIds.pressedAsset, name: "Pressed", type: "image", source: { uri: "assets/pressed.png", mediaType: "image/png" } });
  scene.nodes.push({
    id: buttonIds.node,
    name: "Play",
    type: "button",
    parentId: ids.root,
    children: [],
    visible: true,
    enabled: true,
    states: { normalAssetId: ids.asset, pressedAssetId: buttonIds.pressedAsset },
    transform: { x: 0, y: 0, width: 120, height: 40, scaleX: 1, scaleY: 1, rotation: 0 },
  });
  root.children.push(buttonIds.node);
  return document;
}

type NodeBaseFields = Pick<Extract<UINode, { type: "container" }>, "id" | "name" | "parentId" | "children" | "visible" | "transform">;

/**
 * По одному узлу каждого типа, который можно вытащить на сцену.
 * `Record<UINode["type"], ...>` — намеренно: компилятор не даст добавить новый тип ноды,
 * не дописав его сюда, а значит новый тип не сможет молча потерять selection и drag.
 */
const NODE_TYPE_FIXTURES: Record<UINode["type"], (base: NodeBaseFields) => UINode> = {
  container: (base) => ({ ...base, type: "container" }),
  "horizontal-layout": (base) => ({ ...base, type: "horizontal-layout", layoutGroup: { base: { padding: { left: 0, right: 0, top: 0, bottom: 0 }, spacing: 0, childAlignment: "upper-left", reverseOrder: false, controlChildWidth: true, controlChildHeight: true, forceExpandWidth: false, forceExpandHeight: false } } }),
  "vertical-layout": (base) => ({ ...base, type: "vertical-layout", layoutGroup: { base: { padding: { left: 0, right: 0, top: 0, bottom: 0 }, spacing: 0, childAlignment: "upper-left", reverseOrder: false, controlChildWidth: true, controlChildHeight: true, forceExpandWidth: false, forceExpandHeight: false } } }),
  "grid-layout": (base) => ({ ...base, type: "grid-layout", layoutGroup: { base: { padding: { left: 0, right: 0, top: 0, bottom: 0 }, spacingX: 0, spacingY: 0, cellWidth: 20, cellHeight: 20, startCorner: "upper-left", startAxis: "horizontal", childAlignment: "upper-left", constraint: "flexible" } } }),
  image: (base) => ({ ...base, type: "image", assetId: ids.asset }),
  text: (base) => ({ ...base, type: "text", text: "Label" }),
  spine: (base) => ({ ...base, type: "spine", assetId: ids.asset }),
  button: (base) => ({ ...base, type: "button", enabled: true, states: { normalAssetId: ids.asset } }),
  "prefab-instance": (base) => ({ ...base, type: "prefab-instance", prefabId: "40000000-0000-4000-8000-00000000000f" }),
  "scroll-view": (base) => ({ ...base, type: "scroll-view", scrollView: { direction: "vertical", padding: { left: 0, right: 0, top: 0, bottom: 0 }, itemSpacing: 0, cornerRadius: 0, easingEnabled: true } }),
  input: (base) => ({ ...base, type: "input", placeholder: "Enter text", defaultValue: "", secure: false, align: "left", padding: { left: 0, right: 0, top: 0, bottom: 0 }, cleanOnFocus: false, clipText: true, textStyle: { fontFamily: "Arial", fontSize: 24, fontWeight: "normal", fontStyle: "normal", fill: "#FFFFFF", align: "left", verticalAlign: "top", wordWrap: false, breakWords: false, letterSpacing: 0 } }),
  slider: (base) => ({ ...base, type: "slider", backgroundAssetId: ids.asset, fillAssetId: ids.asset, handleAssetId: ids.asset, min: 0, max: 100, step: 1, defaultValue: 50, fillPadding: { left: 0, right: 0, top: 0, bottom: 0 } }),
  "progress-bar": (base) => ({ ...base, type: "progress-bar", backgroundAssetId: ids.asset, fillAssetId: ids.asset, defaultProgress: 50, fillPadding: { left: 0, right: 0, top: 0, bottom: 0 } }),
  "particle-emitter": (base) => ({ ...base, type: "particle-emitter", effectId: "40000000-0000-4000-8000-00000000000f", autoplay: true, simulationSpace: "local", stopBehavior: "clear" }),
};

/** FancyButton keeps exactly one state view visible, so the shown texture identifies the active state. */
function shownStateTexture(view: Container): Texture | undefined {
  const shown: Sprite[] = [];
  const walk = (container: Container): void => {
    if (container instanceof Sprite && container.visible) shown.push(container);
    container.children.forEach(walk);
  };
  walk(view);
  return shown.length === 1 ? shown[0]!.texture : undefined;
}

describe("sample project loader smoke test", () => {
  it("matches atlas pages to texture files by name", () => {
    const atlas = new TextureAtlas("second.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n\nfirst.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n");
    assignAtlasPageTextures(atlas, new Map([["first.png", Texture.WHITE], ["second.png", Texture.WHITE]]));
    expect(atlas.pages.every((page) => page.texture !== null)).toBe(true);
  });
  it("resolves base transforms, partial desktop overrides, and profile visibility", () => {
    const document = renderDocument();
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
    const transform = { x: -160, y: -50, width: 320, height: 100, scaleX: 1, scaleY: 1, rotation: 0, anchorMinX: 0.5, anchorMaxX: 0.5, anchorMinY: 1, anchorMaxY: 1 };
    expect(resolveAnchoredTransform(transform, { width: 1920, height: 1080 })).toMatchObject({ x: 800, y: 1030, width: 320, height: 100 });
  });

  it("stretches a node between separated anchors following the parent size", () => {
    const transform = { x: 10, y: 20, width: -30, height: 100, scaleX: 1, scaleY: 1, rotation: 0, anchorMinX: 0, anchorMaxX: 1, anchorMinY: 0.5, anchorMaxY: 0.5 };
    expect(resolveAnchoredTransform(transform, { width: 1920, height: 1080 })).toMatchObject({ x: 10, y: 560, width: 1890, height: 100 });
    expect(resolveAnchoredTransform(transform, { width: 800, height: 1080 })).toMatchObject({ x: 10, width: 770 });
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
    const document = renderDocument();
    const textured = buildSceneView(document, ids.scene, "desktop", { interaction: "authoring", textures: new Map([[ids.asset, Texture.WHITE]]) });
    const imageView = textured.nodeViews.get(ids.image)!;
    const sprite = imageView.children[0];
    expect(imageView).not.toBeInstanceOf(Sprite);
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite?.width).toBe(240);

    const placeholder = buildSceneView(document, ids.scene, "desktop", { interaction: "authoring" }).nodeViews.get(ids.image)?.children[0];
    expect(placeholder).not.toBeInstanceOf(Sprite);

    const anchoredDocument = clone(document);
    const anchoredNode = anchoredDocument.scenes[0]!.nodes.find((node) => node.id === ids.image)!;
    anchoredNode.transform = { ...anchoredNode.transform, anchorMinX: 1, anchorMaxX: 1, pivotX: 1, x: 0 };
    const anchoredView = buildSceneView(anchoredDocument, ids.scene, "desktop", { interaction: "authoring", textures: new Map([[ids.asset, Texture.WHITE]]) }).nodeViews.get(ids.image)!;
    const anchoredSprite = anchoredView.children[0] as Sprite;
    const renderedRight = anchoredView.position.x + (anchoredSprite.width - anchoredView.pivot.x) * anchoredView.scale.x;
    expect(renderedRight).toBe(anchoredDocument.scenes[0]!.layout.referenceViewports.desktop.width);

    const mobileNode = anchoredDocument.scenes[0]!.nodes.find((node) => node.id === ids.image)!;
    mobileNode.layoutOverrides = { mobile: { transform: { anchorMinX: 1, anchorMaxX: 1, pivotX: 1, x: 0 } } };
    const mobileView = buildSceneView(anchoredDocument, ids.scene, "mobile", { interaction: "authoring", textures: new Map([[ids.asset, Texture.WHITE]]) }).nodeViews.get(ids.image)!;
    const mobileSprite = mobileView.children[0] as Sprite;
    const mobileRight = mobileView.position.x + (mobileSprite.width - mobileView.pivot.x) * mobileView.scale.x;
    expect(mobileRight).toBe(anchoredDocument.scenes[0]!.layout.referenceViewports.mobile.width);
  });

  it("places a zero-offset centred pivot at the centre of its parent", () => {
    const document = renderDocument();
    const imageNode = document.scenes[0]!.nodes.find((node) => node.id === ids.image)!;
    imageNode.transform = {
      ...imageNode.transform,
      x: 0,
      y: 0,
      anchorMinX: 0.5,
      anchorMaxX: 0.5,
      anchorMinY: 0.5,
      anchorMaxY: 0.5,
      pivotX: 0.5,
      pivotY: 0.5,
    };

    const imageView = buildSceneView(document, ids.scene, "desktop", { interaction: "authoring" }).nodeViews.get(ids.image)!;
    const viewport = document.scenes[0]!.layout.referenceViewports.desktop;
    expect(imageView.position).toMatchObject({ x: viewport.width / 2, y: viewport.height / 2 });
  });

  it("gives every node type the same grab rectangle, whatever it renders", () => {
    const types = Object.keys(NODE_TYPE_FIXTURES) as UINode["type"][];
    const nodeId = (index: number) => `40000000-0000-4000-8000-00000000000${index}`;

    const views = types.map((type, index) => {
      const node = NODE_TYPE_FIXTURES[type]({
        id: nodeId(index),
        name: type,
        parentId: ids.root,
        children: [],
        visible: true,
        transform: { x: 10, y: 20, width: 120, height: 40, scaleX: 1, scaleY: 1, rotation: 0 },
      });
      // Input and ScrollBox create DOM controls; their NodeView-level grab contract is the same.
      const view = node.type === "scroll-view" || node.type === "input" ? new ContainerNodeView() : createNodeView(node, "authoring");
      view.update(node, "desktop", { width: 1920, height: 1080 });
      return view;
    });

    // Ни текстур, ни Spine-данных: grab-зона не должна зависеть ни от контента ноды, ни от загруженных ассетов.
    const grab = (index: number, x: number, y: number) => views[index]?.containsPoint({ x, y });
    const grabbedInsideRect = types.map((type, index) => [type, grab(index, 60, 20) ?? false] as const);
    const missedOutsideRect = types.map((type, index) => [type, grab(index, 200, 20) ?? true] as const);

    expect(grabbedInsideRect).toEqual(types.map((type) => [type, true]));
    expect(missedOutsideRect).toEqual(types.map((type) => [type, false]));
  });

  it("keeps a child grabbable where it reaches past its parent's rectangle", () => {
    const document = renderDocument();
    const scene = document.scenes[0]!;
    const root = scene.nodes.find((node) => node.id === ids.root)!;
    const parentId = "50000000-0000-4000-8000-000000000001";
    const childId = "50000000-0000-4000-8000-000000000002";
    const transform = { scaleX: 1, scaleY: 1, rotation: 0 };
    // Ребёнок по умолчанию смещён на 50/50 внутри родителя 100x100, поэтому наполовину торчит наружу.
    scene.nodes.push({ id: parentId, name: "Parent", type: "container", parentId: ids.root, children: [childId], visible: true, transform: { ...transform, x: 0, y: 0, width: 100, height: 100 } });
    scene.nodes.push({ id: childId, name: "Child", type: "container", parentId, children: [], visible: true, transform: { ...transform, x: 50, y: 50, width: 100, height: 100 } });
    root.children.push(parentId);

    const { nodeViews } = buildSceneView(document, ids.scene, "desktop", { interaction: "authoring" });
    const child = nodeViews.get(childId) as NodeView;

    // Точка (90, 90) в локальных координатах ребёнка лежит за границей родителя.
    expect(child.containsPoint({ x: 90, y: 90 })).toBe(true);
    // hitArea родителя обрезала бы здесь всё поддерево, поэтому её быть не должно.
    expect(nodeViews.get(parentId)!.hitArea).toBeUndefined();
  });

  it("falls back to the normal image for states without an asset and switches the shown view on every state", () => {
    const document = documentWithButton();
    const textures = new Map([[ids.asset, Texture.WHITE], [buttonIds.pressedAsset, Texture.EMPTY]]);
    const view = buildSceneView(document, ids.scene, "desktop", { interaction: "runtime", textures }).nodeViews.get(buttonIds.node) as ButtonNodeView;

    expect(view.state).toBe("normal");
    expect(shownStateTexture(view)).toBe(Texture.WHITE);

    // hover и disabled не имеют своего asset и обязаны показывать normal; pressed — собственный.
    const shown = (["hover", "pressed", "normal", "disabled"] as const).map((state) => {
      view.setState(state);
      return [view.state, shownStateTexture(view)] as const;
    });
    expect(shown).toEqual([
      ["hover", Texture.WHITE],
      ["pressed", Texture.EMPTY],
      ["normal", Texture.WHITE],
      ["disabled", Texture.WHITE],
    ]);
  });

  it("stops dispatching pointer events to a disabled button without writing runtime state back to the document", () => {
    const document = documentWithButton();
    const view = buildSceneView(document, ids.scene, "desktop", { interaction: "runtime", textures: new Map([[ids.asset, Texture.WHITE]]) }).nodeViews.get(buttonIds.node) as ButtonNodeView;
    const node = document.scenes[0]!.nodes.find((candidate) => candidate.id === buttonIds.node)!;
    const button = view.children[0]!;

    expect(view.enabled).toBe(true);
    expect(button.eventMode).toBe("static");

    view.enabled = false;

    expect(view.enabled).toBe(false);
    expect(view.state).toBe("disabled");
    // Именно так @pixi/ui глушит press: EventSystem не доставляет события неинтерактивному view.
    expect(button.eventMode).not.toBe("static");
    // Enabled — только начальное presentation-состояние: runtime setter документ не трогает.
    expect(node).toMatchObject({ type: "button", enabled: true });
  });

  it("builds an inert button on an authoring canvas while keeping the node itself grabbable", () => {
    const document = documentWithButton();
    const view = buildSceneView(document, ids.scene, "desktop", { interaction: "authoring", textures: new Map([[ids.asset, Texture.WHITE]]) }).nodeViews.get(buttonIds.node)!;

    // FancyButton не реагирует на pointer во время authoring...
    expect(view.children[0]!.eventMode).toBe("none");
    // ...но выделение и drag идут через grab-прямоугольник самого NodeView и обязаны продолжать работать.
    expect((view as NodeView).containsPoint({ x: 60, y: 20 })).toBe(true);
  });

  it("applies identical layout coordinates to image, text, and Spine node containers", () => {
    const document = renderDocument();
    const scene = document.scenes[0]!;
    const root = scene.nodes.find((node) => node.id === ids.root)!;
    const image = scene.nodes.find((node) => node.id === ids.image)!;
    const text = scene.nodes.find((node) => node.id === ids.text)!;
    const spineId = "10000000-0000-4000-8000-000000000007";
    const transform = { x: -240, y: -90, width: 320, height: 180, scaleX: 1.25, scaleY: 0.75, rotation: 0.2, anchorMinX: 1, anchorMaxX: 1, anchorMinY: 0.5, anchorMaxY: 0.5, pivotX: 0.75, pivotY: 0.5 };
    image.transform = { ...transform };
    text.transform = { ...transform };
    const spine: UINode = { id: spineId, name: "Spine", type: "spine", assetId: ids.asset, parentId: ids.root, children: [], visible: true, transform: { ...transform } };
    scene.nodes.push(spine);
    root.children.push(spineId);

    const views = buildSceneView(document, ids.scene, "desktop", { interaction: "authoring", textures: new Map([[ids.asset, Texture.WHITE]]) }).nodeViews;
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
    expect(scene.nodes.find((node) => node.id === ids.text)).toMatchObject({ binding: "showcase.title" });
    expect(scene.layout.referenceViewports).toHaveProperty("desktop");
    expect(scene.layout.referenceViewports).toHaveProperty("mobile");
  });

  it("round-trips deterministically while retaining semantic child order", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const serialized = serializeProjectDocument(document);
    const roundTripped = parseProjectDocumentJson(serialized);
    expect(roundTripped).toEqual(document);
    expect(serializeProjectDocument(roundTripped)).toBe(serialized);
    expect(roundTripped.scenes[0]!.nodes[0]!.children).toEqual([
      ids.text,
      "10000000-0000-4000-8000-000000000020",
      "10000000-0000-4000-8000-000000000030",
      "10000000-0000-4000-8000-000000000040",
      "10000000-0000-4000-8000-000000000050",
      "10000000-0000-4000-8000-000000000062",
      "10000000-0000-4000-8000-000000000063",
    ]);
  });

  it("does not use display names as references", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const renamed = clone(document);
    const image = renamed.scenes[0]!.nodes.find((node) => node.id === ids.image)!;
    image.name = "Renamed image";
    expect(parseProjectDocumentJson(serializeProjectDocument(renamed)).scenes[0]!.nodes.find((node) => node.id === ids.image)).toMatchObject({ id: ids.image, assetId: ids.asset });
  });

  it("surfaces schema validation codes through the JSON loading boundary", () => {
    const invalid = clone(parseProjectDocumentJson(sampleJson));
    (invalid.scenes[0]!.nodes.find((node) => node.id === ids.image)! as { assetId: string }).assetId = ids.text;
    expect(() => parseProjectDocumentJson(JSON.stringify(invalid))).toThrow("MISSING_ASSET_REFERENCE");
  });

  it("distinguishes malformed JSON from schema errors", () => {
    expect(() => parseProjectDocumentJson("{not json")).toThrow(ProjectDocumentJsonParseError);
    const invalid = clone(parseProjectDocumentJson(sampleJson));
    delete (invalid.scenes[0]!.layout.referenceViewports as Record<string, unknown>).mobile;
    expect(() => parseProjectDocumentJson(JSON.stringify(invalid))).toThrow(TypeError);
  });
});
