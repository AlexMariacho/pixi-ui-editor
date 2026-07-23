import type { Asset } from "./index.js";

/**
 * Single source of truth for `Asset -> project folder relative path` naming, shared by the exported ZIP
 * package (`apps/editor-web/src/shared/exportPackage.ts`) and the IndexedDB working copy (`projectStore`):
 * both must resolve the same asset to the same `assets/<assetId>/<fileName>` path.
 */

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
};

const SOUND_EXTENSIONS: Record<string, string> = {
  "audio/wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
};

export function sanitizeName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return safe === "" ? "file" : safe;
}

/** Image/font/sound assets have no uploaded file name, so the file name is the asset name plus a mediaType extension. */
export function imageFileName(asset: { name: string; source: { mediaType: string } }): string {
  const extension = IMAGE_EXTENSIONS[asset.source.mediaType] ?? `.${sanitizeName(asset.source.mediaType.split("/")[1] ?? "bin")}`;
  return `${sanitizeName(asset.name)}${extension}`;
}

export function fontFileName(asset: { name: string; source: { mediaType: string } }): string {
  const extension = asset.source.mediaType.split("/")[1] ?? "font";
  return `${sanitizeName(asset.name)}.${sanitizeName(extension)}`;
}

export function soundFileName(asset: { name: string; source: { mediaType: string } }): string {
  const extension = SOUND_EXTENSIONS[asset.source.mediaType] ?? `.${sanitizeName(asset.source.mediaType.split("/")[1] ?? "bin")}`;
  return `${sanitizeName(asset.name)}${extension}`;
}

/** Package-relative path for one asset file, per the fixed folder layout (`assets/<assetId>/<fileName>`). */
export function assetFilePath(assetId: string, fileName: string): string {
  return `assets/${assetId}/${fileName}`;
}

export type AssetFileEntry = { path: string; fileName: string; mediaType: string };

/** Every relative-path file entry an asset owns: multi-file assets (atlas/Spine) keep their original uploaded file names. */
export function collectAssetFileEntries(asset: Asset): AssetFileEntry[] {
  if (asset.type === "image") { const fileName = imageFileName(asset); return [{ path: assetFilePath(asset.id, fileName), fileName, mediaType: asset.source.mediaType }]; }
  if (asset.type === "font") { const fileName = fontFileName(asset); return [{ path: assetFilePath(asset.id, fileName), fileName, mediaType: asset.source.mediaType }]; }
  if (asset.type === "sound") { const fileName = soundFileName(asset); return [{ path: assetFilePath(asset.id, fileName), fileName, mediaType: asset.source.mediaType }]; }
  if (asset.type === "atlas") {
    return [
      { path: assetFilePath(asset.id, asset.files.json.name), fileName: asset.files.json.name, mediaType: asset.files.json.mediaType },
      { path: assetFilePath(asset.id, asset.files.texture.name), fileName: asset.files.texture.name, mediaType: asset.files.texture.mediaType },
    ];
  }
  return [
    { path: assetFilePath(asset.id, asset.files.skeleton.name), fileName: asset.files.skeleton.name, mediaType: asset.files.skeleton.mediaType },
    { path: assetFilePath(asset.id, asset.files.atlas.name), fileName: asset.files.atlas.name, mediaType: asset.files.atlas.mediaType },
    ...asset.files.textures.map((texture) => ({ path: assetFilePath(asset.id, texture.name), fileName: texture.name, mediaType: texture.mediaType })),
  ];
}
