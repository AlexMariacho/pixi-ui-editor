import { type Asset, type ProjectDocument } from "@pixi-ui-editor/schema";
import { Texture } from "pixi.js";
import { collectRenderedNodes } from "../scene.js";
import { collectNodeAssetIds } from "../views/createNodeView.js";

export type AssetUrlResolver = (asset: Asset) => string | undefined;
export type FileUrlResolver = (uri: string) => string | undefined;

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
