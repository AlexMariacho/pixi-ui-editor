import { Type, type Static, type TSchema } from "@sinclair/typebox";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";

export const CURRENT_SCHEMA_VERSION = 3 as const;
const Id = Type.String({ format: "uuid" });
const Name = Type.String({ minLength: 1 });
export const LayoutProfileIdSchema = Type.Union([Type.Literal("desktop"), Type.Literal("mobile")]);
export type LayoutProfileId = Static<typeof LayoutProfileIdSchema>;
// width/height допускают любые значения: на растянутой оси (anchorMin < anchorMax) они хранят
// дельту к якорному прямоугольнику родителя и могут быть нулевыми или отрицательными.
// Для нерастянутой оси положительность размера проверяет semantic-валидация (NON_POSITIVE_SIZE).
const Transform = Type.Object({ x: Type.Number(), y: Type.Number(), width: Type.Number(), height: Type.Number(), scaleX: Type.Number(), scaleY: Type.Number(), rotation: Type.Number(), pivotX: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), pivotY: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), anchorMinX: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), anchorMinY: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), anchorMaxX: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), anchorMaxY: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })) });
const Alignment = Type.Union([Type.Literal("upper-left"), Type.Literal("upper-center"), Type.Literal("upper-right"), Type.Literal("middle-left"), Type.Literal("middle-center"), Type.Literal("middle-right"), Type.Literal("lower-left"), Type.Literal("lower-center"), Type.Literal("lower-right")]);
export type LayoutAlignment = Static<typeof Alignment>;
const Padding = Type.Object({ left: Type.Number({ minimum: 0 }), right: Type.Number({ minimum: 0 }), top: Type.Number({ minimum: 0 }), bottom: Type.Number({ minimum: 0 }) });
export type LayoutPadding = Static<typeof Padding>;
const LayoutItem = Type.Object({ flexGrow: Type.Number({ minimum: 0 }), flexShrink: Type.Number({ minimum: 0 }), flexBasis: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), alignSelf: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("flex-start"), Type.Literal("center"), Type.Literal("flex-end"), Type.Literal("stretch")])) });
export type LayoutItemDefinition = Static<typeof LayoutItem>;
const LinearLayoutSettings = Type.Object({ padding: Padding, spacing: Type.Number({ minimum: 0 }), childAlignment: Alignment, reverseOrder: Type.Boolean(), controlChildWidth: Type.Boolean(), controlChildHeight: Type.Boolean(), forceExpandWidth: Type.Boolean(), forceExpandHeight: Type.Boolean() });
export type LinearLayoutSettings = Static<typeof LinearLayoutSettings>;
const GridLayoutSettings = Type.Object({ padding: Padding, spacingX: Type.Number({ minimum: 0 }), spacingY: Type.Number({ minimum: 0 }), cellWidth: Type.Number({ exclusiveMinimum: 0 }), cellHeight: Type.Number({ exclusiveMinimum: 0 }), startCorner: Type.Union([Type.Literal("upper-left"), Type.Literal("upper-right"), Type.Literal("lower-left"), Type.Literal("lower-right")]), startAxis: Type.Union([Type.Literal("horizontal"), Type.Literal("vertical")]), childAlignment: Alignment, constraint: Type.Union([Type.Literal("flexible"), Type.Literal("fixed-column-count"), Type.Literal("fixed-row-count")]), constraintCount: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) });
export type GridLayoutSettings = Static<typeof GridLayoutSettings>;
const ProfiledLayout = <T extends TSchema>(settings: T) => Type.Object({ base: settings, overrides: Type.Optional(Type.Partial(Type.Object({ desktop: Type.Partial(settings), mobile: Type.Partial(settings) }))) });
const Override = Type.Object({ visible: Type.Optional(Type.Boolean()), transform: Type.Optional(Type.Partial(Transform)) });
const NodeBase = Type.Object({ id: Id, name: Name, parentId: Type.Union([Id, Type.Null()]), children: Type.Array(Id), visible: Type.Boolean(), transform: Transform, layoutOverrides: Type.Optional(Type.Partial(Type.Object({ desktop: Override, mobile: Override }))), layoutItem: Type.Optional(LayoutItem), binding: Type.Optional(Type.String()) });
const Container = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("container") })]);
const HorizontalLayout = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("horizontal-layout"), backgroundAssetId: Type.Optional(Id), layoutGroup: ProfiledLayout(LinearLayoutSettings) })]);
const VerticalLayout = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("vertical-layout"), backgroundAssetId: Type.Optional(Id), layoutGroup: ProfiledLayout(LinearLayoutSettings) })]);
const GridLayout = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("grid-layout"), backgroundAssetId: Type.Optional(Id), layoutGroup: ProfiledLayout(GridLayoutSettings) })]);
const Image = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("image"), assetId: Id })]);
const TextStroke = Type.Object({ color: Type.String({ pattern: "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$" }), width: Type.Number({ minimum: 0 }) });
export const TextStyleDefinitionSchema = Type.Object({ fontAssetId: Type.Optional(Id), fontFamily: Type.String({ minLength: 1 }), fontSize: Type.Number({ exclusiveMinimum: 0 }), fontWeight: Type.Union([Type.Literal("normal"), Type.Literal("bold")]), fontStyle: Type.Union([Type.Literal("normal"), Type.Literal("italic")]), fill: Type.String({ pattern: "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$" }), align: Type.Union([Type.Literal("left"), Type.Literal("center"), Type.Literal("right"), Type.Literal("justify")]), verticalAlign: Type.Union([Type.Literal("top"), Type.Literal("middle"), Type.Literal("bottom")]), wordWrap: Type.Boolean(), breakWords: Type.Boolean(), lineHeight: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), letterSpacing: Type.Number(), stroke: Type.Optional(TextStroke) });
export type TextStyleDefinition = Static<typeof TextStyleDefinitionSchema>;
const Text = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("text"), text: Type.String(), style: Type.Optional(TextStyleDefinitionSchema) })]);
const Spine = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("spine"), assetId: Id, animation: Type.Optional(Type.String({ minLength: 1 })), loop: Type.Optional(Type.Boolean()) })]);
const PrefabInstance = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("prefab-instance"), prefabId: Id })]);
/** Состояния кнопки. `normal` обязателен; остальные при отсутствии используют его изображение. */
export const BUTTON_STATE_KEYS = ["normal", "hover", "pressed", "disabled"] as const;
export type ButtonStateKey = (typeof BUTTON_STATE_KEYS)[number];
/** Discriminated transition: в v0 поддержан только `instant`, чтобы позже добавить bump/slide/fade без неявных полей. */
const ButtonTransition = Type.Object({ kind: Type.Literal("instant") });
const ButtonStates = Type.Object({ normalAssetId: Id, hoverAssetId: Type.Optional(Id), pressedAssetId: Type.Optional(Id), disabledAssetId: Type.Optional(Id) });
const ButtonTransitions = Type.Partial(Type.Object({ normal: ButtonTransition, hover: ButtonTransition, pressed: ButtonTransition, disabled: ButtonTransition }));
// `enabled` — сериализованное начальное presentation-состояние; runtime setter документ не меняет.
const Button = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("button"), states: ButtonStates, enabled: Type.Boolean(), transitions: Type.Optional(ButtonTransitions) })]);
// Прямые children — scroll items; их позицию владеет `@pixi/ui` List, поэтому per-profile overrides
// настроек не нужны (как у text style) — только собственные transform/visibility остаются profile-aware.
const ScrollViewDirection = Type.Union([Type.Literal("vertical"), Type.Literal("horizontal"), Type.Literal("both")]);
export type ScrollViewDirection = Static<typeof ScrollViewDirection>;
const ScrollViewSettings = Type.Object({
  direction: ScrollViewDirection,
  padding: Padding,
  itemSpacing: Type.Number({ minimum: 0 }),
  backgroundColor: Type.Optional(Type.String({ pattern: "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$" })),
  cornerRadius: Type.Number({ minimum: 0 }),
  easingEnabled: Type.Boolean(),
  // Значим только при direction "horizontal"; для остальных направлений безопасно игнорируется.
  shiftWheelHorizontal: Type.Optional(Type.Boolean()),
});
export type ScrollViewSettings = Static<typeof ScrollViewSettings>;
const ScrollView = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("scroll-view"), scrollView: ScrollViewSettings })]);
export const UINodeSchema = Type.Union([Container, HorizontalLayout, VerticalLayout, GridLayout, Image, Text, Spine, Button, PrefabInstance, ScrollView]);
export type UINode = Static<typeof UINodeSchema>;
export type LayoutGroupNode = Extract<UINode, { type: "horizontal-layout" | "vertical-layout" | "grid-layout" }>;
export function isLayoutGroup(node: UINode): node is LayoutGroupNode { return node.type === "horizontal-layout" || node.type === "vertical-layout" || node.type === "grid-layout"; }
export function resolveLayoutGroupSettings<T extends LayoutGroupNode["layoutGroup"]["base"]>(node: LayoutGroupNode, profile: LayoutProfileId): T {
  return { ...node.layoutGroup.base, ...node.layoutGroup.overrides?.[profile] } as T;
}
export type ScrollViewNode = Extract<UINode, { type: "scroll-view" }>;
export function isScrollView(node: UINode): node is ScrollViewNode { return node.type === "scroll-view"; }
/** A direct child of this node does not own its own position: a layout group's Yoga solver or a scroll-view's `@pixi/ui` List does. */
export function isPositionManagingContainer(node: UINode): boolean { return isLayoutGroup(node) || isScrollView(node); }
const Viewport = Type.Object({ width: Type.Number({ exclusiveMinimum: 0 }), height: Type.Number({ exclusiveMinimum: 0 }) });
export const SceneSchema = Type.Object({ id: Id, name: Name, rootNodeIds: Type.Array(Id), nodes: Type.Array(UINodeSchema), layout: Type.Object({ referenceViewports: Type.Object({ desktop: Viewport, mobile: Viewport }) }) });
export type Scene = Static<typeof SceneSchema>;
export const AssetFileSchema = Type.Object({ name: Name, uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }) });
export type AssetFile = Static<typeof AssetFileSchema>;
const ImageAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("image"), source: Type.Object({ uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }), version: Type.Optional(Type.String({ minLength: 1 })) }) });
const SpineAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("spine"), files: Type.Object({ skeleton: AssetFileSchema, atlas: AssetFileSchema, textures: Type.Array(AssetFileSchema, { minItems: 1 }) }) });
const FontAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("font"), family: Name, weight: Type.Union([Type.Literal("normal"), Type.Literal("bold")]), style: Type.Union([Type.Literal("normal"), Type.Literal("italic")]), source: Type.Object({ uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }), version: Type.Optional(Type.String({ minLength: 1 })) }) });
export const AssetSchema = Type.Union([ImageAsset, SpineAsset, FontAsset]);
export type Asset = Static<typeof AssetSchema>;
export const PrefabDefinitionSchema = Type.Object({ id: Id, name: Name, rootNodeIds: Type.Array(Id), nodes: Type.Array(UINodeSchema), exposedProperties: Type.Array(Type.Object({ name: Name, type: Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("boolean"), Type.Literal("asset"), Type.Literal("visibility")]) })) });
export type PrefabDefinition = Static<typeof PrefabDefinitionSchema>;
export const ProjectDocumentSchema = Type.Object({ schemaVersion: Type.Literal(CURRENT_SCHEMA_VERSION), project: Type.Object({ id: Id, name: Name }), settings: Type.Object({ layoutProfileSelection: Type.Object({ mode: Type.Literal("aspect-ratio"), mobileMaxAspectRatio: Type.Number({ exclusiveMinimum: 0 }) }) }), assets: Type.Array(AssetSchema), prefabs: Type.Array(PrefabDefinitionSchema), scenes: Type.Array(SceneSchema) });
export type ProjectDocument = Static<typeof ProjectDocumentSchema>;

