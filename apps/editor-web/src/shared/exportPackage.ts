import type { FileUrlResolver } from "@pixi-ui-editor/runtime-pixi";
import { serializeProjectDocument, type Asset, type ProjectDocument } from "@pixi-ui-editor/schema";
import { strToU8, zipSync } from "fflate";

export type ExportFileEntry = { path: string; url: string };
export type ExportEntries = { document: ProjectDocument; files: ExportFileEntry[] };

const sanitizeName = (name: string) => {
  const safe = name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return safe === "" ? "file" : safe;
};

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

/** Image assets have no file name, so the exported name is the asset name plus a mediaType extension. */
function imageFileName(asset: Extract<Asset, { type: "image" }>): string {
  const extension = IMAGE_EXTENSIONS[asset.source.mediaType] ?? `.${sanitizeName(asset.source.mediaType.split("/")[1] ?? "bin")}`;
  return `${sanitizeName(asset.name)}${extension}`;
}

/** Rewrites every asset file URI to a package-relative `assets/<assetId>/<fileName>` path and lists the files to bundle. */
export function buildExportEntries(projectDocument: ProjectDocument, resolveFileUrl: FileUrlResolver): ExportEntries {
  const document = structuredClone(projectDocument);
  const files: ExportFileEntry[] = [];

  const addFile = (assetId: string, fileName: string, uri: string): string => {
    const url = resolveFileUrl(uri);
    if (url === undefined) throw new Error(`Unable to resolve a URL for asset file '${fileName}' of asset '${assetId}'.`);
    const path = `assets/${assetId}/${fileName}`;
    files.push({ path, url });
    return path;
  };

  for (const asset of document.assets) {
    if (asset.type === "image") {
      asset.source.uri = addFile(asset.id, imageFileName(asset), asset.source.uri);
    } else if (asset.type === "font") {
      const extension = asset.source.mediaType.split("/")[1] ?? "font";
      asset.source.uri = addFile(asset.id, `${sanitizeName(asset.name)}.${sanitizeName(extension)}`, asset.source.uri);
    } else if (asset.type === "sound") {
      const extension = SOUND_EXTENSIONS[asset.source.mediaType] ?? `.${sanitizeName(asset.source.mediaType.split("/")[1] ?? "bin")}`;
      asset.source.uri = addFile(asset.id, `${sanitizeName(asset.name)}${extension}`, asset.source.uri);
    } else if (asset.type === "atlas") {
      asset.files.json.uri = addFile(asset.id, asset.files.json.name, asset.files.json.uri);
      asset.files.texture.uri = addFile(asset.id, asset.files.texture.name, asset.files.texture.uri);
    } else if (asset.type === "spine") {
      asset.files.skeleton.uri = addFile(asset.id, asset.files.skeleton.name, asset.files.skeleton.uri);
      asset.files.atlas.uri = addFile(asset.id, asset.files.atlas.name, asset.files.atlas.uri);
      for (const texture of asset.files.textures) {
        texture.uri = addFile(asset.id, texture.name, texture.uri);
      }
    }
  }

  return { document, files };
}

/** Builds the zip package: canonical project.json plus the bytes of every asset file. */
export async function buildProjectPackageBlob(projectDocument: ProjectDocument, resolveFileUrl: FileUrlResolver): Promise<Blob> {
  const { document, files } = buildExportEntries(projectDocument, resolveFileUrl);
  const zipEntries: Record<string, Uint8Array> = { "project.json": strToU8(serializeProjectDocument(document)) };

  for (const file of files) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Unable to fetch '${file.path}' (HTTP ${response.status}).`);
    zipEntries[file.path] = new Uint8Array(await response.arrayBuffer());
  }

  return new Blob([zipSync(zipEntries)], { type: "application/zip" });
}

export function getExportZipFileName(projectName: string): string {
  return `${sanitizeName(projectName)}.zip`;
}

/** Export button handler: builds the package and triggers a browser download. */
export async function downloadProjectPackage(projectDocument: ProjectDocument, resolveFileUrl: FileUrlResolver): Promise<void> {
  try {
    const blob = await buildProjectPackageBlob(projectDocument, resolveFileUrl);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getExportZipFileName(projectDocument.project.name);
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Unable to export the project package.", error);
    alert("Unable to export the project package. See the console for details.");
  }
}
