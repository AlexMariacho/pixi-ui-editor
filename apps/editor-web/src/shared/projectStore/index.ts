export * from "./types.js";
export { createMemoryProjectStoreBackend } from "./memoryBackend.js";
export { createIndexedDbProjectStoreBackend } from "./indexedDbBackend.js";

import { createIndexedDbProjectStoreBackend } from "./indexedDbBackend.js";
import { createMemoryProjectStoreBackend } from "./memoryBackend.js";
import type { ProjectStore, ProjectStoreBackend } from "./types.js";

/** Thin, single choke point between the editor and its storage backend (real IndexedDB, or an injected test double). */
export function createProjectStore(backend: ProjectStoreBackend): ProjectStore {
  return backend;
}

/** The app's single working-copy store: real IndexedDB in a browser, in-memory when unavailable (e.g. Vitest under Node). */
export const projectStore: ProjectStore = createProjectStore(
  typeof indexedDB !== "undefined" ? createIndexedDbProjectStoreBackend() : createMemoryProjectStoreBackend(),
);
