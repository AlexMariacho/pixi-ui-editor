import { type SkeletonData } from "@esotericsoftware/spine-pixi-v8";
import { isLayoutGroup, isParticleEffect, type EffectDefinition, type LayoutProfileId, type ProjectDocument, type Scene, type UINode } from "@pixi-ui-editor/schema";
import { Container, Texture } from "pixi.js";
import { loadSceneSpines } from "./assets/spine.js";
import { loadSceneTextures, type FileUrlResolver } from "./assets/textures.js";
import { loadSceneFonts } from "./assets/fonts.js";
import { resolveAnchoredTransform, resolveProfileTransform, type LayoutSize } from "./layout.js";
import { NodeView, type SceneInteractionMode } from "./views/NodeView.js";
import { createNodeView } from "./views/createNodeView.js";
import { applyLayoutGroup, applyLayoutItem, createGridLineBreak, initializePixiLayout, LayoutItemContainer } from "./layoutGroups.js";
import { LayoutGroupNodeView } from "./views/basic.js";
import { ScrollItemContainer } from "./scrollView.js";
import { ScrollViewNodeView } from "./views/ScrollViewNodeView.js";
import type { Sound } from "@pixi/sound";

export type BuildSceneViewOptions = {
  /** Explicit: an editor canvas must pass "authoring", Preview and the consuming app "runtime". */
  interaction: SceneInteractionMode;
  textures?: ReadonlyMap<string, Texture>;
  spines?: ReadonlyMap<string, SkeletonData>;
  fonts?: ReadonlyMap<string, string>;
  sounds?: ReadonlyMap<string, Sound>;
  /** Called after Yoga changes a managed rectangle; authoring hosts use it to refresh overlays. */
  onLayout?: () => void;
};

/** Builds a PixiJS display tree for a scene without depending on DOM or editor state. */
export function buildSceneView(
  document: ProjectDocument,
  sceneId: string,
  profile: LayoutProfileId,
  options: BuildSceneViewOptions,
): { root: Container; nodeViews: Map<string, Container> } {
  initializePixiLayout();
  const { interaction, textures, spines, fonts, sounds, onLayout } = options;
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);

  if (scene === undefined) {
    throw new Error(`Scene '${sceneId}' does not exist in the project document.`);
  }

  const nodeViews = new Map<string, Container>();

  // Views раскрытых prefab-определений не регистрируются в nodeViews: инстанс редактируется как единое целое.
  const buildOwner = (owner: { rootNodeIds: string[]; nodes: UINode[] }, registerViews: boolean, expandingPrefabIds: ReadonlySet<string>, rootSize: LayoutSize): Container => {
    const nodesById = new Map(owner.nodes.map((node) => [node.id, node]));

    const buildNode = (nodeId: string, parentSize: LayoutSize): NodeView => {
      const node = nodesById.get(nodeId);

      if (node === undefined) {
        throw new Error(`Scene '${sceneId}' references missing node '${nodeId}'.`);
      }

      const resolved = resolveProfileTransform(node, profile);
      const transform = resolveAnchoredTransform(resolved.transform, parentSize);
      const view = createNodeView(node, interaction, textures, spines, (prefabId) => {
        const prefab = document.prefabs.find((candidate) => candidate.id === prefabId);
        if (prefab === undefined || expandingPrefabIds.has(prefabId)) return undefined;
        return buildOwner(prefab, false, new Set([...expandingPrefabIds, prefabId]), { width: transform.width, height: transform.height });
      }, fonts, sounds, node.type === "particle-emitter" ? document.effects.find((effect) => effect.id === node.effectId && isParticleEffect(effect)) : undefined);
      if (isLayoutGroup(node)) applyLayoutGroup(view, node, profile, parentSize);
      // Yoga owns only the group's inner layoutContent; the outer NodeView keeps authored transform.
      view.update(node, profile, parentSize);
      if (registerViews) nodeViews.set(node.id, view);

      const childSize = owner === scene && node.parentId === null
        ? rootSize
        : { width: transform.width, height: transform.height };
      for (const [childIndex, childId] of node.children.entries()) {
        const childNode = nodesById.get(childId);
        const childView = buildNode(childId, childSize);
        if (isLayoutGroup(node) && childNode !== undefined && view instanceof LayoutGroupNodeView) {
          const layoutItem = new LayoutItemContainer(childView, onLayout);
          applyLayoutItem(layoutItem, childNode, node, profile);
          view.addLayoutChild(layoutItem);
        } else if (node.type === "scroll-view" && childNode !== undefined && view instanceof ScrollViewNodeView) {
          const scrollItem = new ScrollItemContainer(childView, onLayout);
          // Как и у layout-item: собственный (не растянутый якорями) размер ребёнка — List не
          // предоставляет per-item override размера, в отличие от Yoga flexGrow/cellSize.
          const own = resolveProfileTransform(childNode, profile).transform;
          scrollItem.sync(childNode, profile, { width: own.width, height: own.height });
          view.addScrollItem(scrollItem);
        } else {
          view.addChild(childView);
        }
        if (node.type === "grid-layout") {
          const settings = node.layoutGroup.overrides?.[profile] === undefined ? node.layoutGroup.base : { ...node.layoutGroup.base, ...node.layoutGroup.overrides[profile] };
          if (settings.constraint !== "flexible" && settings.constraintCount !== undefined && (childIndex + 1) % settings.constraintCount === 0 && childIndex + 1 < node.children.length) {
            const lineBreak = createGridLineBreak(node, profile);
            if (lineBreak !== undefined && view instanceof LayoutGroupNodeView) view.addLayoutChild(lineBreak);
          }
        }
      }

      return view;
    };

    const ownerRoot = new Container();
    for (const rootNodeId of owner.rootNodeIds) {
      ownerRoot.addChild(buildNode(rootNodeId, rootSize));
    }

    return ownerRoot;
  };

  return { root: buildOwner(scene, true, new Set(), scene.layout.referenceViewports[profile]), nodeViews };
}

