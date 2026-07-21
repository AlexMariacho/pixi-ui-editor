import { collectEffectAssetIds, type Asset, type ProjectDocument } from "@pixi-ui-editor/schema";
import { Spritesheet, Texture, type SpritesheetData } from "pixi.js";
import { collectRenderedNodes } from "../scene.js";
import { collectNodeAssetIds } from "../views/createNodeView.js";

export type AssetUrlResolver = (asset: Asset) => string | undefined;
export type FileUrlResolver = (uri: string) => string | undefined;
type AtlasAsset = Extract<Asset, { type: "atlas" }>;

/** Loads one texture from a data URI or a regular URL. */
export async function loadTexture(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return Texture.from(image);
}

/** Loads and parses one atlas's Spritesheet, sharing the parse by the JSON file's URI. */
export async function loadAtlasSpritesheet(
  asset: AtlasAsset,
  resolveFileUrl: FileUrlResolver,
  cache: Map<string, Spritesheet> = new Map(),
): Promise<Spritesheet> {
  const cached = cache.get(asset.files.json.uri);
  if (cached !== undefined) return cached;

  const jsonUrl = resolveFileUrl(asset.files.json.uri);
  const textureUrl = resolveFileUrl(asset.files.texture.uri);
  if (jsonUrl === undefined || textureUrl === undefined) throw new Error(`Unable to resolve file URLs for atlas asset '${asset.id}'.`);

  const [data, texture] = await Promise.all([
    fetch(jsonUrl).then((response) => response.json() as Promise<SpritesheetData>),
    loadTexture(textureUrl),
  ]);
  const sheet = new Spritesheet(texture, data);
  await sheet.parse();
  cache.set(asset.files.json.uri, sheet);
  return sheet;
}

/** Loads textures for image nodes in a scene, resolving atlas frame ids through their Spritesheet. Leaves failed assets for placeholder rendering. */
export async function loadSceneTextures(
  document: ProjectDocument,
  sceneId: string,
  resolveAssetUrl: AssetUrlResolver,
  resolveFileUrl: FileUrlResolver,
  cache: Map<string, Texture> = new Map(),
  spritesheetCache: Map<string, Spritesheet> = new Map(),
): Promise<Map<string, Texture>> {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const framesById = new Map<string, { atlas: AtlasAsset; frameName: string }>();
  for (const asset of document.assets) {
    if (asset.type !== "atlas") continue;
    for (const [frameName, frameId] of Object.entries(asset.frames)) framesById.set(frameId, { atlas: asset, frameName });
  }

  const textures = new Map<string, Texture>();

  for (const node of collectRenderedNodes(document, scene)) {
    const effect = node.type === "particle-emitter" ? document.effects.find((candidate) => candidate.id === node.effectId) : undefined;
    for (const assetId of [...collectNodeAssetIds(node), ...(effect === undefined ? [] : collectEffectAssetIds(effect))]) {
      if (textures.has(assetId)) continue;

      const asset = assetsById.get(assetId);
      if (asset?.type === "image") {
        const url = resolveAssetUrl(asset);
        if (url === undefined) continue;
        try {
          const texture = cache.get(asset.source.uri) ?? await loadTexture(url);
          cache.set(asset.source.uri, texture);
          textures.set(asset.id, texture);
        } catch (error) {
          console.warn(`Unable to load texture for asset '${asset.id}'.`, error);
        }
        continue;
      }
      // Spine и atlas-ассеты сюда тоже попадают: spine-данные грузит loadSceneSpines, а atlas-фреймы резолвятся ниже.
      if (asset !== undefined) continue;

      const frame = framesById.get(assetId);
      if (frame === undefined) continue;
      try {
        const sheet = await loadAtlasSpritesheet(frame.atlas, resolveFileUrl, spritesheetCache);
        const frameTexture = sheet.textures[frame.frameName];
        if (frameTexture === undefined) { console.warn(`Atlas '${frame.atlas.id}' has no frame '${frame.frameName}'.`); continue; }
        textures.set(assetId, frameTexture);
      } catch (error) {
        console.warn(`Unable to load atlas frame texture for '${assetId}'.`, error);
      }
    }
  }

  return textures;
}
