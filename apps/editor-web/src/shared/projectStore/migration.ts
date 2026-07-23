import type { FileUrlResolver } from "@pixi-ui-editor/runtime-pixi";
import { parseProjectDocumentJson } from "@pixi-ui-editor/runtime-pixi";
import { createStableId, type ProjectDocument, type ProjectManifest } from "@pixi-ui-editor/schema";
import editorPackageJson from "../../../package.json";
import { buildExportEntries } from "../exportPackage.js";
import { registerAssetUrl } from "../assetUrlRegistry.js";
import type { ProjectStore } from "./types.js";

/**
 * Downloads every asset file behind `sourceDocument` into Blobs stored in `store`, rewrites the document to
 * package-relative `assets/<assetId>/<fileName>` URIs (via the same naming module the ZIP export uses), and
 * stamps a fresh manifest. Used both for the one-time `localStorage` migration and for turning the bundled
 * sample project into the very first working copy.
 */
export async function materializeIntoProjectStore(store: ProjectStore, sourceDocument: ProjectDocument, resolveFileUrl: FileUrlResolver): Promise<ProjectDocument> {
  const { document, files } = buildExportEntries(sourceDocument, resolveFileUrl);

  for (const file of files) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Unable to fetch '${file.path}' (HTTP ${response.status}).`);
    const blob = await response.blob();
    await store.putAssetBlob(file.path, blob);
    registerAssetUrl(file.path, URL.createObjectURL(blob));
  }

  await store.putDocument(document);
  const manifest: ProjectManifest = {
    formatVersion: 1,
    projectId: createStableId(),
    name: document.project.name,
    createdAt: new Date().toISOString(),
    editorVersion: editorPackageJson.version,
  };
  await store.putManifest(manifest);
  return document;
}

export type LocalStorageMigrationResult =
  | { kind: "not-needed" }
  | { kind: "migrated"; document: ProjectDocument }
  | { kind: "failed"; error: unknown };

/**
 * One-shot migration of the legacy `localStorage` document into the IndexedDB working copy. A migration
 * failure (unparsable JSON, an asset URL that can't be resolved/fetched, ...) leaves `localStorage`
 * untouched and only logs a warning: the editor keeps falling back to the sample project as before.
 */
export async function migrateLocalStorageDocument(
  store: ProjectStore,
  readLocalStorageDocument: () => string | null,
  clearLocalStorageDocument: () => void,
  resolveFileUrl: FileUrlResolver,
): Promise<LocalStorageMigrationResult> {
  const stored = readLocalStorageDocument();
  if (stored === null) return { kind: "not-needed" };

  try {
    const sourceDocument = parseProjectDocumentJson(stored);
    const document = await materializeIntoProjectStore(store, sourceDocument, resolveFileUrl);
    clearLocalStorageDocument();
    return { kind: "migrated", document };
  } catch (error) {
    console.warn("Unable to migrate the saved project document from localStorage. It has been left untouched.", error);
    return { kind: "failed", error };
  }
}
