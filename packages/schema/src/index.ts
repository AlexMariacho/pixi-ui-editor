import { Type, type Static, type TSchema } from "@sinclair/typebox";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";

export const CURRENT_SCHEMA_VERSION = 7 as const;
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
const Image = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("image"), assetId: Id, opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })) })]);
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
const ButtonSounds = Type.Object({ pressAssetId: Type.Optional(Id), hoverAssetId: Type.Optional(Id) });
const ButtonTransitions = Type.Partial(Type.Object({ normal: ButtonTransition, hover: ButtonTransition, pressed: ButtonTransition, disabled: ButtonTransition }));
// `enabled` — сериализованное начальное presentation-состояние; runtime setter документ не меняет.
const Button = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("button"), states: ButtonStates, sounds: Type.Optional(ButtonSounds), enabled: Type.Boolean(), transitions: Type.Optional(ButtonTransitions) })]);
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
const InputAlign = Type.Union([Type.Literal("left"), Type.Literal("center"), Type.Literal("right")]);
export type InputAlign = Static<typeof InputAlign>;
// Reuses the shared `TextStyleDefinition` (TASK-029) so an input never grows an incompatible parallel
// font/style field set; fields that don't apply to a single line (wordWrap, verticalAlign, ...) are
// simply ignored by the runtime view, the same way a button ignores unused optional state assets.
const Input = Type.Composite([NodeBase, Type.Object({
  type: Type.Literal("input"),
  backgroundAssetId: Type.Optional(Id),
  placeholder: Type.String(),
  defaultValue: Type.String(),
  // Positive integer: a character-count limit can't be fractional or non-positive.
  maxLength: Type.Optional(Type.Integer({ exclusiveMinimum: 0 })),
  secure: Type.Boolean(),
  align: InputAlign,
  padding: Padding,
  cleanOnFocus: Type.Boolean(),
  clipText: Type.Boolean(),
  textStyle: TextStyleDefinitionSchema,
})]);
const Slider = Type.Composite([NodeBase, Type.Object({
  type: Type.Literal("slider"),
  backgroundAssetId: Id,
  fillAssetId: Id,
  handleAssetId: Id,
  min: Type.Number(),
  max: Type.Number(),
  step: Type.Number(),
  defaultValue: Type.Number(),
  fillPadding: Padding,
  showValue: Type.Optional(Type.Boolean()),
  valueTextStyle: Type.Optional(TextStyleDefinitionSchema),
})]);
const ProgressBar = Type.Composite([NodeBase, Type.Object({
  type: Type.Literal("progress-bar"),
  backgroundAssetId: Id,
  fillAssetId: Id,
  defaultProgress: Type.Number(),
  fillPadding: Padding,
})]);
const Range = Type.Object({ min: Type.Number(), max: Type.Number() });
const PositiveRange = Type.Object({ min: Type.Number({ exclusiveMinimum: 0 }), max: Type.Number({ exclusiveMinimum: 0 }) });
const Color = Type.String({ pattern: "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$" });
const ParticleSource = Type.Union([
  Type.Object({ type: Type.Literal("single"), assetId: Id }),
  Type.Object({ type: Type.Literal("random"), assetIds: Type.Array(Id, { minItems: 1 }) }),
  Type.Object({ type: Type.Literal("sequence"), assetIds: Type.Array(Id, { minItems: 1 }), fps: Type.Number({ exclusiveMinimum: 0 }), loop: Type.Boolean(), randomStartFrame: Type.Boolean() }),
]);
export const EffectDefinitionSchema = Type.Union([Type.Object({
  id: Id, name: Name, type: Type.Literal("particles"), maxParticles: Type.Integer({ minimum: 1, maximum: 10000 }), seed: Type.Integer({ minimum: 0, maximum: 4294967295 }),
  emission: Type.Object({ delay: Type.Number({ minimum: 0 }), duration: Type.Number({ exclusiveMinimum: 0 }), loop: Type.Boolean(), rate: Type.Number({ minimum: 0 }), bursts: Type.Array(Type.Object({ time: Type.Number({ minimum: 0 }), count: Type.Integer({ minimum: 1 }) })) }),
  particle: Type.Object({
    lifetime: PositiveRange,
    spawnShape: Type.Object({ type: Type.Union([Type.Literal("point"), Type.Literal("rectangle"), Type.Literal("circle")]) }),
    movement: Type.Object({ speed: Range, directionDegrees: Type.Number({ minimum: 0, maximum: 360 }), spreadDegrees: Type.Number({ minimum: 0, maximum: 360 }), accelerationX: Type.Number(), accelerationY: Type.Number(), drag: Type.Number({ minimum: 0 }) }),
    visual: Type.Object({ source: ParticleSource, alpha: Type.Object({ start: Type.Number({ minimum: 0, maximum: 1 }), end: Type.Number({ minimum: 0, maximum: 1 }) }), scale: Type.Object({ start: PositiveRange, end: PositiveRange }), tint: Type.Object({ start: Color, end: Color }), rotation: Type.Object({ initialDegrees: Range, angularVelocityDegrees: Range }), blendMode: Type.Union([Type.Literal("normal"), Type.Literal("add"), Type.Literal("multiply"), Type.Literal("screen")]) }),
  }),
})]);
export type EffectDefinition = Static<typeof EffectDefinitionSchema>;
export type ParticleEffectDefinition = Extract<EffectDefinition, { type: "particles" }>;
export function isParticleEffect(effect: EffectDefinition): effect is ParticleEffectDefinition { return effect.type === "particles"; }
const ParticleEmitter = Type.Composite([NodeBase, Type.Object({ type: Type.Literal("particle-emitter"), effectId: Id, autoplay: Type.Boolean(), simulationSpace: Type.Union([Type.Literal("local"), Type.Literal("world")]) })]);
export const UINodeSchema = Type.Union([Container, HorizontalLayout, VerticalLayout, GridLayout, Image, Text, Spine, Button, PrefabInstance, ScrollView, Input, Slider, ProgressBar, ParticleEmitter]);
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
export type InputNode = Extract<UINode, { type: "input" }>;
export type SliderNode = Extract<UINode, { type: "slider" }>;
export type ProgressBarNode = Extract<UINode, { type: "progress-bar" }>;
export type ParticleEmitterNode = Extract<UINode, { type: "particle-emitter" }>;
export function isParticleEmitterNode(node: UINode): node is ParticleEmitterNode { return node.type === "particle-emitter"; }
const Viewport = Type.Object({ width: Type.Number({ exclusiveMinimum: 0 }), height: Type.Number({ exclusiveMinimum: 0 }) });
const SceneAudio = Type.Object({ backgroundMusicAssetId: Type.Optional(Id), volume: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })) });
export const SceneSchema = Type.Object({ id: Id, name: Name, rootNodeIds: Type.Array(Id), nodes: Type.Array(UINodeSchema), layout: Type.Object({ referenceViewports: Type.Object({ desktop: Viewport, mobile: Viewport }) }), audio: Type.Optional(SceneAudio) });
export type Scene = Static<typeof SceneSchema>;
export const AssetFileSchema = Type.Object({ name: Name, uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }) });
export type AssetFile = Static<typeof AssetFileSchema>;
const ImageAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("image"), source: Type.Object({ uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }), version: Type.Optional(Type.String({ minLength: 1 })) }) });
const SpineAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("spine"), files: Type.Object({ skeleton: AssetFileSchema, atlas: AssetFileSchema, textures: Type.Array(AssetFileSchema, { minItems: 1 }) }) });
const FontAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("font"), family: Name, weight: Type.Union([Type.Literal("normal"), Type.Literal("bold")]), style: Type.Union([Type.Literal("normal"), Type.Literal("italic")]), source: Type.Object({ uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }), version: Type.Optional(Type.String({ minLength: 1 })) }) });
// Имя фрейма из spritesheet JSON → стабильный id фрейма; nodes ссылаются на этот id как на обычный image assetId.
const AtlasAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("atlas"), files: Type.Object({ json: AssetFileSchema, texture: AssetFileSchema }), frames: Type.Record(Type.String({ minLength: 1 }), Id) });
const SoundAsset = Type.Object({ id: Id, name: Name, type: Type.Literal("sound"), source: Type.Object({ uri: Type.String({ minLength: 1 }), mediaType: Type.String({ minLength: 1 }), version: Type.Optional(Type.String({ minLength: 1 })) }) });
export const AssetSchema = Type.Union([ImageAsset, SpineAsset, FontAsset, AtlasAsset, SoundAsset]);
export type Asset = Static<typeof AssetSchema>;
export const PrefabDefinitionSchema = Type.Object({ id: Id, name: Name, rootNodeIds: Type.Array(Id), nodes: Type.Array(UINodeSchema), exposedProperties: Type.Array(Type.Object({ name: Name, type: Type.Union([Type.Literal("string"), Type.Literal("number"), Type.Literal("boolean"), Type.Literal("asset"), Type.Literal("visibility")]) })) });
export type PrefabDefinition = Static<typeof PrefabDefinitionSchema>;
export const ProjectDocumentSchema = Type.Object({ schemaVersion: Type.Literal(CURRENT_SCHEMA_VERSION), project: Type.Object({ id: Id, name: Name }), settings: Type.Object({ layoutProfileSelection: Type.Object({ mode: Type.Literal("aspect-ratio"), mobileMaxAspectRatio: Type.Number({ exclusiveMinimum: 0 }) }) }), assets: Type.Array(AssetSchema), effects: Type.Array(EffectDefinitionSchema), prefabs: Type.Array(PrefabDefinitionSchema), scenes: Type.Array(SceneSchema) });
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
function particleAssetIds(effect: ParticleEffectDefinition): string[] { const source = effect.particle.visual.source; return source.type === "single" ? [source.assetId] : source.assetIds; }
export function collectEffectAssetIds(effect: EffectDefinition): string[] { return isParticleEffect(effect) ? particleAssetIds(effect) : []; }
function hierarchy(owner: Owner, path: string, assets: Map<string, Asset>, prefabs: Set<string>, effects: Map<string, EffectDefinition>, issues: ValidationIssue[]): void {
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
    if (node.type === "button") for (const field of ["pressAssetId", "hoverAssetId"] as const) { const assetId = node.sounds?.[field]; if (assetId === undefined) continue; const asset = assets.get(assetId), soundPath = `${nodePath}/sounds/${field}`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", soundPath, `Asset '${assetId}' does not exist.`); else if (asset.type !== "sound") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", soundPath, `A button ${field} requires a sound asset.`); }
    if (node.type === "text" && node.style?.fontAssetId !== undefined) { const asset = assets.get(node.style.fontAssetId), path = `${nodePath}/style/fontAssetId`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", path, `Asset '${node.style.fontAssetId}' does not exist.`); else if (asset.type !== "font") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", path, "A text node fontAssetId requires a font asset."); }
    if (node.type === "input" && node.backgroundAssetId !== undefined) { const asset = assets.get(node.backgroundAssetId); if (!asset) add(issues, "MISSING_ASSET_REFERENCE", `${nodePath}/backgroundAssetId`, `Background asset '${node.backgroundAssetId}' does not exist.`); else if (asset.type !== "image") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", `${nodePath}/backgroundAssetId`, "An input background requires an image asset."); }
    if (node.type === "input" && node.textStyle.fontAssetId !== undefined) { const asset = assets.get(node.textStyle.fontAssetId), path = `${nodePath}/textStyle/fontAssetId`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", path, `Asset '${node.textStyle.fontAssetId}' does not exist.`); else if (asset.type !== "font") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", path, "An input node textStyle fontAssetId requires a font asset."); }
    if (node.type === "slider" || node.type === "progress-bar") {
      const imageReferences: [string, string][] = [["backgroundAssetId", node.backgroundAssetId], ["fillAssetId", node.fillAssetId]];
      if (node.type === "slider") imageReferences.push(["handleAssetId", node.handleAssetId]);
      for (const [field, assetId] of imageReferences) {
        const asset = assets.get(assetId);
        const assetPath = `${nodePath}/${field}`;
        if (!asset) add(issues, "MISSING_ASSET_REFERENCE", assetPath, `Asset '${assetId}' does not exist.`);
        else if (asset.type !== "image") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", assetPath, `A ${node.type} ${field} requires an image asset.`);
      }
    }
    if (node.type === "slider") {
      if (!(node.min < node.max) || !(node.step > 0)) add(issues, "INVALID_VALUE_RANGE", nodePath, "A slider requires min < max and step > 0.");
      if (node.defaultValue < node.min || node.defaultValue > node.max) add(issues, "VALUE_OUT_OF_RANGE", `${nodePath}/defaultValue`, "Slider defaultValue must be inside the inclusive min/max range.");
      if (node.valueTextStyle?.fontAssetId !== undefined) { const asset = assets.get(node.valueTextStyle.fontAssetId), fontPath = `${nodePath}/valueTextStyle/fontAssetId`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", fontPath, `Asset '${node.valueTextStyle.fontAssetId}' does not exist.`); else if (asset.type !== "font") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", fontPath, "A slider valueTextStyle fontAssetId requires a font asset."); }
    }
    if (node.type === "progress-bar" && (node.defaultProgress < 0 || node.defaultProgress > 100)) add(issues, "VALUE_OUT_OF_RANGE", `${nodePath}/defaultProgress`, "Progress bar defaultProgress must be inside the inclusive 0..100 range.");
    if (node.type === "prefab-instance" && !prefabs.has(node.prefabId)) add(issues, "MISSING_PREFAB_REFERENCE", `${nodePath}/prefabId`, `Prefab '${node.prefabId}' does not exist.`);
    if (node.type === "particle-emitter") { const effect = effects.get(node.effectId); if (!effect) add(issues, "MISSING_EFFECT_REFERENCE", `${nodePath}/effectId`, `Effect '${node.effectId}' does not exist.`); else if (effect.type !== "particles") add(issues, "INCOMPATIBLE_EFFECT_REFERENCE", `${nodePath}/effectId`, "Particle emitter requires a particle effect."); }
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
  register(document.project.id, "/project/id"); const assets = new Map<string, Asset>(), prefabs = new Set<string>(), effects = new Map<string, EffectDefinition>();
  const fontMediaTypes = new Set(["font/woff2", "font/woff", "font/ttf", "font/otf", "application/font-woff", "application/x-font-ttf", "application/x-font-opentype"]);
  document.assets.forEach((asset, i) => { register(asset.id, `/assets/${i}/id`); assets.set(asset.id, asset); if (asset.type === "font" && !fontMediaTypes.has(asset.source.mediaType)) add(issues, "INVALID_FONT_MEDIA_TYPE", `/assets/${i}/source/mediaType`, `Unsupported font media type '${asset.source.mediaType}'.`); });
  // Каждый atlas-фрейм ведёт себя как обычный image-ассет во всех местах, где нода ссылается на assetId:
  // виртуальная запись позволяет существующим MISSING_ASSET_REFERENCE/INCOMPATIBLE_ASSET_REFERENCE проверкам
  // работать без изменений в каждой ветке hierarchy().
  document.assets.forEach((asset) => { if (asset.type !== "atlas") return; for (const frameId of Object.values(asset.frames)) { if (!assets.has(frameId)) assets.set(frameId, { id: frameId, name: frameId, type: "image", source: { uri: "", mediaType: "image/png" } }); } });
  document.effects.forEach((effect, i) => { register(effect.id, `/effects/${i}/id`); effects.set(effect.id, effect); if (!isParticleEffect(effect)) return; const p = `/effects/${i}`, e = effect.emission, v = effect.particle.visual; const ranges: [string, { min: number; max: number }][] = [["particle/lifetime", effect.particle.lifetime], ["particle/movement/speed", effect.particle.movement.speed], ["particle/visual/scale/start", v.scale.start], ["particle/visual/scale/end", v.scale.end], ["particle/visual/rotation/initialDegrees", v.rotation.initialDegrees], ["particle/visual/rotation/angularVelocityDegrees", v.rotation.angularVelocityDegrees]]; ranges.forEach(([field, range]) => { if (range.min > range.max) add(issues, "INVALID_PARTICLE_RANGE", `${p}/${field}`, "Particle range min must not exceed max."); }); if (e.rate === 0 && e.bursts.length === 0) add(issues, "EMPTY_PARTICLE_EMISSION", `${p}/emission`, "Particle emission needs a rate or a burst."); e.bursts.forEach((burst, j) => { if (burst.time > e.duration) add(issues, "PARTICLE_BURST_OUTSIDE_DURATION", `${p}/emission/bursts/${j}/time`, "Particle burst time must be inside emission duration."); }); const source = v.source; particleAssetIds(effect).forEach((id, j) => { const asset = assets.get(id), sourcePath = source.type === "single" ? `${p}/particle/visual/source/assetId` : `${p}/particle/visual/source/assetIds/${j}`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", sourcePath, `Asset '${id}' does not exist.`); else if (asset.type !== "image") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", sourcePath, "Particle visual source requires an image asset or atlas frame."); }); });
  document.prefabs.forEach((prefab, i) => { register(prefab.id, `/prefabs/${i}/id`); prefabs.add(prefab.id); }); document.scenes.forEach((scene, i) => register(scene.id, `/scenes/${i}/id`));
  document.prefabs.forEach((prefab, i) => { prefab.nodes.forEach((node, j) => register(node.id, `/prefabs/${i}/nodes/${j}/id`)); hierarchy(prefab, `/prefabs/${i}`, assets, prefabs, effects, issues); });
  document.scenes.forEach((scene, i) => { scene.nodes.forEach((node, j) => register(node.id, `/scenes/${i}/nodes/${j}/id`)); hierarchy(scene, `/scenes/${i}`, assets, prefabs, effects, issues); const musicAssetId = scene.audio?.backgroundMusicAssetId; if (musicAssetId !== undefined) { const asset = assets.get(musicAssetId), musicPath = `/scenes/${i}/audio/backgroundMusicAssetId`; if (!asset) add(issues, "MISSING_ASSET_REFERENCE", musicPath, `Asset '${musicAssetId}' does not exist.`); else if (asset.type !== "sound") add(issues, "INCOMPATIBLE_ASSET_REFERENCE", musicPath, "Background music requires a sound asset."); } const bindings = new Set<string>(); scene.nodes.forEach((node, j) => { if (node.binding !== undefined) { const binding = node.binding.trim(); if (!binding) add(issues, "EMPTY_BINDING", `/scenes/${i}/nodes/${j}/binding`, "Binding must not be empty after trimming."); else if (bindings.has(binding)) add(issues, "DUPLICATE_BINDING", `/scenes/${i}/nodes/${j}/binding`, `Binding '${binding}' is duplicated in this scene.`); else bindings.add(binding); } }); });
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
export function migrateProjectDocument(input: unknown): ProjectDocument { if (typeof input !== "object" || input === null || !Object.hasOwn(input, "schemaVersion")) throw new ProjectDocumentMigrationError("A schemaVersion is required for migration."); const version = (input as { schemaVersion?: unknown }).schemaVersion; if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > CURRENT_SCHEMA_VERSION) throw new ProjectDocumentMigrationError(`Unsupported schemaVersion '${String(version)}'.`); const migrated = structuredClone(input) as Record<string, unknown>; if (version <= 1) migrateV1ToV2(migrated); if (version <= 6) migrated.effects = []; migrated.schemaVersion = CURRENT_SCHEMA_VERSION; assertProjectDocument(migrated); return migrated; }
function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson((value as Record<string, unknown>)[key])]));
  return value;
}
export function serializeProjectDocument(document: ProjectDocument): string { assertProjectDocument(document); return `${JSON.stringify(canonicalizeJson(document))}\n`; }

export * from "./assetPaths.js";
export * from "./manifest.js";
