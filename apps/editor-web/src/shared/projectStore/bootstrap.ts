import type { ProjectDocument, ProjectManifest } from "@pixi-ui-editor/schema";
import { resolveFileUrl } from "../assets.js";
import { hydrateAssetUrlRegistry } from "../assetUrlRegistry.js";
import { parseEditorJson, type EditorJson } from "../editorJson.js";
import { setActiveProjectFolderHandle } from "../projectFolder/activeHandle.js";
import { DOCUMENT_STORAGE_KEY } from "../../store/types.js";
import { projectStore } from "./index.js";
import { migrateLocalStorageDocument } from "./migration.js";

export type BootstrapResult = {
  document: ProjectDocument;
  editorState: EditorJson;
  manifest: ProjectManifest | undefined;
  folderName: string | null;
  dirty: boolean;
};

/**
 * Runs once, only in a real browser (guarded by the caller on `typeof indexedDB !== "undefined"`, so it never
 * touches the many editor-store tests that run under Node without IndexedDB):
 * 1. an existing IndexedDB working copy wins outright;
 * 2. otherwise a legacy `localStorage` document (from before the IndexedDB working copy existed) is migrated into one;
 * 3. otherwise there is no working copy at all — the caller shows the startup screen (New/Open/Continue) instead of
 *    a canvas. The bundled sample project (`examples/sample-project`) is never auto-materialized as a working copy
 *    (TASK-047): it stays only a schema fixture/reference document.
 * In every case a resolved working copy ends up with every referenced asset as a Blob with a registered blob URL
 * before this resolves. A remembered folder handle (TASK-046) is registered but never touched for permission here:
 * querying/requesting permission stays lazy, only happening on an actual Save/Open user gesture.
 */
export async function bootstrapProjectStore(): Promise<BootstrapResult | undefined> {
  const snapshot = await projectStore.loadSnapshot();
  if (snapshot.document !== undefined) {
    hydrateAssetUrlRegistry(snapshot.assetBlobs);
    setActiveProjectFolderHandle(snapshot.folderHandle);
    return {
      document: snapshot.document,
      editorState: parseEditorJson(snapshot.editorState),
      manifest: snapshot.manifest,
      folderName: snapshot.folderHandle?.name ?? null,
      dirty: snapshot.dirty,
    };
  }

  const migration = await migrateLocalStorageDocument(
    projectStore,
    () => (typeof localStorage === "undefined" ? null : localStorage.getItem(DOCUMENT_STORAGE_KEY)),
    () => { if (typeof localStorage !== "undefined") localStorage.removeItem(DOCUMENT_STORAGE_KEY); },
    resolveFileUrl,
  );
  if (migration.kind === "migrated") {
    const migratedSnapshot = await projectStore.loadSnapshot();
    return { document: migration.document, editorState: parseEditorJson(undefined), manifest: migratedSnapshot.manifest, folderName: null, dirty: true };
  }

  return undefined;
}
