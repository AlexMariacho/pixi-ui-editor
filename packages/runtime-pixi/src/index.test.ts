import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeProjectDocument } from "@pixi-ui-editor/schema";
import { parseProjectDocumentJson, ProjectDocumentJsonParseError } from "./index.js";

const sampleUrl = new URL("../../../examples/sample-project/project.json", import.meta.url);
const sampleJson = readFileSync(sampleUrl, "utf8");
const ids = {
  scene: "10000000-0000-4000-8000-000000000002",
  root: "10000000-0000-4000-8000-000000000003",
  image: "10000000-0000-4000-8000-000000000004",
  asset: "10000000-0000-4000-8000-000000000005",
  text: "10000000-0000-4000-8000-000000000006",
};
const clone = <T>(value: T): T => structuredClone(value);

describe("sample project loader smoke test", () => {
  it("loads the repository fixture through migration and validation", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const scene = document.scenes[0]!;
    expect(scene.id).toBe(ids.scene);
    expect(scene.rootNodeIds).toEqual([ids.root]);
    expect(scene.nodes.find((node) => node.id === ids.image && node.type === "image")).toMatchObject({ assetId: ids.asset });
    expect(scene.nodes.find((node) => node.id === ids.text)).toMatchObject({ binding: "welcomeLabel" });
    expect(scene.layout.referenceViewports).toHaveProperty("desktop");
    expect(scene.layout.referenceViewports).toHaveProperty("mobile");
  });

  it("round-trips deterministically while retaining semantic child order", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const serialized = serializeProjectDocument(document);
    const roundTripped = parseProjectDocumentJson(serialized);
    expect(roundTripped).toEqual(document);
    expect(serializeProjectDocument(roundTripped)).toBe(serialized);
    expect(roundTripped.scenes[0]!.nodes[0]!.children).toEqual([ids.image, ids.text]);
  });

  it("does not use display names as references", () => {
    const document = parseProjectDocumentJson(sampleJson);
    const renamed = clone(document);
    renamed.scenes[0]!.nodes[1]!.name = "Renamed Logo";
    expect(parseProjectDocumentJson(serializeProjectDocument(renamed)).scenes[0]!.nodes[1]).toMatchObject({ id: ids.image, assetId: ids.asset });
  });

  it.each([
    ["broken asset reference", (document: ReturnType<typeof parseProjectDocumentJson>) => { (document.scenes[0]!.nodes[1] as { assetId: string }).assetId = ids.text; }, "MISSING_ASSET_REFERENCE"],
    ["duplicate binding", (document: ReturnType<typeof parseProjectDocumentJson>) => { document.scenes[0]!.nodes[1]!.binding = "welcomeLabel"; }, "DUPLICATE_BINDING"],
    ["missing mobile profile", (document: ReturnType<typeof parseProjectDocumentJson>) => { delete (document.scenes[0]!.layout.referenceViewports as Record<string, unknown>).mobile; }, "STRUCTURAL_SCHEMA"],
    ["hierarchy cycle", (document: ReturnType<typeof parseProjectDocumentJson>) => { const nodes = document.scenes[0]!.nodes; nodes[0]!.parentId = ids.image; nodes[1]!.children = [ids.root]; }, "HIERARCHY_CYCLE"],
  ])("rejects %s", (_label, mutate, expectedCode) => {
    const invalid = clone(parseProjectDocumentJson(sampleJson));
    mutate(invalid);
    expect(() => parseProjectDocumentJson(JSON.stringify(invalid))).toThrow(expectedCode);
  });

  it("distinguishes malformed JSON from schema errors", () => {
    expect(() => parseProjectDocumentJson("{not json")).toThrow(ProjectDocumentJsonParseError);
    const invalid = clone(parseProjectDocumentJson(sampleJson));
    delete (invalid.scenes[0]!.layout.referenceViewports as Record<string, unknown>).mobile;
    expect(() => parseProjectDocumentJson(JSON.stringify(invalid))).toThrow(TypeError);
  });
});
