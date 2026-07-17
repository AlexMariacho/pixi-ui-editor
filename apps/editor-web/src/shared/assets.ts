import { loadSceneSpines, loadSceneTextures, type AssetUrlResolver, type FileUrlResolver, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import type { Asset, ProjectDocument } from "@pixi-ui-editor/schema";
import type { Texture } from "pixi.js";
import sampleLogoUrl from "../../../../examples/sample-project/assets/sample-logo.png";

const SAMPLE_ASSET_URLS: Record<string, string> = {
  "assets/sample-logo.png": sampleLogoUrl,
};

const textureCache = new Map<string, Texture>();
const spineCache = new Map<string, SkeletonData>();

export const resolveAssetUrl: AssetUrlResolver = (asset: Asset): string | undefined => {
  if (asset.type !== "image") return undefined;
  if (asset.source.uri.startsWith("data:")) return asset.source.uri;
  return SAMPLE_ASSET_URLS[asset.source.uri];
};

export const resolveFileUrl: FileUrlResolver = (uri) => uri.startsWith("data:") ? uri : SAMPLE_ASSET_URLS[uri];

export function loadEditorSceneTextures(document: ProjectDocument, sceneId: string) {
  return loadSceneTextures(document, sceneId, resolveAssetUrl, textureCache);
}

export function getCachedImageAssetSize(asset: Asset): { width: number; height: number } | undefined {
  if (asset.type !== "image") return undefined;
  const texture = textureCache.get(asset.source.uri);
  if (texture === undefined) return undefined;
  return { width: texture.width, height: texture.height };
}

export function loadEditorSceneSpines(document: ProjectDocument, sceneId: string) {
  return loadSceneSpines(document, sceneId, resolveFileUrl, spineCache);
}

export function clearEditorSpineCache(skeletonUri?: string) {
  if (skeletonUri === undefined) spineCache.clear();
  else spineCache.delete(skeletonUri);
}
