import type { Asset } from "@pixi-ui-editor/schema";

export type AssetCategoryId = "images" | "atlases" | "spine" | "fonts" | "sounds";

export type BrowserAsset = { asset: Asset; frames: Array<[string, string]>; expanded: boolean };
export type AssetBrowserSection = { id: AssetCategoryId | "flat"; label: string; assets: BrowserAsset[] };

const categories: Array<{ id: AssetCategoryId; label: string; type: Asset["type"] }> = [
  { id: "images", label: "Images", type: "image" },
  { id: "atlases", label: "Atlases", type: "atlas" },
  { id: "spine", label: "Spine", type: "spine" },
  { id: "fonts", label: "Fonts", type: "font" },
  { id: "sounds", label: "Sounds", type: "sound" },
];

const normalized = (value: string) => value.trim().toLocaleLowerCase();
const matches = (value: string, query: string) => value.toLocaleLowerCase().includes(query);

/** Derives every browser representation without changing the user's manual expansion state. */
export function deriveAssetBrowser(assets: Asset[], searchQuery: string, expandedAtlasIds: ReadonlySet<string>, groupByCategory: boolean): AssetBrowserSection[] {
  const query = normalized(searchQuery);
  const visible = (asset: Asset): BrowserAsset | undefined => {
    const topLevelMatch = query === "" || matches(asset.name, query) || matches(asset.type, query);
    if (asset.type !== "atlas") return topLevelMatch ? { asset, frames: [], expanded: false } : undefined;

    const matchingFrames = Object.entries(asset.frames).filter(([frameName]) => matches(frameName, query) || matches(`${asset.name} / ${frameName}`, query));
    if (query !== "" && !topLevelMatch && matchingFrames.length === 0) return undefined;
    const frames = query !== "" && matchingFrames.length > 0
      ? matchingFrames
      : expandedAtlasIds.has(asset.id) ? Object.entries(asset.frames) : [];
    return { asset, frames, expanded: frames.length > 0 };
  };

  const browserAssets = assets.map(visible).filter((asset): asset is BrowserAsset => asset !== undefined);
  if (!groupByCategory) return [{ id: "flat", label: "", assets: browserAssets }];
  return categories.map((category) => ({
    id: category.id,
    label: category.label,
    assets: browserAssets.filter(({ asset }) => asset.type === category.type),
  })).filter((category) => category.assets.length > 0);
}
