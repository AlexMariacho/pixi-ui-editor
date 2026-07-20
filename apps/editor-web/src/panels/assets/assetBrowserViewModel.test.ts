import { describe, expect, it } from "vitest";
import type { Asset } from "@pixi-ui-editor/schema";
import { deriveAssetBrowser } from "./assetBrowserViewModel.js";

const asset = (id: string, name: string, type: Asset["type"]): Asset => ({ id, name, type } as Asset);
const atlas: Extract<Asset, { type: "atlas" }> = { id: "atlas", name: "Icons", type: "atlas", files: { json: { name: "icons.json", uri: "data:application/json;base64,e30=", mediaType: "application/json" }, texture: { name: "icons.png", uri: "data:image/png;base64,", mediaType: "image/png" } }, frames: { "play-button": "frame-play", "stop-button": "frame-stop" } };
const assets: Asset[] = [asset("image", "Logo", "image"), atlas, asset("spine", "Hero", "spine"), asset("font", "UI", "font"), asset("sound", "Click", "sound")];

describe("deriveAssetBrowser", () => {
  it("shows a matching frame with its collapsed parent without mutating manual expansion", () => {
    const expanded = new Set<string>();
    const [section] = deriveAssetBrowser(assets, "play", expanded, false);

    expect(section?.assets).toHaveLength(1);
    expect(section?.assets[0]).toMatchObject({ asset: { id: "atlas" }, expanded: true, frames: [["play-button", "frame-play"]] });
    expect(expanded.has("atlas")).toBe(false);
  });

  it("keeps fixed category and document order, leaves frames inside Atlases, and hides empty categories after search", () => {
    const sections = deriveAssetBrowser(assets, "button", new Set(["atlas"]), true);

    expect(sections.map((section) => section.label)).toEqual(["Atlases"]);
    expect(sections[0]?.assets.map(({ asset: current }) => current.id)).toEqual(["atlas"]);
    expect(sections[0]?.assets[0]?.frames).toEqual([["play-button", "frame-play"], ["stop-button", "frame-stop"]]);
  });
});
