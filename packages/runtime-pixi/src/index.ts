import { BUTTON_STATE_KEYS, migrateProjectDocument, type Asset, type ButtonStateKey, type LayoutProfileId, type ProjectDocument, type Scene, type UINode } from "@pixi-ui-editor/schema";
import { Container, Graphics, Rectangle, Sprite, Text, Texture, type PointData, type Ticker } from "pixi.js";
import { FancyButton } from "@pixi/ui";
import { AtlasAttachmentLoader, SkeletonJson, Spine, SpineTexture, TextureAtlas, type SkeletonData } from "@esotericsoftware/spine-pixi-v8";
export type { SkeletonData } from "@esotericsoftware/spine-pixi-v8";

/**
 * Whether a built scene is an inert authoring surface or a live one.
 * The editor canvas builds `authoring` scenes so controls never swallow selection and drag
 * gestures; Preview and the consuming app build `runtime` scenes with real pointer handling.
 */
export type SceneInteractionMode = "authoring" | "runtime";

type ButtonNode = Extract<UINode, { type: "button" }>;

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
  /** Node's own grab rectangle in local space, kept equal to its resolved layout rectangle. */
  private readonly grabRect = new Rectangle();

  /**
   * Makes every node selectable and draggable by its layout rectangle, whatever it renders.
   *
   * Lives here rather than in a subclass because a bare `Container` has no `containsPoint` of its
   * own: without this, Pixi could only find a node through whatever content the subclass happens to
   * draw, so nodes that draw nothing (container) or keep their content out of hit testing (button,
   * whose `@pixi/ui` view is inert while authoring) would silently stop being selectable.
   *
   * Deliberately `containsPoint` and NOT `hitArea`: Pixi's `hitPruneFn` drops a container together
   * with its whole subtree once the point falls outside its `hitArea`, which would make any child
   * reaching past its parent's rectangle visible but unclickable. `containsPoint` never clips
   * children — they are hit-tested first and independently, so a child always stays grabbable.
   */
  containsPoint(point: PointData): boolean {
    return this.grabRect.contains(point.x, point.y);
  }

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
    // Тот же прямоугольник, что видит пользователь: grab-зона не зависит от содержимого ноды.
    this.grabRect.x = 0;
    this.grabRect.y = 0;
    this.grabRect.width = transform.width;
    this.grabRect.height = transform.height;
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

const FANCY_STATE_BY_KEY = { normal: "default", hover: "hover", pressed: "pressed", disabled: "disabled" } as const;
const KEY_BY_FANCY_STATE = { default: "normal", hover: "hover", pressed: "pressed", disabled: "disabled" } as const;

/**
 * Adapts a button node to `@pixi/ui`'s `FancyButton`, which owns the pointer state machine —
 * this class never reimplements it. Optional states fall back to the normal image, and runtime
 * changes to `enabled` or the current state stay in the view: they never touch the document.
 */
export class ButtonNodeView extends NodeView {
  private readonly button: FancyButton;
  private readonly stateViews: Container[] = [];
  private readonly interaction: SceneInteractionMode;
  private enabledState: boolean;

  constructor(node: ButtonNode, textures: ReadonlyMap<string, Texture> | undefined, interaction: SceneInteractionMode) {
    super();
    this.interaction = interaction;
    const normalTexture = textures?.get(node.states.normalAssetId);
    const viewFor = (assetId: string | undefined): Container => {
      const texture = (assetId === undefined ? undefined : textures?.get(assetId)) ?? normalTexture;
      const view = texture === undefined ? new Graphics() : new Sprite(texture);
      this.stateViews.push(view);
      return view;
    };

    this.button = new FancyButton({
      defaultView: viewFor(node.states.normalAssetId),
      hoverView: viewFor(node.states.hoverAssetId),
      pressedView: viewFor(node.states.pressedAssetId),
      disabledView: viewFor(node.states.disabledAssetId),
    });
    // Authoring-сцена инертна: FancyButton уже включил себе eventMode "static", снимаем его до applyEnabled.
    // Выделение и drag при этом не страдают: попадание ловит hitArea базового NodeView, а не это поддерево.
    if (interaction === "authoring") this.button.eventMode = "none";
    this.enabledState = node.enabled;
    this.applyEnabled(node.enabled);
    this.setContent(this.button);
  }

