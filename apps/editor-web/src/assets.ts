import { loadSceneTextures, type AssetUrlResolver } from "@pixi-ui-editor/runtime-pixi";
import type { Asset, ProjectDocument } from "@pixi-ui-editor/schema";
import type { Texture } from "pixi.js";
import sampleLogoUrl from "../../../examples/sample-project/assets/sample-logo.png";

const SAMPLE_ASSET_URLS: Record<string, string> = {
  "assets/sample-logo.png": sampleLogoUrl,
};

const textureCache = new Map<string, Texture>();

export const resolveAssetUrl: AssetUrlResolver = (asset: Asset): string | undefined => {
  if (asset.source.uri.startsWith("data:")) return asset.source.uri;
  return SAMPLE_ASSET_URLS[asset.source.uri];
};

export function loadEditorSceneTextures(document: ProjectDocument, sceneId: string) {
  return loadSceneTextures(document, sceneId, resolveAssetUrl, textureCache);
}