/**
 * Applies a node's resolved transform, visibility, and content to an existing display object,
 * so editors can update views in place without rebuilding the scene tree.
 */
export function updateNodeView(view: Container, node: UINode, profile: LayoutProfileId, parentSize?: LayoutSize, parentNode?: UINode, effect?: EffectDefinition): void {
  if (isLayoutGroup(node)) applyLayoutGroup(view, node, profile, parentSize);
  if (!(view instanceof NodeView)) return;
  if (node.type === "particle-emitter" && effect !== undefined && isParticleEffect(effect) && "syncEffect" in view && typeof (view as { syncEffect?: unknown }).syncEffect === "function") (view as { syncEffect(effect: import("@pixi-ui-editor/schema").ParticleEffectDefinition): void }).syncEffect(effect);
  if (parentNode !== undefined && isLayoutGroup(parentNode) && view.parent instanceof LayoutItemContainer) {
    applyLayoutItem(view.parent, node, parentNode, profile);
  } else if (parentNode !== undefined && parentNode.type === "scroll-view" && view.parent instanceof ScrollItemContainer) {
    const own = resolveProfileTransform(node, profile).transform;
    view.parent.sync(node, profile, { width: own.width, height: own.height });
  } else {
    view.update(node, profile, parentSize);
  }
}

/** Previews a resolved editor rectangle without consulting content bounds or rebuilding the view. */
export function previewNodeView(view: Container, node: UINode, profile: LayoutProfileId, transform: UINode["transform"]): void {
  if (isLayoutGroup(node)) applyLayoutGroup(view, node, profile, undefined, { width: transform.width, height: transform.height });
  if (view instanceof NodeView) view.preview(node, transform, resolveProfileTransform(node, profile).visible);
}

/** Hosts call this from their own Application ticker; runtime never subscribes to Ticker.shared. */
export function updateParticleEmitters(root: Container, deltaSeconds: number): void {
  const visit = (view: Container): void => { if ("updateParticles" in view && typeof (view as { updateParticles?: unknown }).updateParticles === "function") (view as { updateParticles(delta: number): void }).updateParticles(deltaSeconds); view.children.forEach(visit); };
  visit(root);
}

/** Lists the nodes a scene renders, including nodes of prefab definitions its prefab instances expand to. */
export function collectRenderedNodes(document: ProjectDocument, scene: Scene): UINode[] {
  const nodes: UINode[] = [];
  const expandedPrefabIds = new Set<string>();

  const visit = (list: UINode[]): void => {
    for (const node of list) {
      nodes.push(node);
      if (node.type !== "prefab-instance" || expandedPrefabIds.has(node.prefabId)) continue;
      expandedPrefabIds.add(node.prefabId);
      const prefab = document.prefabs.find((candidate) => candidate.id === node.prefabId);
      if (prefab !== undefined) visit(prefab.nodes);
    }
  };

  visit(scene.nodes);
  return nodes;
}

/** Loads a scene's textures and Spine data, then builds its display tree in one call. */
export async function loadSceneView(
  document: ProjectDocument,
  sceneId: string,
  profile: LayoutProfileId,
  resolveFileUrl: FileUrlResolver,
  options: { interaction: SceneInteractionMode },
): Promise<{ root: Container; nodeViews: Map<string, Container> }> {
  const [textures, spines, fonts] = await Promise.all([
    loadSceneTextures(document, sceneId, (asset) => (asset.type === "image" ? resolveFileUrl(asset.source.uri) : undefined), resolveFileUrl),
    loadSceneSpines(document, sceneId, resolveFileUrl),
    loadSceneFonts(document, sceneId, resolveFileUrl),
  ]);
  return buildSceneView(document, sceneId, profile, { interaction: options.interaction, textures, spines, fonts });
}
