import { AtlasAttachmentLoader, SkeletonJson, Spine, SpineTexture, TextureAtlas, type SkeletonData } from "@esotericsoftware/spine-pixi-v8";
import { type Asset, type ProjectDocument } from "@pixi-ui-editor/schema";
import { Texture, type Ticker } from "pixi.js";
import { collectRenderedNodes } from "../scene.js";
import { loadTexture, type FileUrlResolver } from "./textures.js";

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
