import { loadSceneFonts, loadSceneSpines, loadSceneTextures, loadSpineAsset, loadTexture, type AssetUrlResolver, type FileUrlResolver, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import type { Asset, ProjectDocument } from "@pixi-ui-editor/schema";
import type { Spritesheet, SpritesheetData, Texture } from "pixi.js";
import { resolveAssetReference, type AtlasAsset } from "../store/helpers.js";
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
const atlasSpritesheetCache = new Map<string, Spritesheet>();
const atlasJsonCache = new Map<string, SpritesheetData>();

export const resolveAssetUrl: AssetUrlResolver = (asset: Asset): string | undefined => {
  if (asset.type === "atlas") return resolveFileUrl(asset.files.texture.uri);
  if (asset.type !== "image" && asset.type !== "sound") return undefined;
  if (asset.source.uri.startsWith("data:")) return asset.source.uri;
  return SAMPLE_ASSET_URLS[asset.source.uri];
};

export const resolveFileUrl: FileUrlResolver = (uri) => uri.startsWith("data:") ? uri : SAMPLE_ASSET_URLS[uri];

export function loadEditorSceneTextures(document: ProjectDocument, sceneId: string) {
  return loadSceneTextures(document, sceneId, resolveAssetUrl, resolveFileUrl, textureCache, atlasSpritesheetCache);
}

/** Every image-compatible pick for an assetId dropdown: real image assets plus every atlas's frames. */
export function listImageAssetOptions(assets: Asset[]): { id: string; label: string }[] {
  const options: { id: string; label: string }[] = [];
  for (const asset of assets) {
    if (asset.type === "image") options.push({ id: asset.id, label: asset.name });
    else if (asset.type === "atlas") for (const frameName of Object.keys(asset.frames)) options.push({ id: asset.frames[frameName]!, label: `${asset.name} / ${frameName}` });
  }
  return options;
}

async function loadAtlasJsonData(asset: AtlasAsset): Promise<SpritesheetData> {
  const cached = atlasJsonCache.get(asset.files.json.uri);
  if (cached !== undefined) return cached;
  const url = resolveFileUrl(asset.files.json.uri);
  if (url === undefined) throw new Error(`Unable to resolve the JSON URL for atlas asset '${asset.id}'.`);
  const data = await fetch(url).then((response) => response.json() as Promise<SpritesheetData>);
  atlasJsonCache.set(asset.files.json.uri, data);
  return data;
}

export function getCachedAtlasJson(asset: AtlasAsset): SpritesheetData | undefined {
  return atlasJsonCache.get(asset.files.json.uri);
}

/** Ensures an atlas's spritesheet JSON is parsed and cached, e.g. before rendering cropped frame previews. */
export async function loadEditorAtlasJson(asset: AtlasAsset): Promise<SpritesheetData> {
  return loadAtlasJsonData(asset);
}

export function getCachedAtlasFrameSize(asset: AtlasAsset, frameName: string): { width: number; height: number } | undefined {
  const frame = atlasJsonCache.get(asset.files.json.uri)?.frames[frameName];
  if (frame === undefined) return undefined;
  const size = frame.sourceSize ?? frame.frame;
  return { width: size.w, height: size.h };
}

/** Ensures a dropped atlas frame uses the native pixel size recorded in its spritesheet JSON. */
export async function loadEditorAtlasFrameSize(asset: AtlasAsset, frameName: string): Promise<{ width: number; height: number } | undefined> {
  await loadAtlasJsonData(asset);
  return getCachedAtlasFrameSize(asset, frameName);
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

/** Resolves an asset id or atlas frame id, then loads its native size for a dropped node. */
export async function loadEditorAssetOrFrameSize(document: ProjectDocument, assetOrFrameId: string): Promise<{ width: number; height: number } | undefined> {
  const resolved = resolveAssetReference(document, assetOrFrameId);
  if (resolved === undefined) return undefined;
  if (resolved.kind === "atlasFrame") return loadEditorAtlasFrameSize(resolved.atlas, resolved.frameName);
  if (resolved.asset.type === "image") return loadEditorImageAssetSize(resolved.asset);
  if (resolved.asset.type === "spine") return loadEditorSpineAssetSize(resolved.asset);
  return undefined;
}

export function loadEditorSceneFonts(document: ProjectDocument, sceneId: string) { return loadSceneFonts(document, sceneId, resolveFileUrl); }

export function clearEditorSpineCache(skeletonUri?: string) {
  if (skeletonUri === undefined) spineCache.clear();
  else spineCache.delete(skeletonUri);
}