  /** In authoring mode `enabled` may only drive the visuals: `FancyButton` couples it to `eventMode`. */
  private applyEnabled(enabled: boolean): void {
    this.enabledState = enabled;
    if (this.interaction === "runtime") this.button.enabled = enabled;
    else this.button.setState(enabled ? "default" : "disabled");
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    for (const view of this.stateViews) {
      if (view instanceof Sprite) view.setSize(transform.width, transform.height);
      else if (view instanceof Graphics) view.clear().rect(0, 0, transform.width, transform.height).fill(0x4a5568).stroke({ width: 1, color: 0x94a3b8 });
    }
    // Только на изменение документа: иначе любой пересчёт layout сбрасывал бы transient preview state.
    if (node.type === "button" && node.enabled !== this.enabledState) this.applyEnabled(node.enabled);
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  set enabled(value: boolean) {
    this.applyEnabled(value);
  }

  get state(): ButtonStateKey {
    return KEY_BY_FANCY_STATE[this.button.state];
  }

  /** Forces a visual state without changing `enabled`, so a disabled button still emits no press. */
  setState(state: ButtonStateKey): void {
    this.button.setState(FANCY_STATE_BY_KEY[state]);
  }

  get onPress(): FancyButton["onPress"] { return this.button.onPress; }
  get onDown(): FancyButton["onDown"] { return this.button.onDown; }
  get onUp(): FancyButton["onUp"] { return this.button.onUp; }
  get onHover(): FancyButton["onHover"] { return this.button.onHover; }
  get onOut(): FancyButton["onOut"] { return this.button.onOut; }
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

function createNodeView(node: UINode, interaction: SceneInteractionMode, textures?: ReadonlyMap<string, Texture>, spines?: ReadonlyMap<string, SkeletonData>, expandPrefab?: (prefabId: string) => Container | undefined): NodeView {
  switch (node.type) {
    case "container":
      return new ContainerNodeView();
    case "image":
      return new ImageNodeView(textures?.get(node.assetId));
    case "text":
      return new TextNodeView(node.text);
    case "spine":
      return new SpineNodeView(spines?.get(node.assetId), node.animation, node.loop ?? true);
    case "button":
      return new ButtonNodeView(node, textures, interaction);
    case "prefab-instance":
      return new PrefabInstanceNodeView(expandPrefab?.(node.prefabId));
  }
}

export type BuildSceneViewOptions = {
  /** Explicit: an editor canvas must pass "authoring", Preview and the consuming app "runtime". */
  interaction: SceneInteractionMode;
  textures?: ReadonlyMap<string, Texture>;
  spines?: ReadonlyMap<string, SkeletonData>;
};

/** Builds a PixiJS display tree for a scene without depending on DOM or editor state. */
export function buildSceneView(
  document: ProjectDocument,
  sceneId: string,
  profile: LayoutProfileId,
  options: BuildSceneViewOptions,
): { root: Container; nodeViews: Map<string, Container> } {
  const { interaction, textures, spines } = options;
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
      const view = createNodeView(node, interaction, textures, spines, (prefabId) => {
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

/**
 * Every asset a node references: the image, the Spine data, or each of a button's state images.
 * Single source of truth for "which assets does this node use" — texture loading and the editor's
 * usage count both read it, so a new node type can never silently drop out of one of them.
 */
export function collectNodeAssetIds(node: UINode): string[] {
  if (node.type === "image" || node.type === "spine") return [node.assetId];
  if (node.type !== "button") return [];
  return BUTTON_STATE_KEYS
    .map((state) => node.states[`${state}AssetId`])
    .filter((assetId): assetId is string => assetId !== undefined);
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

/** Forces an editor-only button state; the node's serialized `enabled` and states stay untouched. */
export function setButtonViewState(view: Container, state: ButtonStateKey): void {
  if (view instanceof ButtonNodeView) view.setState(state);
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
    for (const assetId of collectNodeAssetIds(node)) {
      if (textures.has(assetId)) continue;

      // Spine-ассеты сюда тоже попадают и отсеиваются здесь: их данные грузит loadSceneSpines.
      const asset = assetsById.get(assetId);
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
  options: { interaction: SceneInteractionMode },
): Promise<{ root: Container; nodeViews: Map<string, Container> }> {
  const [textures, spines] = await Promise.all([
    loadSceneTextures(document, sceneId, (asset) => (asset.type === "image" ? resolveFileUrl(asset.source.uri) : undefined)),
    loadSceneSpines(document, sceneId, resolveFileUrl),
  ]);
  return buildSceneView(document, sceneId, profile, { interaction: options.interaction, textures, spines });
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
