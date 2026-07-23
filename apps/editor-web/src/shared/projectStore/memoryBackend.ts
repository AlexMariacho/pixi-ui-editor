import type { ProjectDocument, ProjectManifest } from "@pixi-ui-editor/schema";
import type { EditorJson } from "../editorJson.js";
import type { ProjectStoreBackend } from "./types.js";

/** In-memory `ProjectStoreBackend` used by tests instead of a real IndexedDB (no `fake-indexeddb` dependency). */
export function createMemoryProjectStoreBackend(): ProjectStoreBackend {
  let document: ProjectDocument | undefined;
  let manifest: ProjectManifest | undefined;
  let editorState: EditorJson | undefined;
  let dirty = false;
  let folderHandle: FileSystemDirectoryHandle | undefined;
  const assetBlobs = new Map<string, Blob>();

  return {
    async loadSnapshot() {
      return { document, manifest, editorState, dirty, assetBlobs: new Map(assetBlobs), folderHandle };
    },
    async putDocument(nextDocument) {
      document = nextDocument;
      dirty = true;
    },
    async putManifest(nextManifest) {
      manifest = nextManifest;
    },
    async putEditorState(nextEditorState) {
      editorState = nextEditorState;
      dirty = true;
    },
    async putAssetBlob(path, blob) {
      assetBlobs.set(path, blob);
      dirty = true;
    },
    async deleteAssetBlob(path) {
      assetBlobs.delete(path);
      dirty = true;
    },
    async putFolderHandle(handle) {
      folderHandle = handle;
    },
    async setDirty(value) {
      dirty = value;
    },
    async clear() {
      document = undefined;
      manifest = undefined;
      editorState = undefined;
      dirty = false;
      folderHandle = undefined;
      assetBlobs.clear();
    },
  };
}
