import { describe, expect, it } from "vitest";
import { parseProjectManifest, ProjectManifestError, serializeProjectManifest, type ProjectManifest } from "./manifest.js";

const validManifest: ProjectManifest = {
  formatVersion: 1,
  projectId: "40000000-0000-4000-8000-000000000001",
  name: "Demo Project",
  createdAt: "2026-01-01T00:00:00.000Z",
  editorVersion: "0.0.0",
};

describe("project manifest", () => {
  it("round-trips a valid manifest deterministically regardless of key order", () => {
    const reordered = Object.fromEntries(Object.entries(validManifest).reverse()) as ProjectManifest;

    const serialized = serializeProjectManifest(validManifest);
    expect(serialized).toBe(serializeProjectManifest(reordered));
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized).toContain("\n  \"createdAt\"");

    expect(parseProjectManifest(JSON.parse(serialized))).toEqual(validManifest);
  });

  it.each([
    ["INVALID_MANIFEST_SHAPE", { ...validManifest, projectId: "not-a-uuid" }],
    ["INVALID_MANIFEST_SHAPE", { ...validManifest, name: "" }],
    ["UNSUPPORTED_MANIFEST_VERSION", { ...validManifest, formatVersion: 2 }],
  ] as const)("rejects an invalid manifest with code %s", (code, invalid) => {
    expect(() => parseProjectManifest(invalid)).toThrow(ProjectManifestError);
    try {
      parseProjectManifest(invalid);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectManifestError);
      expect((error as ProjectManifestError).code).toBe(code);
    }
  });
});
