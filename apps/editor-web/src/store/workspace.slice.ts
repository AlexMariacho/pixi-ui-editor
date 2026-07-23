import { createStableId, type ProjectDocument, type ProjectManifest } from "@pixi-ui-editor/schema";
import editorPackageJson from "../../package.json";
import { createEmptyProjectDocument } from "./helpers.js";
import { hydrateAssetUrlRegistry } from "../shared/assetUrlRegistry.js";
import { buildEditorJson, type EditorJson } from "../shared/editorJson.js";
import {
  classifyProjectFolder,
  createFileSystemProjectFolderHandle,
  ensureReadWritePermission,
  getActiveProjectFolderHandle,
  isFileSystemAccessSupported,
  isNotFoundError,
  pickProjectDirectory,
  ProjectFolderAccessError,
  ProjectFolderError,
  readProjectFolder,
  setActiveProjectFolderHandle,
  writeProjectFolder,
} from "../shared/projectFolder/index.js";
import { withWorkingCopyLoadSuppressed } from "../shared/projectStore/loadGuard.js";
import { projectStore } from "../shared/projectStore/index.js";
import type { EditorSlice, EditorState } from "./types.js";

type Keys =
  | "manifest" | "folderName" | "dirty" | "folderBusy" | "bootstrapping" | "projectOpen" | "pendingWorkspaceSwitch"
  | "continueProject" | "createNewProject" | "newProject" | "saveProject" | "saveProjectAs" | "openProject" | "resolvePendingWorkspaceSwitch";

function describeProjectFolderError(error: unknown, action: "save" | "open"): string {
  if (error instanceof ProjectFolderAccessError) {
    switch (error.code) {
      case "UNSUPPORTED": return "This browser does not support opening project folders on disk. Use Chrome or Edge.";
      case "PERMISSION_DENIED": return "Permission to access the project folder was denied.";
      case "FOLDER_UNAVAILABLE": return "The linked project folder could not be found. It may have been moved, renamed, or deleted.";
      default: return error.message;
    }
  }
  if (error instanceof ProjectFolderError) return error.message;
  if (isNotFoundError(error)) return "The linked project folder could not be found. It may have been moved, renamed, or deleted.";
  return `Unable to ${action} the project. See the console for details.`;
}

function freshManifest(name: string): ProjectManifest {
  return { formatVersion: 1, projectId: createStableId(), name, createdAt: new Date().toISOString(), editorVersion: editorPackageJson.version };
}

/**
 * The part of the editor state that must never leak between projects: selection, preset-editing mode, undo
 * history, and every transient per-node authoring record (spine scrubbing, button/slider/progress-bar preview
 * values, particle playback/diagnostics) keyed by node IDs that belong to the *previous* document. Shared by
 * New and Open (TASK-047): both fully replace the working copy, so both must fully reset this.
 */
function freshEditingState(): Pick<
  EditorState,
  | "selectedNodeIds" | "selectedNodeId" | "editingPrefabId" | "activeTool" | "viewMode"
  | "undoStack" | "redoStack" | "historyGestureActive" | "historyGestureHasCommit"
  | "spineFrameRequests" | "spinePlaybackFrames" | "spineAutoplay"
  | "buttonPreviewStates" | "sliderPreviewValues" | "progressBarPreviewValues"
  | "particlePlayback" | "particleDiagnostics"
> {
  return {
    selectedNodeIds: [],
    selectedNodeId: null,
    editingPrefabId: null,
    activeTool: "select",
    viewMode: "single",
    undoStack: [],
    redoStack: [],
    historyGestureActive: false,
    historyGestureHasCommit: false,
    spineFrameRequests: {},
    spinePlaybackFrames: {},
    spineAutoplay: {},
    buttonPreviewStates: {},
    sliderPreviewValues: {},
    progressBarPreviewValues: {},
    particlePlayback: {},
    particleDiagnostics: {},
  };
}

type WorkspaceSnapshotInput = {
  document: ProjectDocument;
  manifest: ProjectManifest;
  editorState: EditorJson;
  assetBlobs: ReadonlyMap<string, Blob>;
  folderHandle: FileSystemDirectoryHandle | undefined;
  folderName: string | null;
  dirty: boolean;
};

