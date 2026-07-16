import { migrateProjectDocument, type Asset, type LayoutProfileId, type ProjectDocument, type Scene, type UINode } from "@pixi-ui-editor/schema";
import { Container, Graphics, Sprite, Text, Texture, type Ticker } from "pixi.js";
import { AtlasAttachmentLoader, SkeletonJson, Spine, SpineTexture, TextureAtlas, type SkeletonData } from "@esotericsoftware/spine-pixi-v8";
export type { SkeletonData } from "@esotericsoftware/spine-pixi-v8";

export class ProjectDocumentJsonParseError extends Error {
  readonly code = "INVALID_JSON";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectDocumentJsonParseError";
  }
}

export function loadProjectDocument(input: unknown): ProjectDocument {
  return migrateProjectDocument(input);
}

export function parseProjectDocumentJson(json: string): ProjectDocument {
  try {
    return loadProjectDocument(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProjectDocumentJsonParseError("Unable to parse ProjectDocument JSON.", { cause: error });
    throw error;
  }
}

export type ResolvedProfileTransform = {
  transform: UINode["transform"];
  visible: boolean;
};

export type LayoutSize = { width: number; height: number };

export type AssetUrlResolver = (asset: Asset) => string | undefined;
export type FileUrlResolver = (uri: string) => string | undefined;

/** Resolves a node's base transform with a profile override applied field by field. */
export function resolveProfileTransform(node: UINode, profile: LayoutProfileId): ResolvedProfileTransform {
  const override = node.layoutOverrides?.[profile];

  return {
    transform: { ...node.transform, ...override?.transform },
    visible: override?.visible ?? node.visible,
  };
}

/**
 * Resolves normalized Unity-style anchors against the node's parent rectangle.
 * A point axis (anchorMin == anchorMax) offsets the stored x/y by the anchor point; missing anchors
 * preserve legacy top-left positioning. A stretched axis (anchorMin < anchorMax) additionally treats
 * the stored width/height as a delta to the anchor rectangle, so the node follows the parent's size.
 */
export function resolveAnchoredTransform(transform: UINode["transform"], parentSize?: LayoutSize): UINode["transform"] {
  if (parentSize === undefined) return transform;
  const minX = transform.anchorMinX ?? 0;
  const maxX = transform.anchorMaxX ?? minX;
  const minY = transform.anchorMinY ?? 0;
  const maxY = transform.anchorMaxY ?? minY;
  return {
    ...transform,
    x: transform.x + minX * parentSize.width,
    y: transform.y + minY * parentSize.height,
    width: Math.max(0, transform.width + (maxX - minX) * parentSize.width),
    height: Math.max(0, transform.height + (maxY - minY) * parentSize.height),
  };
}

/** Picks the layout profile for a viewport using the document's aspect-ratio rule; the breakpoint itself is mobile. */
export function resolveProfileForViewport(settings: ProjectDocument["settings"], width: number, height: number): LayoutProfileId {
  return width / height <= settings.layoutProfileSelection.mobileMaxAspectRatio ? "mobile" : "desktop";
}

export function fitSpineToTransform(
  bounds: { x: number; y: number; width: number; height: number },
  transform: UINode["transform"],
): { scaleX: number; scaleY: number; x: number; y: number } | undefined {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const scaleX = transform.width / bounds.width;
  const scaleY = transform.height / bounds.height;
  return Number.isFinite(scaleX) && scaleX > 0 && Number.isFinite(scaleY) && scaleY > 0
    ? { scaleX, scaleY, x: -bounds.x * scaleX, y: -bounds.y * scaleY }
    : undefined;
}

/**
 * Base display object for every schema node type. The whole layout contract — profile overrides,
 * anchors, pivot, position, scale, visibility — lives here once; subclasses only synchronize their
 * type-specific content against the resolved layout rectangle.
 */
export abstract class NodeView extends Container {
  protected content?: Container;

  protected setContent(content: Container): void {
    this.content = content;
    this.addChild(content);
  }

  /** Syncs type-specific content to the resolved layout rectangle; layout math itself is shared. */
  protected abstract syncContent(node: UINode, transform: UINode["transform"]): void;

  update(node: UINode, profile: LayoutProfileId, parentSize?: LayoutSize): void {
    const resolved = resolveProfileTransform(node, profile);
    const transform = resolveAnchoredTransform(resolved.transform, parentSize);
    this.syncContent(node, transform);

    const pivotX = (transform.pivotX ?? 0) * transform.width;
    const pivotY = (transform.pivotY ?? 0) * transform.height;
    this.pivot.set(pivotX, pivotY);
    this.position.set(transform.x + pivotX, transform.y + pivotY);
    this.rotation = transform.rotation;
    this.scale.set(transform.scaleX, transform.scaleY);
    this.visible = resolved.visible;
  }

  getSpine(): Spine | undefined {
    return this.content instanceof Spine ? this.content : undefined;
  }
}

class ContainerNodeView extends NodeView {
  protected syncContent(): void {}
}

class ImageNodeView extends NodeView {
  constructor(texture: Texture | undefined) {
    super();
    this.setContent(texture !== undefined ? new Sprite(texture) : new Graphics());
  }

  protected syncContent(_node: UINode, transform: UINode["transform"]): void {
    if (this.content instanceof Sprite) this.content.setSize(transform.width, transform.height);
    else if (this.content instanceof Graphics) this.content.clear().rect(0, 0, transform.width, transform.height).fill(0x4a5568).stroke({ width: 1, color: 0x94a3b8 });
  }
}

class TextNodeView extends NodeView {
  constructor(text: string) {
    super();
    this.setContent(new Text({ text, style: { fontFamily: "Arial", fontSize: 24, fill: 0xffffff } }));
  }

  protected syncContent(node: UINode): void {
    if (node.type === "text" && this.content instanceof Text && this.content.text !== node.text) this.content.text = node.text;
  }
}

class SpineNodeView extends NodeView {
  constructor(skeletonData: SkeletonData | undefined, animation: string | undefined, loop: boolean) {
    super();
    if (skeletonData === undefined) {
      this.setContent(new Graphics());
      return;
    }
    const spine = new Spine(skeletonData);
    if (animation !== undefined && skeletonData.findAnimation(animation) !== null) spine.state.setAnimation(0, animation, loop);
    this.setContent(spine);
  }

  protected syncContent(_node: UINode, transform: UINode["transform"]): void {
    if (this.content instanceof Spine) {
      const fit = fitSpineToTransform(this.content.skeleton.data, transform);
      if (fit !== undefined) {
        this.content.scale.set(fit.scaleX, fit.scaleY);
        this.content.position.set(fit.x, fit.y);
      }
    } else if (this.content instanceof Graphics) {
      this.content.clear().rect(0, 0, transform.width, transform.height).fill(0xff00ff);
    }
  }
}

class PrefabInstanceNodeView extends NodeView {
  constructor(expanded: Container | undefined) {
    super();
    this.setContent(expanded ?? new Graphics());
  }

  protected syncContent(_node: UINode, transform: UINode["transform"]): void {
    if (this.content instanceof Graphics) this.content.clear().rect(0, 0, transform.width, transform.height).fill(0xff00ff);
  }
}

function createNodeView(node: UINode, textures?: ReadonlyMap<string, Texture>, spines?: ReadonlyMap<string, SkeletonData>, expandPrefab?: (prefabId: string) => Container | undefined): NodeView {
  switch (node.type) {
    case "container":
      return new ContainerNodeView();
    case "image":
      return new ImageNodeView(textures?.get(node.assetId));
    case "text":
      return new TextNodeView(node.text);
    case "spine":
      return new SpineNodeView(spines?.get(node.assetId), node.animation, node.loop ?? true);
    case "prefab-instance":
      return new PrefabInstanceNodeView(expandPrefab?.(node.prefabId));
  }
}

/** Builds a PixiJS display tree for a scene without depending on DOM or editor state. */
export function buildSceneView(
  document: ProjectDocument,
  sceneId: string,
  profile: LayoutProfileId,
  textures?: ReadonlyMap<string, Texture>,
  spines?: ReadonlyMap<string, SkeletonData>,
): { root: Container; nodeViews: Map<string, Container> } {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);

  if (scene === undefined) {
    throw new Error(`Scene '${sceneId}' does not exist in the project document.`);
  }

  const nodeViews = new Map<string, Container>();

  // Views раскрытых prefab-определений не регистрируются в nodeViews: инстанс редактируется как единое целое.
  const buildOwner = (owner: { rootNodeIds: string[]; nodes: UINode[] }, registerViews: boolean, expandingPrefabIds: ReadonlySet<string>, rootSize: LayoutSize): Container => {
    const nodesById = new Map(owner.nodes.map((node) => [node.id, node]));

    const buildNode = (nodeId: string, parentSize: LayoutSize): Container => {
      const node = nodesById.get(nodeId);

      if (node === undefined) {
        throw new Error(`Scene '${sceneId}' references missing node '${nodeId}'.`);
      }

      const resolved = resolveProfileTransform(node, profile);
      const transform = resolveAnchoredTransform(resolved.transform, parentSize);
      const view = createNodeView(node, textures, spines, (prefabId) => {
        const prefab = document.prefabs.find((candidate) => candidate.id === prefabId);
        if (prefab === undefined || expandingPrefabIds.has(prefabId)) return undefined;
        return buildOwner(prefab, false, new Set([...expandingPrefabIds, prefabId]), { width: transform.width, height: transform.height });
      });
      view.update(node, profile, parentSize);
      if (registerViews) nodeViews.set(node.id, view);

      const childSize = owner === scene && node.parentId === null
        ? rootSize
        : { width: transform.width, height: transform.height };
      for (const childId of node.children) {
        view.addChild(buildNode(childId, childSize));
      }

      return view;
    };

    const ownerRoot = new Container();
    for (const rootNodeId of owner.rootNodeIds) {
      ownerRoot.addChild(buildNode(rootNodeId, rootSize));
    }

    return ownerRoot;
  };

  return { root: buildOwner(scene, true, new Set(), scene.layout.referenceViewports[profile]), nodeViews };
}

