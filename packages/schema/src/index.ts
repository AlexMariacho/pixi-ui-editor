import { Type, type Static } from "@sinclair/typebox";
import { createRequire } from "node:module";
import type { ErrorObject } from "ajv";

export const CURRENT_SCHEMA_VERSION = 0 as const;
const Id = Type.String({ format: "uuid" });
const Name = Type.String({ minLength: 1 });
export const LayoutProfileIdSchema = Type.Union([Type.Literal("desktop"), Type.Literal("mobile")]);
export type LayoutProfileId = Static<typeof LayoutProfileIdSchema>;
const Transform = Type.Object({ x: Type.Number(), y: Type.Number(), width: Type.Number({ exclusiveMinimum: 0 }), height: Type.Number({ exclusiveMinimum: 0 }), scaleX: Type.Number(), scaleY: Type.Number(), rotation: Type.Number() });
const Override = Type.Object({ visible: Type.Optional(Type.Boolean()), transform: Type.Optional(Type.Partial(Transform)) });
const NodeBase = Type.Object({ id: Id, name: Name, parentId: Type.Union([Id, Type.Null()]), children: Type.Array(Id), visible: Type.Boolean(), transform: Transform, layoutOverrides: Type.Optional(Type.Partial(Type.Object({ desktop: Override, mobile: Override }))), binding: Type.Optional(Type.String()) });
const Container = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("container") })]);
const Image = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("image"), assetId: Id })]);
const Text = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("text"), text: Type.String() })]);
const Spine = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("spine"), assetId: Id })]);
const PrefabInstance = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("prefab-instance"), prefabId: Id })]);
export const UINodeSchema = Type.Union([Container, Image, Text, Spine, PrefabInstance]);
export type UINode = Static<typeof UINodeSchema>;
const Viewport = Type.Object({ width: Type.Number({ exclusiveMinimum: 0 }), height: Type.Number({ exclusiveMinimum: 0 }) });
export const SceneSchema = Type.Object({ id: Id, name: Name, rootNodeIds: Type.Array(Id), nodes: Type.Array(UINodeSchema), layout: Type.Object({ referenceViewports: Type.Object({ desktop: Viewport, mobile: Viewport }) }) });
export type Scene = Static<typeof SceneSchema>;
export const AssetSchema = Type.Object({ id: Id, name: Name, type: Type.Union([Type.Literal("image"), Type.Literal("spine")]), source: Type.Object({ uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }), version: Type.Optional(Type.String({ minLength: 1 })) }) });
export type Asset = Static<typeof AssetSchema>;
export const PrefabDefinitionSchema = Type.Object({ id: Id, name: Name, rootNodeIds: Type.Array(Id), nodes: Type.Array(UINodeSchema), exposedProperties: Type.Array(Type.Object({ name: Name, type: Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("boolean"), Type.Literal("asset"), Type.Literal("visibility")]) })) });
export type PrefabDefinition = Static<typeof PrefabDefinitionSchema>;
export const ProjectDocumentSchema = Type.Object({ schemaVersion: Type.Literal(CURRENT_SCHEMA_VERSION), project: Type.Object({ id: Id, name: Name }), settings: Type.Object({ layoutProfileSelection: Type.Object({ mode: Type.Literal("aspect-ratio"), mobileMaxAspectRatio: Type.Number({ exclusiveMinimum: 0 }) }) }), assets: Type.Array(AssetSchema), prefabs: Type.Array(PrefabDefinitionSchema), scenes: Type.Array(SceneSchema) });
export type ProjectDocument = Static<typeof ProjectDocumentSchema>;

export type ValidationIssue = { code: string; path: string; message: string; severity: "error" | "warning" };
export type ValidationResult = { valid: boolean; issues: ValidationIssue[] };
export class ProjectDocumentMigrationError extends Error { readonly code = "UNSUPPORTED_SCHEMA_VERSION"; constructor(message: string) { super(message); this.name = "ProjectDocumentMigrationError"; } }
const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;
const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv); const structural = ajv.compile(ProjectDocumentSchema);
export function createStableId(): string { return crypto.randomUUID(); }
const add = (issues: ValidationIssue[], code: string, path: string, message: string) => issues.push({ code, path, message, severity: "error" });

