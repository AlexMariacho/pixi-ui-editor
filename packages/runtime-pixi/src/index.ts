import { migrateProjectDocument, type Asset, type LayoutProfileId, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

export class ProjectDocumentJsonParseError extends Error {
  readonly code = "INVALID_JSON";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectDocumentJsonParseError";
  }
}

export function loadProjectDocument(input: unknown): ProjectDocument {
  return migrateProjectDocument(input);
}

export function parseProjectDocumentJson(json: string): ProjectDocument {
  try {
    return loadProjectDocument(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProjectDocumentJsonParseError("Unable to parse ProjectDocument JSON.", { cause: error });
    throw error;
  }
}

export type ResolvedProfileTransform = {
  transform: UINode["transform"];
  visible: boolean;
};

export type AssetUrlResolver = (asset: Asset) => string | undefined;

/** Resolves a node's base transform with a profile override applied field by field. */
export function resolveProfileTransform(node: UINode, profile: LayoutProfileId): ResolvedProfileTransform {
  const override = node.layoutOverrides?.[profile];

  return {
    transform: { ...node.transform, ...override?.transform },
    visible: override?.visible ?? node.visible,
  };
}

function createNodeView(node: UINode, transform: UINode["transform"], textures?: ReadonlyMap<string, Texture>): Container {
  switch (node.type) {
    case "container":
      return new Container();
    case "image": {
      const texture = textures?.get(node.assetId);
      if (texture !== undefined) {
        const sprite = new Sprite(texture);
        sprite.setSize(transform.width, transform.height);
        return sprite;
      }

      return new Graphics()
        .rect(0, 0, transform.width, transform.height)
        .fill(0x4a5568)
        .stroke({ width: 1, color: 0x94a3b8 });
    }
    case "text":
      return new Text({
        text: node.text,
        style: { fontFamily: "Arial", fontSize: 24, fill: 0xffffff },
      });
    case "spine":
    case "prefab-instance":
      return new Graphics().rect(0, 0, 100, 100).fill(0xff00ff);
  }
}

/** Builds a PixiJS display tree for a scene without depending on DOM or editor state. */
export function buildSceneView(
  document: ProjectDocument,
  sceneId: string,
  profile: LayoutProfileId,
  textures?: ReadonlyMap<string, Texture>,
): { root: Container; nodeViews: Map<string, Container> } {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);

  if (scene === undefined) {
    throw new Error(`Scene '${sceneId}' does not exist in the project document.`);
  }

  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const nodeViews = new Map<string, Container>();

  const buildNode = (nodeId: string): Container => {
    const node = nodesById.get(nodeId);

    if (node === undefined) {
      throw new Error(`Scene '${sceneId}' references missing node '${nodeId}'.`);
    }

    const { transform, visible } = resolveProfileTransform(node, profile);
    const view = createNodeView(node, transform, textures);
    const pivotX = (transform.pivotX ?? 0) * transform.width;
    const pivotY = (transform.pivotY ?? 0) * transform.height;
    view.pivot.set(pivotX, pivotY);
    view.position.set(transform.x + pivotX, transform.y + pivotY);
    view.scale.set(view.scale.x * transform.scaleX, view.scale.y * transform.scaleY);
    view.rotation = transform.rotation;
    view.visible = visible;
    nodeViews.set(node.id, view);

    for (const childId of node.children) {
      view.addChild(buildNode(childId));
    }

    return view;
  };

  const root = new Container();
  for (const rootNodeId of scene.rootNodeIds) {
    root.addChild(buildNode(rootNodeId));
  }

  return { root, nodeViews };
}

/** Loads one texture from a data URI or a regular URL. */
export async function loadTexture(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return Texture.from(image);
}

/** Loads textures for image nodes in a scene, leaving failed assets for placeholder rendering. */
export async function loadSceneTextures(
  document: ProjectDocument,
  sceneId: string,
  resolveAssetUrl: AssetUrlResolver,
  cache: Map<string, Texture> = new Map(),
): Promise<Map<string, Texture>> {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const textures = new Map<string, Texture>();

  for (const node of scene.nodes) {
    if (node.type !== "image" || textures.has(node.assetId)) continue;

    const asset = assetsById.get(node.assetId);
    if (asset === undefined) continue;

    const url = resolveAssetUrl(asset);
    if (url === undefined) continue;

    try {
      const texture = cache.get(asset.source.uri) ?? await loadTexture(url);
      cache.set(asset.source.uri, texture);
      textures.set(asset.id, texture);
    } catch (error) {
      console.warn(`Unable to load texture for asset '${asset.id}'.`, error);
    }
  }

  return textures;
}
