import type { ProjectDocument, ProjectManifest } from "@pixi-ui-editor/schema";
import type { EditorJson } from "../editorJson.js";

/**
 * Narrow, testable abstraction over "a folder on disk": the real File System Access backend
 * (`fileSystemAccessHandle.ts`) and the in-memory test double (`memoryHandle.ts`) both implement it, so
 * `sync.ts`'s read/write logic never touches `FileSystemDirectoryHandle` directly and can be unit-tested
 * without a browser.
 */
export type ProjectFolderHandle = {
  /** Display name of the folder (e.g. the OS directory name). */
  readonly name: string;
  /** Top-level entry names only (files and directories), used to classify the folder before Save As. */
  listRootEntryNames(): Promise<string[]>;
  /** Every file path under `assets/`, relative to the folder root (e.g. `assets/<id>/<file>`), recursive. Empty if `assets/` doesn't exist. */
  listAssetFilePaths(): Promise<string[]>;
  readFile(path: string): Promise<Blob | undefined>;
  writeFile(path: string, blob: Blob): Promise<void>;
  deleteFile(path: string): Promise<void>;
};

export type ProjectFolderSnapshot = {
  document: ProjectDocument;
  manifest: ProjectManifest;
  editorState: EditorJson;
  /** Keyed by the same package-relative path used in the document (`assets/<assetId>/<fileName>`). */
  assetBlobs: Map<string, Blob>;
};

/** How a candidate Save As folder classifies, before any write happens. */
export type ProjectFolderKind = "empty" | "project" | "occupied";

export type ProjectFolderErrorCode = "MISSING_PROJECT_JSON" | "INVALID_PROJECT_JSON" | "MISSING_ASSET_FILES";

/** Content-level Open errors: the folder was reachable, but its contents don't form a valid project. */
export class ProjectFolderError extends Error {
  constructor(readonly code: ProjectFolderErrorCode, message: string, readonly missingPaths?: string[], options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectFolderError";
  }
}