/**
 * Applies a node's resolved transform, visibility, and content to an existing display object,
 * so editors can update views in place without rebuilding the scene tree.
 */
export function updateNodeView(view: Container, node: UINode, profile: LayoutProfileId, parentSize?: LayoutSize): void {
  if (view instanceof NodeView) view.update(node, profile, parentSize);
}

/** Lists the nodes a scene renders, including nodes of prefab definitions its prefab instances expand to. */
function collectRenderedNodes(document: ProjectDocument, scene: Scene): UINode[] {
  const nodes: UINode[] = [];
  const expandedPrefabIds = new Set<string>();

  const visit = (list: UINode[]): void => {
    for (const node of list) {
      nodes.push(node);
      if (node.type !== "prefab-instance" || expandedPrefabIds.has(node.prefabId)) continue;
      expandedPrefabIds.add(node.prefabId);
      const prefab = document.prefabs.find((candidate) => candidate.id === node.prefabId);
      if (prefab !== undefined) visit(prefab.nodes);
    }
  };

  visit(scene.nodes);
  return nodes;
}

/** Assigns atlas pages by their exported image filename, never by their array index. */
export function assignAtlasPageTextures(atlas: TextureAtlas, textures: ReadonlyMap<string, Texture>): void {
  for (const page of atlas.pages) {
    const texture = textures.get(page.name);
    if (texture === undefined) throw new Error(`Atlas page '${page.name}' has no matching texture file.`);
    page.setTexture(SpineTexture.from(texture.source));
  }
}

