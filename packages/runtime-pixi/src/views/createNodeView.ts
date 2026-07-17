import { BUTTON_STATE_KEYS, type UINode } from "@pixi-ui-editor/schema";
import { type SkeletonData } from "@esotericsoftware/spine-pixi-v8";
import { Container, Texture } from "pixi.js";
import { ButtonNodeView } from "./ButtonNodeView.js";
import { ContainerNodeView, ImageNodeView, LayoutGroupNodeView, PrefabInstanceNodeView, TextNodeView } from "./basic.js";
import { InputNodeView } from "./InputNodeView.js";
import { NodeView, type SceneInteractionMode } from "./NodeView.js";
import { ScrollViewNodeView } from "./ScrollViewNodeView.js";
import { SpineNodeView } from "./SpineNodeView.js";
import { ProgressBarNodeView, SliderNodeView } from "./ValueControlNodeViews.js";

export function createNodeView(node: UINode, interaction: SceneInteractionMode, textures?: ReadonlyMap<string, Texture>, spines?: ReadonlyMap<string, SkeletonData>, expandPrefab?: (prefabId: string) => Container | undefined, fonts?: ReadonlyMap<string, string>): NodeView {
  switch (node.type) {
    case "container":
      return new ContainerNodeView();
    case "horizontal-layout":
    case "vertical-layout":
    case "grid-layout":
      return new LayoutGroupNodeView(textures);
    case "scroll-view":
      return new ScrollViewNodeView(node, textures, interaction);
    case "image":
      return new ImageNodeView(node.assetId, textures);
    case "text":
      return new TextNodeView(node.text, fonts);
    case "spine":
      return new SpineNodeView(spines?.get(node.assetId), node.animation, node.loop ?? true);
    case "button":
      return new ButtonNodeView(node, textures, interaction);
    case "input":
      return new InputNodeView(node, textures, interaction, fonts);
    case "slider":
      return new SliderNodeView(node, textures, interaction, fonts);
    case "progress-bar":
      return new ProgressBarNodeView(node, textures);
    case "prefab-instance":
      return new PrefabInstanceNodeView(expandPrefab?.(node.prefabId));
  }
}

/**
 * Every asset a node references: the image, the Spine data, or each of a button's state images.
 * Single source of truth for "which assets does this node use" — texture loading and the editor's
 * usage count both read it, so a new node type can never silently drop out of one of them.
 */
export function collectNodeAssetIds(node: UINode): string[] {
  switch (node.type) {
    case "image":
    case "spine":
      return [node.assetId];
    case "button":
      return BUTTON_STATE_KEYS
        .map((state) => node.states[`${state}AssetId`])
        .filter((assetId): assetId is string => assetId !== undefined);
    case "container":
    case "prefab-instance":
      return [];
    case "horizontal-layout":
    case "vertical-layout":
    case "grid-layout": {
      const backgroundAssetId = node.backgroundAssetId;
      return backgroundAssetId === undefined ? [] : [backgroundAssetId];
    }
    case "scroll-view":
      return [];
    case "text":
      return node.style?.fontAssetId === undefined ? [] : [node.style.fontAssetId];
    case "input": {
      const ids: string[] = [];
      if (node.backgroundAssetId !== undefined) ids.push(node.backgroundAssetId);
      if (node.textStyle.fontAssetId !== undefined) ids.push(node.textStyle.fontAssetId);
      return ids;
    }
    case "slider": {
      const ids = [node.backgroundAssetId, node.fillAssetId, node.handleAssetId];
      if (node.valueTextStyle?.fontAssetId !== undefined) ids.push(node.valueTextStyle.fontAssetId);
      return ids;
    }
    case "progress-bar":
      return [node.backgroundAssetId, node.fillAssetId];
  }
}
