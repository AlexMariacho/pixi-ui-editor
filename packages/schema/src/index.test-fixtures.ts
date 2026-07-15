import {
  CURRENT_SCHEMA_VERSION,
  validateProjectDocument,
  type ProjectDocument,
  type ValidationResult,
} from "./index.js";

export const stableId = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

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