/** Creates a Spine display object, optionally assigning it to a specific renderer ticker. */
export function createSpineView(skeletonData: SkeletonData, animation?: string, options: { autoUpdate?: boolean; ticker?: Ticker } = {}): Spine {
  const spine = new Spine({ skeletonData, autoUpdate: options.autoUpdate ?? true, ticker: options.ticker });
  if (animation !== undefined && skeletonData.findAnimation(animation) !== null) spine.state.setAnimation(0, animation, true);
  return spine;
}

function findSpineChild(view: Container): Spine | undefined {
  if (view instanceof NodeView) return view.getSpine();
  return view instanceof Spine ? view : view.children.find((child): child is Spine => child instanceof Spine);
}

/** Reads the current 1-based animation frame for an editor Spine node. */
export function getSpineViewPlayback(view: Container, skeletonData: SkeletonData, animation: string): { current: number; total: number } | undefined {
  const spine = findSpineChild(view);
  const track = spine?.state.tracks[0];
  const duration = skeletonData.findAnimation(animation)?.duration;
  if (track === null || track === undefined || duration === undefined || duration <= 0) return undefined;
  const fps = skeletonData.fps && skeletonData.fps > 0 ? skeletonData.fps : 60;
  const total = Math.max(1, Math.round(duration * fps));
  const time = track.loop ? track.trackTime % duration : Math.min(track.trackTime, duration);
  return { current: Math.min(total, Math.floor(time * fps) + 1), total };
}

/** Seeks an editor Spine node to a 1-based animation frame without changing its serialized animation settings. */
export function setSpineViewFrame(view: Container, frame: number, skeletonData: SkeletonData, animation: string): void {
  const spine = findSpineChild(view);
  const track = spine?.state.tracks[0];
  const duration = skeletonData.findAnimation(animation)?.duration;
  if (track === null || track === undefined || duration === undefined || duration <= 0) return;
  const fps = skeletonData.fps && skeletonData.fps > 0 ? skeletonData.fps : 60;
  const total = Math.max(1, Math.round(duration * fps));
  track.trackTime = Math.min(total, Math.max(1, Math.round(frame)) - 1) / fps;
  spine?.update(0);
}

