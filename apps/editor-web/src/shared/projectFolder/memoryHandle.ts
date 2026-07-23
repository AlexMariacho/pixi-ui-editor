import type { ProjectFolderHandle } from "./types.js";

/** Test-only escape hatch: exposes the exact file map so tests can assert paths/bytes are (un)touched. */
export type MemoryProjectFolderHandle = ProjectFolderHandle & {
  readonly files: Map<string, Blob>;
};

/** In-memory `ProjectFolderHandle` used by tests instead of a real File System Access directory. */
export function createMemoryProjectFolderHandle(name = "memory-project", initialFiles: Record<string, Blob> = {}): MemoryProjectFolderHandle {
  const files = new Map<string, Blob>(Object.entries(initialFiles));

  return {
    name,
    files,
    async listRootEntryNames() {
      const names = new Set<string>();
      for (const path of files.keys()) names.add(path.split("/")[0]!);
      return [...names];
    },
    async listAssetFilePaths() {
      return [...files.keys()].filter((path) => path.startsWith("assets/"));
    },
    async readFile(path) {
      return files.get(path);
    },
    async writeFile(path, blob) {
      files.set(path, blob);
    },
    async deleteFile(path) {
      files.delete(path);
    },
  };
}
