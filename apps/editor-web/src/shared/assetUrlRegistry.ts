/**
 * Mutable registry of package-relative asset path -> displayable URL, populated by the editor at working-copy
 * load time and whenever an asset is added/replaced. `resolveAssetUrl`/`resolveFileUrl` (`shared/assets.ts`)
 * consult it so `AssetUrlResolver`/`FileUrlResolver` stay plain functions while the actual blob URLs are
 * supplied from outside. Registering over an existing blob: URL revokes the old one; nothing is ever left dangling.
 */
const registry = new Map<string, string>();

function revokeIfBlobUrl(url: string | undefined): void {
  if (url !== undefined && url.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(url);
}

export function registerAssetUrl(path: string, url: string): void {
  const existing = registry.get(path);
  if (existing !== url) revokeIfBlobUrl(existing);
  registry.set(path, url);
}

export function unregisterAssetUrl(path: string): void {
  revokeIfBlobUrl(registry.get(path));
  registry.delete(path);
}

export function lookupAssetUrl(path: string): string | undefined {
  return registry.get(path);
}

/** Revokes every registered blob URL and empties the registry, e.g. before hydrating a freshly loaded working copy. */
export function clearAssetUrlRegistry(): void {
  for (const url of registry.values()) revokeIfBlobUrl(url);
  registry.clear();
}

/** Replaces the whole registry with fresh blob URLs for every asset Blob in a loaded working copy snapshot. */
export function hydrateAssetUrlRegistry(assetBlobs: ReadonlyMap<string, Blob>): void {
  clearAssetUrlRegistry();
  for (const [path, blob] of assetBlobs) registerAssetUrl(path, URL.createObjectURL(blob));
}
