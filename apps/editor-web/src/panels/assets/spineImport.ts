export type NamedFile = { name: string };

export type SpineFileBundle<T extends NamedFile> = {
  name: string;
  skeleton: T;
  atlas: T;
  textures: T[];
};

const extension = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();
const stem = (name: string) => name.slice(0, name.length - extension(name).length);
const imageExtension = /\.(png|jpe?g|webp)$/i;

/**
 * Splits a file selection into independent Spine bundles. A bundle is keyed by
 * its .atlas/.json basename; texture pages may use the same basename followed
 * by a separator (for example, `hero_0.png`).
 */
export function groupSpineFileBundles<T extends NamedFile>(files: T[]): { bundles: SpineFileBundle<T>[]; remaining: T[]; error?: string } {
  const atlases = files.filter((file) => extension(file.name) === ".atlas");
  if (atlases.length === 0) return { bundles: [], remaining: files };

  const skeletons = files.filter((file) => extension(file.name) === ".json");
  const textures = files.filter((file) => imageExtension.test(file.name));
  const claimed = new Set<T>(atlases);
  const bundles: SpineFileBundle<T>[] = [];

  for (const atlas of atlases) {
    const name = stem(atlas.name);
    const skeleton = skeletons.find((file) => stem(file.name) === name);
    const matchingTextures = textures.filter((file) => {
      const textureName = stem(file.name);
      return textureName === name || textureName.startsWith(`${name}_`) || textureName.startsWith(`${name}-`) || textureName.startsWith(`${name}.`) || textureName.startsWith(`${name} `);
    });
    // A single selected Spine bundle may use arbitrary page filenames. Keep the
    // original single-bundle workflow working in that case.
    const bundleTextures = matchingTextures.length > 0 || atlases.length > 1 ? matchingTextures : textures;
    if (skeleton === undefined || bundleTextures.length === 0) {
      return { bundles: [], remaining: files, error: `Spine bundle '${name}' needs matching .json, .atlas, and at least one PNG, JPG, or WebP texture.` };
    }
    claimed.add(skeleton);
    for (const texture of bundleTextures) claimed.add(texture);
    bundles.push({ name, skeleton, atlas, textures: bundleTextures });
  }

  const unclaimedSkeleton = skeletons.find((file) => !claimed.has(file));
  if (unclaimedSkeleton !== undefined) {
    return { bundles: [], remaining: files, error: "Each selected Spine file must belong to a bundle with matching base names." };
  }
  return { bundles, remaining: files.filter((file) => !claimed.has(file)) };
}