type Owner = { rootNodeIds: string[]; nodes: UINode[] };
function hierarchy(owner: Owner, path: string, assets: Map<string, Asset>, prefabs: Set<string>, issues: ValidationIssue[]): void {
  const nodes = new Map<string, UINode>();
  owner.nodes.forEach((node, i) => { if (nodes.has(node.id)) add(issues, "DUPLICATE_ID", `${path}/nodes/${i}/id`, `Duplicate node ID '${node.id}'.`); nodes.set(node.id, node); });
  const childOwners = new Map<string, string>();
  owner.rootNodeIds.forEach((id, i) => { const node = nodes.get(id); if (!node) add(issues, "MISSING_NODE_REFERENCE", `${path}/rootNodeIds/${i}`, `Root node '${id}' does not exist.`); else if (node.parentId !== null) add(issues, "HIERARCHY_PARENT_MISMATCH", `${path}/rootNodeIds/${i}`, "A root node must have parentId null."); });
  owner.nodes.forEach((node, i) => {
    const nodePath = `${path}/nodes/${i}`;
    if (node.parentId !== null && !nodes.has(node.parentId)) add(issues, "MISSING_PARENT_REFERENCE", `${nodePath}/parentId`, `Parent '${node.parentId}' does not exist.`);
    node.children.forEach((childId, childIndex) => { const child = nodes.get(childId), childPath = `${nodePath}/children/${childIndex}`; if (!child) add(issues, "MISSING_CHILD_REFERENCE", childPath, `Child '${childId}' does not exist.`); else { const prior = childOwners.get(childId); if (prior && prior !== node.id) add(issues, "MULTIPLE_PARENTS", childPath, `Node '${childId}' belongs to more than one parent.`); childOwners.set(childId, node.id); if (child.parentId !== node.id) add(issues, "HIERARCHY_PARENT_MISMATCH", childPath, `Child '${childId}' does not point back to parent '${node.id}'.`); } });
    if (node.parentId !== null) { const parent = nodes.get(node.parentId); if (parent && !parent.children.includes(node.id)) add(issues, "HIERARCHY_CHILD_MISMATCH", `${nodePath}/parentId`, `Parent '${node.parentId}' does not list node '${node.id}'.`); }
    if (node.type === "image" || node.type === "spine") { const asset = assets.get(node.assetId); if (!asset) add(issues, "MISSING_ASSET_REFERENCE", `${nodePath}/assetId`, `Asset '${node.assetId}' does not exist.`); else if (asset.type !== node.type) add(issues, "INCOMPATIBLE_ASSET_REFERENCE", `${nodePath}/assetId`, `A ${node.type} node requires a ${node.type} asset.`); }
    if (node.type === "prefab-instance" && !prefabs.has(node.prefabId)) add(issues, "MISSING_PREFAB_REFERENCE", `${nodePath}/prefabId`, `Prefab '${node.prefabId}' does not exist.`);
  });
  const visiting = new Set<string>(), visited = new Set<string>(); const visit = (id: string): void => { if (visiting.has(id)) { add(issues, "HIERARCHY_CYCLE", path, `Hierarchy contains a cycle through '${id}'.`); return; } if (visited.has(id)) return; const node = nodes.get(id); if (!node) return; visiting.add(id); node.children.forEach(visit); visiting.delete(id); visited.add(id); }; nodes.forEach((_, id) => visit(id));
}
function semantic(document: ProjectDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [], ids = new Set<string>(), register = (id: string, path: string) => { if (ids.has(id)) add(issues, "DUPLICATE_ID", path, `Duplicate entity ID '${id}'.`); ids.add(id); };
  register(document.project.id, "/project/id"); const assets = new Map<string, Asset>(), prefabs = new Set<string>();
  document.assets.forEach((asset, i) => { register(asset.id, `/assets/${i}/id`); assets.set(asset.id, asset); }); document.prefabs.forEach((prefab, i) => { register(prefab.id, `/prefabs/${i}/id`); prefabs.add(prefab.id); }); document.scenes.forEach((scene, i) => register(scene.id, `/scenes/${i}/id`));
  document.prefabs.forEach((prefab, i) => { prefab.nodes.forEach((node, j) => register(node.id, `/prefabs/${i}/nodes/${j}/id`)); hierarchy(prefab, `/prefabs/${i}`, assets, prefabs, issues); });
  document.scenes.forEach((scene, i) => { scene.nodes.forEach((node, j) => register(node.id, `/scenes/${i}/nodes/${j}/id`)); hierarchy(scene, `/scenes/${i}`, assets, prefabs, issues); const bindings = new Set<string>(); scene.nodes.forEach((node, j) => { if (node.binding !== undefined) { const binding = node.binding.trim(); if (!binding) add(issues, "EMPTY_BINDING", `/scenes/${i}/nodes/${j}/binding`, "Binding must not be empty after trimming."); else if (bindings.has(binding)) add(issues, "DUPLICATE_BINDING", `/scenes/${i}/nodes/${j}/binding`, `Binding '${binding}' is duplicated in this scene.`); else bindings.add(binding); } }); });
  return issues;
}
function collectNonFiniteNumbers(input: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) add(issues, "NON_FINITE_NUMBER", path, "Numbers must be finite.");
    return;
  }
  if (Array.isArray(input)) input.forEach((value, index) => collectNonFiniteNumbers(value, `${path}/${index}`, issues));
  else if (typeof input === "object" && input !== null) Object.entries(input).forEach(([key, value]) => collectNonFiniteNumbers(value, `${path}/${key}`, issues));
}
export function validateProjectDocument(input: unknown): ValidationResult { if (!structural(input)) return { valid: false, issues: (structural.errors ?? []).map((error: ErrorObject) => ({ code: "STRUCTURAL_SCHEMA", path: error.instancePath || "/", message: error.message ?? "Invalid document structure.", severity: "error" })) }; const issues: ValidationIssue[] = []; collectNonFiniteNumbers(input, "", issues); issues.push(...semantic(input as ProjectDocument)); return { valid: issues.length === 0, issues }; }
export function assertProjectDocument(input: unknown): asserts input is ProjectDocument { const result = validateProjectDocument(input); if (!result.valid) throw new TypeError(`Invalid ProjectDocument: ${result.issues.map((x) => `${x.code} at ${x.path}`).join(", ")}`); }
export function migrateProjectDocument(input: unknown): ProjectDocument { if (typeof input !== "object" || input === null || !Object.hasOwn(input, "schemaVersion")) throw new ProjectDocumentMigrationError("A schemaVersion is required for migration."); const version = (input as { schemaVersion?: unknown }).schemaVersion; if (typeof version !== "number" || !Number.isInteger(version) || version < 0 || version !== CURRENT_SCHEMA_VERSION) throw new ProjectDocumentMigrationError(`Unsupported schemaVersion '${String(version)}'.`); const migrated = structuredClone(input); assertProjectDocument(migrated); return migrated; }
function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson((value as Record<string, unknown>)[key])]));
  return value;
}
export function serializeProjectDocument(document: ProjectDocument): string { assertProjectDocument(document); return `${JSON.stringify(canonicalizeJson(document))}\n`; }
