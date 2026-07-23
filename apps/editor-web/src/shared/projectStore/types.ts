import type { ProjectDocument, ProjectManifest } from "@pixi-ui-editor/schema";
import type { EditorJson } from "../editorJson.js";

export type ProjectStoreSnapshot = {
  document: ProjectDocument | undefined;
  manifest: ProjectManifest | undefined;
  editorState: EditorJson | undefined;
  assetBlobs: Map<string, Blob>;
  dirty: boolean;
  /** The folder the working copy is bound to, if any (TASK-046). `undefined` under the in-memory test backend. */
  folderHandle: FileSystemDirectoryHandle | undefined;
};

/**
 * Async, narrow storage contract for the editor's single working copy. Real IndexedDB and the
 * in-memory test double implement the same interface so the rest of the editor never talks to
 * IndexedDB directly (`apps/editor-web/src/shared/projectStore/indexedDbBackend.ts` /
 * `memoryBackend.ts`). Committing the document/an asset blob/the editor state marks the working
 * copy dirty; `setDirty`/`clear` exist for the Save/New flows (TASK-046/047). `putFolderHandle`
 * remembers the last Save/Save As/Open target folder (a real `FileSystemDirectoryHandle` is
 * structured-cloneable and survives a page reload in IndexedDB) so a subsequent Ctrl+S can reuse it
 * without re-prompting the directory picker.
 */
export type ProjectStoreBackend = {
  loadSnapshot(): Promise<ProjectStoreSnapshot>;
  putDocument(document: ProjectDocument): Promise<void>;
  putManifest(manifest: ProjectManifest): Promise<void>;
  putEditorState(editorState: EditorJson): Promise<void>;
  putAssetBlob(path: string, blob: Blob): Promise<void>;
  deleteAssetBlob(path: string): Promise<void>;
  putFolderHandle(handle: FileSystemDirectoryHandle | undefined): Promise<void>;
  setDirty(dirty: boolean): Promise<void>;
  clear(): Promise<void>;
};

export type ProjectStore = ProjectStoreBackend;
