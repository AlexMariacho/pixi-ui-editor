import type { Asset, ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import type { FileUrlResolver } from "./textures.js";

const cache = new Map<string, Promise<string | undefined>>();
const keyOf = (asset: Extract<Asset, { type: "font" }>) => `${asset.source.uri}#${asset.source.version ?? ""}`;
const fromNodes = (nodes: UINode[]) => nodes.flatMap((node) => {
  if (node.type === "text" && node.style?.fontAssetId) return [node.style.fontAssetId];
  if (node.type === "input" && node.textStyle.fontAssetId) return [node.textStyle.fontAssetId];
  if (node.type === "slider" && node.valueTextStyle?.fontAssetId) return [node.valueTextStyle.fontAssetId];
  return [];
});

/** Loads scene fonts before views are built. A load failure is a warning and keeps system fallback usable. */
export async function loadSceneFonts(document: ProjectDocument, sceneId: string, resolveFileUrl: FileUrlResolver): Promise<Map<string, string>> {
  const scene = document.scenes.find((item) => item.id === sceneId);
  if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);
  const ids = new Set(fromNodes(scene.nodes));
  scene.nodes.filter((node) => node.type === "prefab-instance").forEach((node) => fromNodes(document.prefabs.find((item) => item.id === node.prefabId)?.nodes ?? []).forEach((id) => ids.add(id)));
  const fonts = new Map<string, string>();
  await Promise.all([...ids].map(async (id) => {
    const asset = document.assets.find((item) => item.id === id);
    if (asset?.type !== "font") return;
    const key = keyOf(asset);
    let pending = cache.get(key);
    if (pending === undefined) {
      pending = (async () => {
        const url = resolveFileUrl(asset.source.uri);
        if (url === undefined || typeof FontFace === "undefined" || typeof globalThis.document === "undefined") return undefined;
        try { const face = new FontFace(asset.family, `url(${JSON.stringify(url)})`, { weight: asset.weight, style: asset.style }); await face.load(); globalThis.document.fonts.add(face); return asset.family; }
        catch (error) { console.warn(`Unable to load font asset '${asset.id}'. Using system fallback.`, error); return undefined; }
      })();
      cache.set(key, pending);
    }
    const family = await pending; if (family !== undefined) fonts.set(id, family);
  }));
  return fonts;
}
