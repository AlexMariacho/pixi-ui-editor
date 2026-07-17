import { loadSceneFonts, loadSceneSpines, loadSceneTextures, loadSpineAsset, loadTexture, type AssetUrlResolver, type FileUrlResolver, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import type { Asset, ProjectDocument } from "@pixi-ui-editor/schema";
import type { Texture } from "pixi.js";
import buttonDisabledUrl from "../../../../examples/sample-project/assets/button-disabled.svg";
import buttonHoverUrl from "../../../../examples/sample-project/assets/button-hover.svg";
import buttonNormalUrl from "../../../../examples/sample-project/assets/button-normal.svg";
import buttonPressedUrl from "../../../../examples/sample-project/assets/button-pressed.svg";
import controlFillUrl from "../../../../examples/sample-project/assets/control-fill.svg";
import controlHandleUrl from "../../../../examples/sample-project/assets/control-handle.svg";
import controlTrackUrl from "../../../../examples/sample-project/assets/control-track.svg";
import sampleLogoUrl from "../../../../examples/sample-project/assets/sample-logo.png";

const SAMPLE_ASSET_URLS: Record<string, string> = {
  "assets/button-disabled.svg": buttonDisabledUrl,
  "assets/button-hover.svg": buttonHoverUrl,
  "assets/button-normal.svg": buttonNormalUrl,
  "assets/button-pressed.svg": buttonPressedUrl,
  "assets/control-fill.svg": controlFillUrl,
  "assets/control-handle.svg": controlHandleUrl,
  "assets/control-track.svg": controlTrackUrl,
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

/** Ensures a dropped image uses its native dimensions even before it is part of a scene. */
export async function loadEditorImageAssetSize(asset: Asset): Promise<{ width: number; height: number } | undefined> {
  if (asset.type !== "image") return undefined;
  const url = resolveAssetUrl(asset);
  if (url === undefined) return undefined;
  const texture = textureCache.get(asset.source.uri) ?? await loadTexture(url);
  textureCache.set(asset.source.uri, texture);
  return { width: texture.width, height: texture.height };
}

export function getCachedSpineAssetSize(asset: Asset): { width: number; height: number } | undefined {
  if (asset.type !== "spine") return undefined;
  const skeleton = spineCache.get(asset.files.skeleton.uri);
  if (skeleton === undefined || skeleton.width <= 0 || skeleton.height <= 0) return undefined;
  return { width: skeleton.width, height: skeleton.height };
}

/** Ensures a dropped Spine asset uses the bounds exported with its skeleton data. */
export async function loadEditorSpineAssetSize(asset: Asset): Promise<{ width: number; height: number } | undefined> {
  if (asset.type !== "spine") return undefined;
  await loadSpineAsset(asset, resolveFileUrl, spineCache);
  return getCachedSpineAssetSize(asset);
}

export function loadEditorSceneSpines(document: ProjectDocument, sceneId: string) {
  return loadSceneSpines(document, sceneId, resolveFileUrl, spineCache);
}

export function loadEditorSceneFonts(document: ProjectDocument, sceneId: string) { return loadSceneFonts(document, sceneId, resolveFileUrl); }

export function clearEditorSpineCache(skeletonUri?: string) {
  if (skeletonUri === undefined) spineCache.clear();
  else spineCache.delete(skeletonUri);
}