/**
 * Replaces the entire working copy (IndexedDB, the bound folder handle, the asset URL registry, and every
 * bit of in-memory editor state) with `input`, then marks the project as open. This is the single choke
 * point New and Open both funnel through, so "switching projects leaves nothing behind" only has to be
 * true in one place. Exported so `workspace.slice.test.ts` can exercise the reset contract directly against
 * the in-memory `projectStore` backend without needing a real File System Access folder picker.
 */
export async function applyWorkspaceSnapshot(
  get: () => EditorState,
  set: (patch: Partial<EditorState>) => void,
  input: WorkspaceSnapshotInput,
): Promise<void> {
  await projectStore.clear();
  await projectStore.putDocument(input.document);
  await projectStore.putManifest(input.manifest);
  await projectStore.putEditorState(input.editorState);
  for (const [path, blob] of input.assetBlobs) await projectStore.putAssetBlob(path, blob);
  await projectStore.putFolderHandle(input.folderHandle);
  await projectStore.setDirty(input.dirty);

  hydrateAssetUrlRegistry(input.assetBlobs);
  setActiveProjectFolderHandle(input.folderHandle);

  const sceneId = input.document.scenes.some((scene) => scene.id === input.editorState.activeSceneId)
    ? (input.editorState.activeSceneId as string)
    : input.document.scenes[0]?.id ?? get().sceneId;

  withWorkingCopyLoadSuppressed(() => {
    set({
      ...freshEditingState(),
      document: input.document,
      sceneId,
      activeProfile: input.editorState.activeProfile,
      manifest: input.manifest,
      folderName: input.folderName,
      dirty: input.dirty,
      projectOpen: true,
    });
  });
}

/**
 * Picks (or reuses) a directory, classifies it (empty / already a project / occupied by unrelated
 * content), asks for an explicit confirm for the latter two per TASK-046's fixed decision, and returns
 * the picked `FileSystemDirectoryHandle` — or `undefined` if the user cancelled at any point.
 */
async function pickAndConfirmSaveAsDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  let picked: FileSystemDirectoryHandle;
  try {
    picked = await pickProjectDirectory();
  } catch (error) {
    if (error instanceof ProjectFolderAccessError && error.code === "PICKER_CANCELLED") return undefined;
    throw error;
  }

  const folderHandle = createFileSystemProjectFolderHandle(picked);
  const kind = await classifyProjectFolder(folderHandle);
  if (kind === "project") {
    if (!window.confirm(`"${picked.name}" already contains a project. Save As will overwrite it. Continue?`)) return undefined;
  } else if (kind === "occupied") {
    if (!window.confirm(`"${picked.name}" is not empty and has no project.json. The editor will manage its assets/ subfolder here. Continue?`)) return undefined;
  }
  return picked;
}

async function performSave(get: () => EditorState, set: (patch: Partial<EditorState>) => void, forceSaveAs: boolean): Promise<void> {
  if (get().folderBusy) return;
  if (!isFileSystemAccessSupported()) {
    window.alert("Saving to a folder requires Chrome or Edge (File System Access API).");
    return;
  }

  set({ folderBusy: true });
  try {
    const boundHandle = forceSaveAs ? undefined : getActiveProjectFolderHandle();
    let directoryHandle: FileSystemDirectoryHandle;
    if (boundHandle === undefined) {
      const picked = await pickAndConfirmSaveAsDirectory();
      if (picked === undefined) return;
      directoryHandle = picked;
    } else {
      directoryHandle = boundHandle;
    }

    await ensureReadWritePermission(directoryHandle);
    const folderHandle = createFileSystemProjectFolderHandle(directoryHandle);

    const state = get();
    const manifest: ProjectManifest = { ...(state.manifest ?? freshManifest(state.document.project.name)), editorVersion: editorPackageJson.version };
    const editorState = buildEditorJson(state.sceneId, state.activeProfile);
    const workingCopy = await projectStore.loadSnapshot();

    await writeProjectFolder(folderHandle, { document: state.document, manifest, editorState, assetBlobs: workingCopy.assetBlobs });

    setActiveProjectFolderHandle(directoryHandle);
    await projectStore.putFolderHandle(directoryHandle);
    await projectStore.putManifest(manifest);
    await projectStore.setDirty(false);

    set({ manifest, folderName: directoryHandle.name, dirty: false });
  } catch (error) {
    console.error("Unable to save the project folder.", error);
    window.alert(describeProjectFolderError(error, "save"));
  } finally {
    set({ folderBusy: false });
  }
}

