import {
  BUTTON_STATE_KEYS,
  CURRENT_SCHEMA_VERSION,
  validateProjectDocument,
  type ProjectDocument,
  type UINode,
  type ValidationResult,
} from "./index.js";

export type ButtonNode = Extract<UINode, { type: "button" }>;

/** Appends a button whose four states each reference their own image asset, wired into the fixture's scene root. */
export function addButtonNode(document: ProjectDocument): ButtonNode {
  const scene = document.scenes[0]!;
  const root = scene.nodes[0]!;
  const assetIds = BUTTON_STATE_KEYS.map((state, index) => {
    const id = stableId(10 + index);
    document.assets.push({ id, name: `Button ${state}`, type: "image", source: { uri: `assets/button-${state}.png`, mediaType: "image/png" } });
    return id;
  });

  const button: ButtonNode = {
    id: stableId(20),
    name: "Play",
    type: "button",
    parentId: root.id,
    children: [],
    visible: true,
    enabled: true,
    states: { normalAssetId: assetIds[0]!, hoverAssetId: assetIds[1]!, pressedAssetId: assetIds[2]!, disabledAssetId: assetIds[3]! },
    transform: { x: 0, y: 0, width: 120, height: 40, scaleX: 1, scaleY: 1, rotation: 0 },
  };
  root.children.push(button.id);
  scene.nodes.push(button);
  return button;
}

export const stableId = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

/** Appends an atlas asset with one named frame and points an existing image node at that frame id. */
export function addAtlasAssetWithFrame(document: ProjectDocument): { atlasId: string; frameId: string } {
  const atlasId = stableId(40);
  const frameId = stableId(41);
  document.assets.push({
    id: atlasId,
    name: "Atlas",
    type: "atlas",
    files: {
      json: { name: "atlas.json", uri: "assets/atlas.json", mediaType: "application/json" },
      texture: { name: "atlas.png", uri: "assets/atlas.png", mediaType: "image/png" },
    },
    frames: { "icon.png": frameId },
  });
  (document.scenes[0]!.nodes[1] as { assetId: string }).assetId = frameId;
  return { atlasId, frameId };
}

export function createProjectDocumentFixture(): ProjectDocument {
  const project = stableId(1);
  const scene = stableId(2);
  const root = stableId(3);
  const image = stableId(4);
  const asset = stableId(5);
  const prefab = stableId(6);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: { id: project, name: "Project" },
    settings: {
      layoutProfileSelection: { mode: "aspect-ratio", mobileMaxAspectRatio: 1 },
    },
    assets: [
      {
        id: asset,
        name: "Logo",
        type: "image",
        source: { uri: "assets/logo.png", mediaType: "image/png" },
      },
    ],
    prefabs: [
      {
        id: prefab,
        name: "Badge",
        rootNodeIds: [],
        nodes: [],
        exposedProperties: [],
      },
    ],
    scenes: [
      {
        id: scene,
        name: "Main",
        rootNodeIds: [root],
        layout: {
          referenceViewports: {
            desktop: { width: 1920, height: 1080 },
            mobile: { width: 390, height: 844 },
          },
        },
        nodes: [
          {
            id: root,
            name: "Root",
            type: "container",
            parentId: null,
            children: [image],
            visible: true,
            transform: {
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          },
          {
            id: image,
            name: "Logo",
            type: "image",
            assetId: asset,
            parentId: root,
            children: [],
            visible: true,
            transform: {
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          },
        ],
      },
    ],
  };
}

export function validateFixtureMutation(mutate: (document: ProjectDocument) => void): ValidationResult {
  const document = createProjectDocumentFixture();
  mutate(document);
  return validateProjectDocument(document);
}
