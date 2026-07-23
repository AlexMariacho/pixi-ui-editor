import { parseProjectDocumentJson } from "@pixi-ui-editor/runtime-pixi";
import { collectAssetFileEntries, createStableId, parseProjectManifest, serializeProjectDocument, serializeProjectManifest, type ProjectManifest } from "@pixi-ui-editor/schema";
import { parseEditorJson, serializeEditorJson } from "../editorJson.js";
import { ProjectFolderError, type ProjectFolderHandle, type ProjectFolderKind, type ProjectFolderSnapshot } from "./types.js";

function textBlob(text: string): Blob {
  return new Blob([text], { type: "application/json" });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether a candidate Save As folder is empty, already holds a project, or has unrelated content. */
export async function classifyProjectFolder(handle: ProjectFolderHandle): Promise<ProjectFolderKind> {
  const rootNames = await handle.listRootEntryNames();
  if (rootNames.length === 0) return "empty";
  return rootNames.includes("project.json") ? "project" : "occupied";
}

/**
 * Deterministic sync: writes the three canonical top-level files plus every asset file the document
 * references, then deletes any file under `assets/` that's no longer referenced. Never touches anything
 * outside `manifest.json`/`project.json`/`editor.json`/`assets/**` — foreign files (`.git`, `README.md`, ...)
 * are left alone. Writing the same snapshot twice produces byte-identical files both times.
 */
export async function writeProjectFolder(handle: ProjectFolderHandle, snapshot: ProjectFolderSnapshot): Promise<void> {
  const expectedAssetPaths = new Set(
    snapshot.document.assets.flatMap((asset) => collectAssetFileEntries(asset).map((entry) => entry.path)),
  );

  await handle.writeFile("manifest.json", textBlob(serializeProjectManifest(snapshot.manifest)));
  await handle.writeFile("project.json", textBlob(serializeProjectDocument(snapshot.document)));
  await handle.writeFile("editor.json", textBlob(serializeEditorJson(snapshot.editorState)));

  for (const path of expectedAssetPaths) {
    const blob = snapshot.assetBlobs.get(path);
    if (blob === undefined) throw new Error(`The working copy is missing the asset file for '${path}'.`);
    await handle.writeFile(path, blob);
  }

  const existingAssetPaths = await handle.listAssetFilePaths();
  for (const path of existingAssetPaths) {
    if (!expectedAssetPaths.has(path)) await handle.deleteFile(path);
  }
}

function regenerateManifest(document: ProjectFolderSnapshot["document"], editorVersion: string): ProjectManifest {
  return {
    formatVersion: 1,
    projectId: createStableId(),
    name: document.project.name,
    createdAt: new Date().toISOString(),
    editorVersion,
  };
}

export type ProjectFolderReadResult = {
  snapshot: ProjectFolderSnapshot;
  /** True when `manifest.json` was missing or unreadable and a fresh one was generated in its place. */
  manifestRegenerated: boolean;
};

/**
 * Reads a project folder into a working-copy snapshot. Throws `ProjectFolderError` (never partially
 * mutates anything, since it's pure reading) for the distinguishable Open failures: missing/invalid
 * `project.json`, or asset files the document references that aren't on disk.
 */
export async function readProjectFolder(handle: ProjectFolderHandle, options: { editorVersion: string }): Promise<ProjectFolderReadResult> {
  const projectJsonBlob = await handle.readFile("project.json");
  if (projectJsonBlob === undefined) {
    throw new ProjectFolderError("MISSING_PROJECT_JSON", `'${handle.name}' does not contain a project.json file.`);
  }

  let document: ProjectFolderSnapshot["document"];
  try {
    document = parseProjectDocumentJson(await projectJsonBlob.text());
  } catch (error) {
    throw new ProjectFolderError("INVALID_PROJECT_JSON", `'${handle.name}/project.json' is not a valid project file: ${errorMessage(error)}`, undefined, { cause: error });
  }

  let manifest: ProjectManifest | undefined;
  const manifestBlob = await handle.readFile("manifest.json");
  if (manifestBlob !== undefined) {
    try {
      manifest = parseProjectManifest(safeJsonParse(await manifestBlob.text()));
    } catch {
      manifest = undefined;
    }
  }
  const manifestRegenerated = manifest === undefined;
  if (manifestRegenerated) {
    manifest = regenerateManifest(document, options.editorVersion);
    console.warn(`'${handle.name}' had no valid manifest.json; a new one was generated (projectId '${manifest.projectId}').`);
  }

  const editorStateBlob = await handle.readFile("editor.json");
  const editorState = parseEditorJson(editorStateBlob === undefined ? undefined : safeJsonParse(await editorStateBlob.text()));

  const expectedAssetPaths = document.assets.flatMap((asset) => collectAssetFileEntries(asset).map((entry) => entry.path));
  const assetBlobs = new Map<string, Blob>();
  const missingPaths: string[] = [];
  for (const path of expectedAssetPaths) {
    const blob = await handle.readFile(path);
    if (blob === undefined) missingPaths.push(path);
    else assetBlobs.set(path, blob);
  }
  if (missingPaths.length > 0) {
    missingPaths.sort();
    throw new ProjectFolderError(
      "MISSING_ASSET_FILES",
      `'${handle.name}' is missing ${missingPaths.length} asset file(s): ${missingPaths.join(", ")}`,
      missingPaths,
    );
  }

  return { snapshot: { document, manifest: manifest!, editorState, assetBlobs }, manifestRegenerated };
}