async function performOpen(get: () => EditorState, set: (patch: Partial<EditorState>) => void): Promise<void> {
  if (get().folderBusy) return;
  if (!isFileSystemAccessSupported()) {
    window.alert("Opening a folder requires Chrome or Edge (File System Access API).");
    return;
  }

  set({ folderBusy: true });
  try {
    let picked: FileSystemDirectoryHandle;
    try {
      picked = await pickProjectDirectory();
    } catch (error) {
      if (error instanceof ProjectFolderAccessError && error.code === "PICKER_CANCELLED") return;
      throw error;
    }

    await ensureReadWritePermission(picked);
    const folderHandle = createFileSystemProjectFolderHandle(picked);
    const { snapshot } = await readProjectFolder(folderHandle, { editorVersion: editorPackageJson.version });

    await applyWorkspaceSnapshot(get, set, {
      document: snapshot.document,
      manifest: snapshot.manifest,
      editorState: snapshot.editorState,
      assetBlobs: snapshot.assetBlobs,
      folderHandle: picked,
      folderName: picked.name,
      dirty: false,
    });
  } catch (error) {
    console.error("Unable to open the project folder.", error);
    window.alert(describeProjectFolderError(error, "open"));
  } finally {
    set({ folderBusy: false });
  }
}

async function performCreateNewProject(get: () => EditorState, set: (patch: Partial<EditorState>) => void, name: string): Promise<void> {
  const document = createEmptyProjectDocument(name);
  const manifest = freshManifest(name);
  const editorState = buildEditorJson(document.scenes[0]?.id ?? null, "desktop");

  await applyWorkspaceSnapshot(get, set, {
    document,
    manifest,
    editorState,
    assetBlobs: new Map(),
    folderHandle: undefined,
    folderName: null,
    dirty: true,
  });
}

/** Not bound to a folder yet, so a new project has nothing to leak into the asset resolver. */
async function promptAndCreateNewProject(get: () => EditorState, set: (patch: Partial<EditorState>) => void): Promise<void> {
  const input = window.prompt("Project name", "Untitled Project");
  const name = input?.trim();
  if (name === undefined || name === "") return;
  await performCreateNewProject(get, set, name);
}

async function resolvePendingWorkspaceSwitch(get: () => EditorState, set: (patch: Partial<EditorState>) => void, action: "save" | "discard" | "cancel"): Promise<void> {
  const pending = get().pendingWorkspaceSwitch;
  if (pending === null) return;

  if (action === "cancel") {
    set({ pendingWorkspaceSwitch: null });
    return;
  }
  if (action === "save") {
    await performSave(get, set, false);
    if (get().dirty) return; // Save was cancelled or failed: keep the guard open so nothing is lost silently.
  }

  set({ pendingWorkspaceSwitch: null });
  if (pending === "new") await promptAndCreateNewProject(get, set);
  else await performOpen(get, set);
}

export const createWorkspaceSlice: EditorSlice<Keys> = (set, get) => ({
  manifest: undefined,
  folderName: null,
  dirty: false,
  folderBusy: false,
  bootstrapping: typeof indexedDB !== "undefined",
  projectOpen: false,
  pendingWorkspaceSwitch: null,
  continueProject: () => set({ projectOpen: true }),
  createNewProject: (name) => performCreateNewProject(get, set, name),
  newProject: () => {
    if (get().folderBusy) return;
    if (get().dirty) { set({ pendingWorkspaceSwitch: "new" }); return; }
    void promptAndCreateNewProject(get, set);
  },
  saveProject: () => performSave(get, set, false),
  saveProjectAs: () => performSave(get, set, true),
  openProject: () => {
    if (get().folderBusy) return;
    if (get().dirty) { set({ pendingWorkspaceSwitch: "open" }); return; }
    void performOpen(get, set);
  },
  resolvePendingWorkspaceSwitch: (action) => resolvePendingWorkspaceSwitch(get, set, action),
});

/** The project-folder service knows only its semantic command IDs, never keyboard or toolbar bindings. */
type ProjectFolderCommandRegistry = {
  subscribe(commandId: "project.new" | "project.save" | "project.saveAs" | "project.open", listener: () => void): () => void;
};

export function bindProjectFolderCommands(registry: ProjectFolderCommandRegistry, getState: () => EditorState): void {
  registry.subscribe("project.new", () => getState().newProject());
  registry.subscribe("project.save", () => { void getState().saveProject(); });
  registry.subscribe("project.saveAs", () => { void getState().saveProjectAs(); });
  registry.subscribe("project.open", () => getState().openProject());
}