/** Enables or pauses editor-only automatic playback without affecting serialized node data. */
export function setSpineViewAutoplay(view: Container, autoplay: boolean): void {
  const spine = findSpineChild(view);
  if (spine !== undefined) spine.autoUpdate = autoplay;
}

/** Loads one texture from a data URI or a regular URL. */
export async function loadTexture(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return Texture.from(image);
}

/** Loads textures for image nodes in a scene, leaving failed assets for placeholder rendering. */
export async function loadSceneTextures(
  document: ProjectDocument,
  sceneId: string,
  resolveAssetUrl: AssetUrlResolver,
  cache: Map<string, Texture> = new Map(),
): Promise<Map<string, Texture>> {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const textures = new Map<string, Texture>();

  for (const node of collectRenderedNodes(document, scene)) {
    if (node.type !== "image" || textures.has(node.assetId)) continue;

    const asset = assetsById.get(node.assetId);
    if (asset?.type !== "image") continue;

    const url = resolveAssetUrl(asset);
    if (url === undefined) continue;

    try {
      const texture = cache.get(asset.source.uri) ?? await loadTexture(url);
      cache.set(asset.source.uri, texture);
      textures.set(asset.id, texture);
    } catch (error) {
      console.warn(`Unable to load texture for asset '${asset.id}'.`, error);
    }
  }

  return textures;
}

/** Loads the Spine data referenced by a scene. Failed assets are left out for placeholder rendering. */
export async function loadSceneSpines(
  document: ProjectDocument,
  sceneId: string,
  resolveFileUrl: FileUrlResolver,
  cache: Map<string, SkeletonData> = new Map(),
): Promise<Map<string, SkeletonData>> {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const spines = new Map<string, SkeletonData>();
  for (const node of collectRenderedNodes(document, scene)) {
    if (node.type !== "spine" || spines.has(node.assetId)) continue;
    const asset = assetsById.get(node.assetId);
    if (asset?.type !== "spine") continue;

    try { spines.set(asset.id, await loadSpineAsset(asset, resolveFileUrl, cache)); } catch (error) {
      console.warn(`Unable to load Spine asset '${asset.id}'.`, error);
    }
  }
  return spines;
}

/** Loads a scene's textures and Spine data, then builds its display tree in one call. */
export async function loadSceneView(
  document: ProjectDocument,
  sceneId: string,
  profile: LayoutProfileId,
  resolveFileUrl: FileUrlResolver,
): Promise<{ root: Container; nodeViews: Map<string, Container> }> {
  const [textures, spines] = await Promise.all([
    loadSceneTextures(document, sceneId, (asset) => (asset.type === "image" ? resolveFileUrl(asset.source.uri) : undefined)),
    loadSceneSpines(document, sceneId, resolveFileUrl),
  ]);
  return buildSceneView(document, sceneId, profile, textures, spines);
}

/** Loads one Spine asset, sharing parsed SkeletonData by skeleton file URI. */
export async function loadSpineAsset(asset: Extract<Asset, { type: "spine" }>, resolveFileUrl: FileUrlResolver, cache: Map<string, SkeletonData> = new Map()): Promise<SkeletonData> {
  const cached = cache.get(asset.files.skeleton.uri);
  if (cached !== undefined) return cached;
  const skeletonUrl = resolveFileUrl(asset.files.skeleton.uri);
  const atlasUrl = resolveFileUrl(asset.files.atlas.uri);
  if (skeletonUrl === undefined || atlasUrl === undefined) throw new Error("A Spine file URL could not be resolved.");
  const [skeletonText, atlasText] = await Promise.all([fetch(skeletonUrl).then((response) => response.text()), fetch(atlasUrl).then((response) => response.text())]);
  const textures = new Map<string, Texture>();
  for (const file of asset.files.textures) {
    const url = resolveFileUrl(file.uri);
    if (url === undefined) throw new Error(`Texture '${file.name}' could not be resolved.`);
    textures.set(file.name, await loadTexture(url));
  }
  const atlas = new TextureAtlas(atlasText);
  assignAtlasPageTextures(atlas, textures);
  const skeletonData = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(skeletonText);
  cache.set(asset.files.skeleton.uri, skeletonData);
  return skeletonData;
}
