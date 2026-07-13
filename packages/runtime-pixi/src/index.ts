import { migrateProjectDocument, type LayoutProfileId, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { Container, Graphics, Text } from "pixi.js";

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

/** Resolves a node's base transform with a profile override applied field by field. */
export function resolveProfileTransform(node: UINode, profile: LayoutProfileId): ResolvedProfileTransform {
  const override = node.layoutOverrides?.[profile];

  return {
    transform: { ...node.transform, ...override?.transform },
    visible: override?.visible ?? node.visible,
  };
}

function createNodeView(node: UINode): Container {
  switch (node.type) {
    case "container":
      return new Container();
    case "image":
      return new Graphics()
        .rect(0, 0, node.transform.width, node.transform.height)
        .fill(0x4a5568)
        .stroke({ width: 1, color: 0x94a3b8 });
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

    const view = createNodeView(node);
    const { transform, visible } = resolveProfileTransform(node, profile);
    view.position.set(transform.x, transform.y);
    view.scale.set(transform.scaleX, transform.scaleY);
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