export type ValidationIssue = { code: string; path: string; message: string; severity: "error" | "warning" };
export type ValidationResult = { valid: boolean; issues: ValidationIssue[] };
export class ProjectDocumentMigrationError extends Error { readonly code = "UNSUPPORTED_SCHEMA_VERSION"; constructor(message: string) { super(message); this.name = "ProjectDocumentMigrationError"; } }
const AjvConstructor = Ajv as unknown as typeof import("ajv").default;
const addAjvFormats = addFormats as unknown as typeof import("ajv-formats").default;
const ajv = new AjvConstructor({ allErrors: true, strict: false }); addAjvFormats(ajv); const structural = ajv.compile(ProjectDocumentSchema);
export function createStableId(): string { return crypto.randomUUID(); }
const add = (issues: ValidationIssue[], code: string, path: string, message: string) => issues.push({ code, path, message, severity: "error" });

type Owner = { rootNodeIds: string[]; nodes: UINode[] };
type TransformData = Static<typeof Transform>;
/** На нерастянутой оси width/height — абсолютный размер и обязан быть положительным; на растянутой это дельта к якорному прямоугольнику. */
function checkResolvedSizes(node: UINode, nodePath: string, issues: ValidationIssue[]): void {
  for (const profile of ["desktop", "mobile"] as const) {
    const merged: TransformData = { ...node.transform, ...node.layoutOverrides?.[profile]?.transform };
    const minX = merged.anchorMinX ?? 0, maxX = merged.anchorMaxX ?? minX;
    const minY = merged.anchorMinY ?? 0, maxY = merged.anchorMaxY ?? minY;
    if (maxX <= minX && merged.width <= 0) add(issues, "NON_POSITIVE_SIZE", `${nodePath}/transform/width`, `Width must be positive when the '${profile}' X axis is not stretched.`);
    if (maxY <= minY && merged.height <= 0) add(issues, "NON_POSITIVE_SIZE", `${nodePath}/transform/height`, `Height must be positive when the '${profile}' Y axis is not stretched.`);
  }
}
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
    if (isLayoutGroup(node) && node.backgroundAssetId !== undefined) { const asset = assets.get(node.backgroundAssetId); if (!asset) add(issues, "MISSING_ASSET_REFERENCE", `${nodePath}/backgroundAssetId`, `Background asset '${node.backgroundAssetId}' does not exist.`); else if (asset.type !== "image") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", `${nodePath}/backgroundAssetId`, "A layout group background requires an image asset."); }
    // Путь ошибки сохраняется до конкретного state field, чтобы Inspector мог подсветить нужный picker.
    if (node.type === "button") BUTTON_STATE_KEYS.forEach((state) => { const field = `${state}AssetId` as const; const assetId = node.states[field]; if (assetId === undefined) return; const asset = assets.get(assetId), path = `${nodePath}/states/${field}`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", path, `Asset '${assetId}' does not exist.`); else if (asset.type !== "image") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", path, `A button '${state}' state requires an image asset.`); });
    if (node.type === "text" && node.style?.fontAssetId !== undefined) { const asset = assets.get(node.style.fontAssetId), path = `${nodePath}/style/fontAssetId`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", path, `Asset '${node.style.fontAssetId}' does not exist.`); else if (asset.type !== "font") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", path, "A text node fontAssetId requires a font asset."); }
    if (node.type === "prefab-instance" && !prefabs.has(node.prefabId)) add(issues, "MISSING_PREFAB_REFERENCE", `${nodePath}/prefabId`, `Prefab '${node.prefabId}' does not exist.`);
    if (node.type === "grid-layout" && node.layoutGroup.base.constraint !== "flexible" && node.layoutGroup.base.constraintCount === undefined) add(issues, "MISSING_GRID_CONSTRAINT_COUNT", `${nodePath}/layoutGroup/base/constraintCount`, "A fixed grid constraint requires constraintCount.");
    for (const profile of ["desktop", "mobile"] as const) {
      const grid = node.type === "grid-layout" ? { ...node.layoutGroup.base, ...node.layoutGroup.overrides?.[profile] } : undefined;
      if (grid !== undefined && grid.constraint !== "flexible" && grid.constraintCount === undefined) add(issues, "MISSING_GRID_CONSTRAINT_COUNT", `${nodePath}/layoutGroup/overrides/${profile}/constraintCount`, "A fixed grid constraint requires constraintCount.");
    }
    checkResolvedSizes(node, nodePath, issues);
  });
  const visiting = new Set<string>(), visited = new Set<string>(); const visit = (id: string): void => { if (visiting.has(id)) { add(issues, "HIERARCHY_CYCLE", path, `Hierarchy contains a cycle through '${id}'.`); return; } if (visited.has(id)) return; const node = nodes.get(id); if (!node) return; visiting.add(id); node.children.forEach(visit); visiting.delete(id); visited.add(id); }; nodes.forEach((_, id) => visit(id));
}
function semantic(document: ProjectDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [], ids = new Set<string>(), register = (id: string, path: string) => { if (ids.has(id)) add(issues, "DUPLICATE_ID", path, `Duplicate entity ID '${id}'.`); ids.add(id); };
  register(document.project.id, "/project/id"); const assets = new Map<string, Asset>(), prefabs = new Set<string>();
  const fontMediaTypes = new Set(["font/woff2", "font/woff", "font/ttf", "font/otf", "application/font-woff", "application/x-font-ttf", "application/x-font-opentype"]);
  document.assets.forEach((asset, i) => { register(asset.id, `/assets/${i}/id`); assets.set(asset.id, asset); if (asset.type === "font" && !fontMediaTypes.has(asset.source.mediaType)) add(issues, "INVALID_FONT_MEDIA_TYPE", `/assets/${i}/source/mediaType`, `Unsupported font media type '${asset.source.mediaType}'.`); }); document.prefabs.forEach((prefab, i) => { register(prefab.id, `/prefabs/${i}/id`); prefabs.add(prefab.id); }); document.scenes.forEach((scene, i) => register(scene.id, `/scenes/${i}/id`));
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
/** v1 хранил точечный якорь anchorX/anchorY; v2 заменяет его парой anchorMin/anchorMax с тем же значением. */
function migrateTransformV1(transform: Record<string, unknown>): void {
  for (const axis of ["X", "Y"] as const) {
    const value = transform[`anchor${axis}`];
    delete transform[`anchor${axis}`];
    if (typeof value !== "number") continue;
    transform[`anchorMin${axis}`] = value;
    transform[`anchorMax${axis}`] = value;
  }
}
function migrateV1ToV2(document: Record<string, unknown>): void {
  const owners = [...(document.scenes as { nodes: unknown[] }[] ?? []), ...(document.prefabs as { nodes: unknown[] }[] ?? [])];
  for (const owner of owners) {
    for (const node of owner.nodes as Record<string, unknown>[]) {
      if (typeof node.transform === "object" && node.transform !== null) migrateTransformV1(node.transform as Record<string, unknown>);
      const overrides = node.layoutOverrides as Record<string, { transform?: Record<string, unknown> }> | undefined;
      for (const profile of ["desktop", "mobile"]) {
        const transform = overrides?.[profile]?.transform;
        if (typeof transform === "object" && transform !== null) migrateTransformV1(transform);
      }
    }
  }
}
export function migrateProjectDocument(input: unknown): ProjectDocument { if (typeof input !== "object" || input === null || !Object.hasOwn(input, "schemaVersion")) throw new ProjectDocumentMigrationError("A schemaVersion is required for migration."); const version = (input as { schemaVersion?: unknown }).schemaVersion; if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > CURRENT_SCHEMA_VERSION) throw new ProjectDocumentMigrationError(`Unsupported schemaVersion '${String(version)}'.`); const migrated = structuredClone(input) as Record<string, unknown>; if (version <= 1) migrateV1ToV2(migrated); /* v2→v3 добавляет button как новую ветку union и не меняет существующие nodes. */ migrated.schemaVersion = CURRENT_SCHEMA_VERSION; assertProjectDocument(migrated); return migrated; }
function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson((value as Record<string, unknown>)[key])]));
  return value;
}
export function serializeProjectDocument(document: ProjectDocument): string { assertProjectDocument(document); return `${JSON.stringify(canonicalizeJson(document))}\n`; }
