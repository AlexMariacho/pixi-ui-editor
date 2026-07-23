import type { ProjectDocument, ProjectManifest } from "@pixi-ui-editor/schema";
import type { EditorJson } from "../editorJson.js";
import type { ProjectStoreBackend } from "./types.js";

const DB_NAME = "pixi-ui-editor-project-store";
const DB_VERSION = 1;
const META_STORE = "meta";
const ASSET_BLOBS_STORE = "assetBlobs";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(ASSET_BLOBS_STORE)) db.createObjectStore(ASSET_BLOBS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the project store database."));
  });
}

/** Real, browser-only `ProjectStoreBackend`: one database, one working copy (`meta` key/value store + `assetBlobs` Blob store). */
export function createIndexedDbProjectStoreBackend(): ProjectStoreBackend {
  let dbPromise: Promise<IDBDatabase> | undefined;
  const db = (): Promise<IDBDatabase> => (dbPromise ??= openDatabase());

  async function getMeta<T>(key: string): Promise<T | undefined> {
    const database = await db();
    const tx = database.transaction(META_STORE, "readonly");
    return (await requestToPromise(tx.objectStore(META_STORE).get(key))) as T | undefined;
  }

  async function putMeta(key: string, value: unknown, alsoDirty: boolean): Promise<void> {
    const database = await db();
    const tx = database.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(value, key);
    if (alsoDirty) tx.objectStore(META_STORE).put(true, "dirty");
    await transactionDone(tx);
  }

  return {
    async loadSnapshot() {
      const database = await db();
      const [document, manifest, editorState, dirty, folderHandle] = await Promise.all([
        getMeta<ProjectDocument>("document"),
        getMeta<ProjectManifest>("manifest"),
        getMeta<EditorJson>("editorState"),
        getMeta<boolean>("dirty"),
        getMeta<FileSystemDirectoryHandle>("folderHandle"),
      ]);
      const tx = database.transaction(ASSET_BLOBS_STORE, "readonly");
      const store = tx.objectStore(ASSET_BLOBS_STORE);
      const [keys, values] = await Promise.all([requestToPromise(store.getAllKeys()), requestToPromise(store.getAll())]);
      const assetBlobs = new Map<string, Blob>();
      keys.forEach((key, index) => assetBlobs.set(String(key), values[index] as Blob));
      return { document, manifest, editorState, assetBlobs, dirty: dirty ?? false, folderHandle };
    },
    async putDocument(document) {
      await putMeta("document", document, true);
    },
    async putManifest(manifest) {
      await putMeta("manifest", manifest, false);
    },
    async putEditorState(editorState) {
      await putMeta("editorState", editorState, true);
    },
    async putAssetBlob(path, blob) {
      const database = await db();
      const tx = database.transaction([ASSET_BLOBS_STORE, META_STORE], "readwrite");
      tx.objectStore(ASSET_BLOBS_STORE).put(blob, path);
      tx.objectStore(META_STORE).put(true, "dirty");
      await transactionDone(tx);
    },
    async deleteAssetBlob(path) {
      const database = await db();
      const tx = database.transaction([ASSET_BLOBS_STORE, META_STORE], "readwrite");
      tx.objectStore(ASSET_BLOBS_STORE).delete(path);
      tx.objectStore(META_STORE).put(true, "dirty");
      await transactionDone(tx);
    },
    async putFolderHandle(handle) {
      await putMeta("folderHandle", handle, false);
    },
    async setDirty(dirty) {
      await putMeta("dirty", dirty, false);
    },
    async clear() {
      const database = await db();
      const tx = database.transaction([META_STORE, ASSET_BLOBS_STORE], "readwrite");
      tx.objectStore(META_STORE).clear();
      tx.objectStore(ASSET_BLOBS_STORE).clear();
      await transactionDone(tx);
    },
  };
}
