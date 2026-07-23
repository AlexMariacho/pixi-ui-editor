/**
 * Guards `store/index.ts`'s autosave/dirty subscribers while a working copy is being *loaded* wholesale
 * (initial bootstrap, or a completed Open) rather than mutated by the user. Without this, replacing
 * `state.document` via `setState` would re-trigger the "document changed" subscriber, which would write
 * the just-loaded document straight back into the store and flip `dirty` to `true` right after loading it.
 */
let suppressed = false;

export function withWorkingCopyLoadSuppressed<T>(fn: () => T): T {
  suppressed = true;
  try {
    return fn();
  } finally {
    suppressed = false;
  }
}

export function isWorkingCopyLoadSuppressed(): boolean {
  return suppressed;
}
