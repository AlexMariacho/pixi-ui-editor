import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createStableId,
  migrateProjectDocument,
  serializeProjectDocument,
  validateProjectDocument,
  type ProjectDocument,
} from "./index.js";
import {
  addButtonNode,
  createProjectDocumentFixture,
  stableId,
  validateFixtureMutation,
} from "./index.test-fixtures.js";

describe("schema v1", () => {
  it("generates independent UUID stable IDs", () => {
    const first = createStableId();
    const second = createStableId();
    expect(first).toMatch(/^[0-9a-f]{8}-/i);
    expect(first).not.toBe(second);
  });

  it("accepts a minimal valid document", () => {
    expect(validateProjectDocument(createProjectDocumentFixture())).toEqual({ valid: true, issues: [] });
  });

  it("accepts normalized anchors and rejects values outside the parent rectangle", () => {
    const document = createProjectDocumentFixture();
    document.scenes[0]!.nodes[1]!.transform.anchorMinX = 0.5;
    document.scenes[0]!.nodes[1]!.transform.anchorMinY = 1;
    expect(validateProjectDocument(document).valid).toBe(true);

    document.scenes[0]!.nodes[1]!.transform.anchorMinX = 1.1;
    expect(validateProjectDocument(document).issues[0]!.code).toBe("STRUCTURAL_SCHEMA");
  });

  it("allows non-positive width only on a stretched axis", () => {
    const document = createProjectDocumentFixture();
    const transform = document.scenes[0]!.nodes[1]!.transform;
    transform.width = -20;
    expect(validateProjectDocument(document).issues[0]!.code).toBe("NON_POSITIVE_SIZE");

    transform.anchorMinX = 0;
    transform.anchorMaxX = 1;
    expect(validateProjectDocument(document).valid).toBe(true);
  });

  it("migrates v1 point anchors to v2 anchorMin/anchorMax pairs", () => {
    const document = createProjectDocumentFixture() as unknown as Record<string, unknown>;
    document.schemaVersion = 1;
    const v1Document = document as unknown as ProjectDocument;
    const transform = v1Document.scenes[0]!.nodes[1]!.transform as Record<string, unknown>;
    transform.anchorX = 0.5;
    transform.anchorY = 1;
    v1Document.scenes[0]!.nodes[1]!.layoutOverrides = { mobile: { transform: { anchorX: 0.25 } as never } };

    const migrated = migrateProjectDocument(document);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.scenes[0]!.nodes[1]!.transform).toMatchObject({ anchorMinX: 0.5, anchorMaxX: 0.5, anchorMinY: 1, anchorMaxY: 1 });
    expect(migrated.scenes[0]!.nodes[1]!.transform).not.toHaveProperty("anchorX");
    expect(migrated.scenes[0]!.nodes[1]!.layoutOverrides?.mobile?.transform).toEqual({ anchorMinX: 0.25, anchorMaxX: 0.25 });
  });

  it("accepts a button whose four states reference image assets", () => {
    const document = createProjectDocumentFixture();
    addButtonNode(document);
    expect(validateProjectDocument(document)).toEqual({ valid: true, issues: [] });
  });

  it("reports the offending state field when a button state references a non-image asset", () => {
    const document = createProjectDocumentFixture();
    const button = addButtonNode(document);
    const spineAsset = stableId(30);
    document.assets.push({
      id: spineAsset,
      name: "Hero",
      type: "spine",
      files: {
        skeleton: { name: "hero.json", uri: "assets/hero.json", mediaType: "application/json" },
        atlas: { name: "hero.atlas", uri: "assets/hero.atlas", mediaType: "text/plain" },
        textures: [{ name: "hero.png", uri: "assets/hero.png", mediaType: "image/png" }],
      },
    });
    button.states.pressedAssetId = spineAsset;

    const result = validateProjectDocument(document);
    expect(result.issues).toMatchObject([{ code: "INCOMPATIBLE_ASSET_REFERENCE", path: "/scenes/0/nodes/2/states/pressedAssetId" }]);
  });

  it("migrates a v2 document to v3 without changing its existing nodes", () => {
    const document = createProjectDocumentFixture();
    const v2Nodes = structuredClone(document.scenes[0]!.nodes);
    (document as { schemaVersion: number }).schemaVersion = 2;

    const migrated = migrateProjectDocument(document);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.scenes[0]!.nodes).toEqual(v2Nodes);
  });

  it.each(["desktop", "mobile"])("rejects missing %s viewport", (profile) => {
    const result = validateFixtureMutation((document) => {
      delete (document.scenes[0]!.layout.referenceViewports as Record<string, unknown>)[profile];
    });
    expect(result.issues[0]!.code).toBe("STRUCTURAL_SCHEMA");
  });

  it("reports duplicate IDs", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[1]!.id = document.scenes[0]!.nodes[0]!.id;
    });
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_ID")).toBe(true);
  });

  it("reports missing child and asset references", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[0]!.children = [stableId(99)];
      (document.scenes[0]!.nodes[1] as { assetId: string }).assetId = stableId(98);
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["MISSING_CHILD_REFERENCE", "MISSING_ASSET_REFERENCE"]),
    );
  });

  it("reports missing prefab references", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[1] = {
        ...document.scenes[0]!.nodes[1]!,
        type: "prefab-instance",
        prefabId: stableId(99),
      };
    });
    expect(result.issues.some((issue) => issue.code === "MISSING_PREFAB_REFERENCE")).toBe(true);
  });

  it("reports inconsistent parent and children", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[1]!.parentId = null;
    });
    expect(result.issues.some((issue) => issue.code === "HIERARCHY_PARENT_MISMATCH")).toBe(true);
  });

  it("reports cycles", () => {
    const result = validateFixtureMutation((document) => {
      const nodes = document.scenes[0]!.nodes;
      nodes[0]!.parentId = nodes[1]!.id;
      nodes[1]!.children = [nodes[0]!.id];
    });
    expect(result.issues.some((issue) => issue.code === "HIERARCHY_CYCLE")).toBe(true);
  });

  it("reports duplicate bindings", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[0]!.binding = "target";
      document.scenes[0]!.nodes[1]!.binding = "target";
    });
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_BINDING")).toBe(true);
  });

  it("rejects an incomplete spine asset", () => {
    const result = validateFixtureMutation((document) => {
      document.assets[0] = {
        id: stableId(5),
        name: "Hero",
        type: "spine",
        files: {
          skeleton: { name: "hero.json", uri: "hero.json", mediaType: "application/json" },
          textures: [{ name: "hero.png", uri: "hero.png", mediaType: "image/png" }],
        },
      } as never;
    });
    expect(result.issues.some((issue) => issue.code === "STRUCTURAL_SCHEMA")).toBe(true);
  });

  it("rejects unknown profile keys and schema versions", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[0]!.layoutOverrides = { tablet: {} } as never;
      (document as { schemaVersion: number }).schemaVersion = 0;
    });
    expect(result.issues.some((issue) => issue.code === "STRUCTURAL_SCHEMA")).toBe(true);
  });

  it("clones and validates the current version without mutating input", () => {
    const input = createProjectDocumentFixture();
    const output = migrateProjectDocument(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    output.project.name = "Changed";
    expect(input.project.name).toBe("Project");
  });

  it("rejects non-finite numbers", () => {
    const result = validateFixtureMutation((document) => {
      document.scenes[0]!.nodes[0]!.transform.x = Number.NaN;
    });
    expect(result.issues.some((issue) => issue.code === "NON_FINITE_NUMBER")).toBe(true);
  });

  it("serializes deterministically without mutating the document", () => {
    const input = createProjectDocumentFixture();
    const before = structuredClone(input);
    const reordered = Object.fromEntries(Object.entries(input).reverse()) as ProjectDocument;

    expect(serializeProjectDocument(input)).toBe(serializeProjectDocument(reordered));
    expect(serializeProjectDocument(input).endsWith("\n")).toBe(true);
    expect(input).toEqual(before);
  });
});
