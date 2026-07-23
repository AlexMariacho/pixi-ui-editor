import { Type, type Static } from "@sinclair/typebox";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * `manifest.json`: the project folder's own identity, separate from `project.json`'s `ProjectDocument`.
 * No save timestamp is stored on purpose (git-diff-friendly: `manifest.json` only changes when the
 * project identity, name, or editor version actually changes, not on every save).
 */
export const PROJECT_MANIFEST_FORMAT_VERSION = 1 as const;

const ProjectManifestSchema = Type.Object({
  formatVersion: Type.Literal(PROJECT_MANIFEST_FORMAT_VERSION),
  projectId: Type.String({ format: "uuid" }),
  name: Type.String({ minLength: 1 }),
  createdAt: Type.String({ format: "date-time" }),
  editorVersion: Type.String({ minLength: 1 }),
});
export type ProjectManifest = Static<typeof ProjectManifestSchema>;

export type ProjectManifestErrorCode = "INVALID_MANIFEST_SHAPE" | "UNSUPPORTED_MANIFEST_VERSION";

export class ProjectManifestError extends Error {
  constructor(readonly code: ProjectManifestErrorCode, message: string) {
    super(message);
    this.name = "ProjectManifestError";
  }
}

const AjvConstructor = Ajv as unknown as typeof import("ajv").default;
const addAjvFormats = addFormats as unknown as typeof import("ajv-formats").default;
const manifestAjv = new AjvConstructor({ allErrors: true, strict: false });
addAjvFormats(manifestAjv);
const structuralManifest = manifestAjv.compile(ProjectManifestSchema);

/** Parses/validates an already-`JSON.parse`d manifest value (mirrors `assertProjectDocument`'s `unknown`-in contract). */
export function parseProjectManifest(input: unknown): ProjectManifest {
  if (typeof input !== "object" || input === null) throw new ProjectManifestError("INVALID_MANIFEST_SHAPE", "A project manifest must be an object.");
  const formatVersion = (input as { formatVersion?: unknown }).formatVersion;
  if (typeof formatVersion === "number" && formatVersion > PROJECT_MANIFEST_FORMAT_VERSION) {
    throw new ProjectManifestError("UNSUPPORTED_MANIFEST_VERSION", `Unsupported manifest formatVersion '${formatVersion}'. This editor supports up to ${PROJECT_MANIFEST_FORMAT_VERSION}.`);
  }
  if (!structuralManifest(input)) {
    const detail = (structuralManifest.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`).join(", ");
    throw new ProjectManifestError("INVALID_MANIFEST_SHAPE", `Invalid project manifest: ${detail || "does not match the expected shape."}`);
  }
  return input as ProjectManifest;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson((value as Record<string, unknown>)[key])]));
  return value;
}

/** Deterministic, human-diffable form for `manifest.json`: sorted keys, 2-space indent, trailing newline. */
export function serializeProjectManifest(manifest: ProjectManifest): string {
  const validated = parseProjectManifest(manifest);
  return `${JSON.stringify(canonicalizeJson(validated), null, 2)}\n`;
}
