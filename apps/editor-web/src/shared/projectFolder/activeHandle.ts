/**
 * The current session's bound `FileSystemDirectoryHandle`, if any. Kept outside zustand state (like
 * `assetUrlRegistry`'s blob-URL map) because a `FileSystemDirectoryHandle` isn't plain document data;
 * `store/workspace.slice.ts` mirrors just its `.name` into `EditorState` for the toolbar to render.
 */
let activeHandle: FileSystemDirectoryHandle | undefined;

export function getActiveProjectFolderHandle(): FileSystemDirectoryHandle | undefined {
  return activeHandle;
}

export function setActiveProjectFolderHandle(handle: FileSystemDirectoryHandle | undefined): void {
  activeHandle = handle;
}
