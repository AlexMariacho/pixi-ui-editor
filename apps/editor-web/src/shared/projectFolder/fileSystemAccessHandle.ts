import type { ProjectFolderHandle } from "./types.js";

export type ProjectFolderAccessErrorCode = "UNSUPPORTED" | "PICKER_CANCELLED" | "PERMISSION_DENIED" | "FOLDER_UNAVAILABLE";

/** Access-level errors: no File System Access API, the user cancelled the picker, permission was refused, or the linked folder is gone. */
export class ProjectFolderAccessError extends Error {
  constructor(readonly code: ProjectFolderAccessErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectFolderAccessError";
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export function isNotFoundError(error: unknown): boolean {
  return (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "NotFoundError")
    || (error instanceof Error && error.name === "NotFoundError");
}

function isAbortError(error: unknown): boolean {
  return (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError");
}

/** Opens the browser's directory picker with read/write intent. Never called on app load, only from a Save/Open user gesture. */
export async function pickProjectDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new ProjectFolderAccessError("UNSUPPORTED", "This browser does not support opening project folders on disk. Use Chrome or Edge.");
  }
  try {
    return await window.showDirectoryPicker!({ mode: "readwrite" });
  } catch (error) {
    if (isAbortError(error)) throw new ProjectFolderAccessError("PICKER_CANCELLED", "Folder selection was cancelled.");
    throw error;
  }
}

/** Lazily checks, and if needed requests, read/write permission for an already-picked or previously-remembered folder handle. */
export async function ensureReadWritePermission(directoryHandle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const queried = await directoryHandle.queryPermission({ mode: "readwrite" });
    if (queried === "granted") return;
    const requested = await directoryHandle.requestPermission({ mode: "readwrite" });
    if (requested !== "granted") throw new ProjectFolderAccessError("PERMISSION_DENIED", "Permission to access the project folder was denied.");
  } catch (error) {
    if (error instanceof ProjectFolderAccessError) throw error;
    if (isNotFoundError(error)) throw new ProjectFolderAccessError("FOLDER_UNAVAILABLE", "The linked project folder could not be found. It may have been moved, renamed, or deleted.");
    throw error;
  }
}

async function getNestedFileHandle(root: FileSystemDirectoryHandle, path: string, options: { create: boolean }): Promise<FileSystemFileHandle> {
  const segments = path.split("/");
  const fileName = segments.pop()!;
  let dir = root;
  for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: options.create });
  return dir.getFileHandle(fileName, { create: options.create });
}

async function walkFilePaths(dir: FileSystemDirectoryHandle, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for await (const [name, entryHandle] of dir.entries()) {
    const path = `${prefix}/${name}`;
    if (entryHandle.kind === "file") paths.push(path);
    else paths.push(...(await walkFilePaths(entryHandle as FileSystemDirectoryHandle, path)));
  }
  return paths;
}

/** Wraps a real `FileSystemDirectoryHandle` behind the generic `ProjectFolderHandle` interface `sync.ts` operates on. */
export function createFileSystemProjectFolderHandle(directoryHandle: FileSystemDirectoryHandle): ProjectFolderHandle {
  return {
    name: directoryHandle.name,
    async listRootEntryNames() {
      const names: string[] = [];
      for await (const name of directoryHandle.keys()) names.push(name);
      return names;
    },
    async listAssetFilePaths() {
      let assetsDir: FileSystemDirectoryHandle;
      try {
        assetsDir = await directoryHandle.getDirectoryHandle("assets", { create: false });
      } catch (error) {
        if (isNotFoundError(error)) return [];
        throw error;
      }
      return walkFilePaths(assetsDir, "assets");
    },
    async readFile(path) {
      try {
        const fileHandle = await getNestedFileHandle(directoryHandle, path, { create: false });
        return await fileHandle.getFile();
      } catch (error) {
        if (isNotFoundError(error)) return undefined;
        throw error;
      }
    },
    async writeFile(path, blob) {
      const fileHandle = await getNestedFileHandle(directoryHandle, path, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    },
    async deleteFile(path) {
      const segments = path.split("/");
      const fileName = segments.pop()!;
      try {
        let dir = directoryHandle;
        for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: false });
        await dir.removeEntry(fileName);
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    },
  };
}
