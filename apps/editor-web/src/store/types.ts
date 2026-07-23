import type { StoreApi } from "zustand";
import type { AssetFile, ButtonStateKey, GridLayoutSettings, InputNode, LayoutGroupNode, LayoutItemDefinition, LayoutProfileId, LinearLayoutSettings, ParticleEffectDefinition, PrefabDefinition, ProgressBarNode, ProjectDocument, ProjectManifest, Scene, ScrollViewSettings, SliderNode, TextStyleDefinition, UINode } from "@pixi-ui-editor/schema";
export const DOCUMENT_STORAGE_KEY = "pixi-ui-editor:document";
export type EditorTool = "pan" | "select" | "resize";
export type ViewMode = "single" | "map";
export type AddableNodeType = "container" | "horizontal-layout" | "vertical-layout" | "grid-layout" | "scroll-view" | "image" | "text" | "spine" | "button" | "input" | "slider" | "progress-bar" | "particle-emitter";
export type InputPatch = Partial<Pick<InputNode, "backgroundAssetId" | "placeholder" | "defaultValue" | "maxLength" | "secure" | "align" | "padding" | "cleanOnFocus" | "clipText" | "textStyle">>;
export type SliderPatch = Partial<Pick<SliderNode, "backgroundAssetId" | "fillAssetId" | "handleAssetId" | "min" | "max" | "step" | "defaultValue" | "fillPadding" | "showValue" | "valueTextStyle">>;
export type ProgressBarPatch = Partial<Pick<ProgressBarNode, "backgroundAssetId" | "fillAssetId" | "defaultProgress" | "fillPadding">>;
export type HistoryEntry = {
  document: ProjectDocument;
  sceneId: string;
  editingPrefabId: string | null;
  selectedNodeIds: string[];
};

export type EditorState = {
  document: ProjectDocument;
  sceneId: string;
  activeProfile: LayoutProfileId;
  activeTool: EditorTool;
  viewMode: ViewMode;
  selectedNodeIds: string[];
  selectedNodeId: string | null;
  editingPrefabId: string | null;
  spineFrameRequests: Record<string, number>;
  spinePlaybackFrames: Record<string, { current: number; total: number }>;
  spineAutoplay: Record<string, boolean>;
  /** Transient authoring aid: shows one button state on the canvas. Never serialized. */
  buttonPreviewStates: Record<string, ButtonStateKey>;
  /** Transient control values shown only on the inert authoring canvas. */
  sliderPreviewValues: Record<string, number>;
  progressBarPreviewValues: Record<string, number>;
  particlePlayback: Record<string, "play" | "pause" | "restart" | "step" | "stop">;
  particleDiagnostics: Record<string, { active: number; free: number; dropped: number; playing: boolean; stopped: boolean; disposed: boolean }>;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  historyGestureActive: boolean;
  historyGestureHasCommit: boolean;
  /** `manifest.json`'s last known content: `undefined` only before the working copy finishes loading. */
  manifest: ProjectManifest | undefined;
  /** Display name of the folder the working copy is bound to (Save/Save As/Open), or `null` if unbound. */
  folderName: string | null;
  /** True once the working copy has diverged from the last successful Save/Open. */
  dirty: boolean;
  /** True while a Save/Save As/Open is in flight, to ignore re-entrant Ctrl+S / toolbar clicks. */
  folderBusy: boolean;
  /** True while the one-time IndexedDB working-copy bootstrap is still resolving (browser only). */
  bootstrapping: boolean;
  /**
   * True once the user has actually entered the editor for the current working copy (New/Open/Continue).
   * The editor always starts at the startup screen regardless of what's already in IndexedDB.
   */
  projectOpen: boolean;
  /** Set while New/Open is waiting on an explicit Save/Discard/Cancel choice because the working copy is dirty. */
  pendingWorkspaceSwitch: "new" | "open" | null;
  /** Enters the editor with whatever working copy is already loaded (from IndexedDB bootstrap). */
  continueProject(): void;
  /** Builds a brand-new, unbound project from scratch and enters the editor. Bypasses the dirty guard. */
  createNewProject(name: string): Promise<void>;
  /** Command-bound entry point for New: guards on `dirty`, then prompts for a name and calls `createNewProject`. */
  newProject(): void;
  /** Save; behaves like Save As when no folder is bound yet. */
  saveProject(): Promise<void>;
  /** Always prompts for a (possibly different) folder. */
  saveProjectAs(): Promise<void>;
  /** Command-bound entry point for Open: guards on `dirty`, then opens the folder picker. */
  openProject(): void;
  /** Resolves a pending New/Open dirty-guard prompt. */
  resolvePendingWorkspaceSwitch(action: "save" | "discard" | "cancel"): Promise<void>;
  setActiveProfile(profile: LayoutProfileId): void;
  setActiveTool(tool: EditorTool): void;
  setViewMode(mode: ViewMode): void;
  selectNode(id: string | null, additive?: boolean): void;
  selectNodes(ids: string[], additive?: boolean): void;
  selectScene(sceneId: string): void;
  addScene(name?: string): void;
  renameScene(sceneId: string, name: string): void;
  setSceneAudio(sceneId: string, audio: Scene["audio"]): void;
  deleteScene(sceneId: string): void;
  updateReferenceViewport(profile: LayoutProfileId, viewport: { width: number; height: number }): void;
  updateNode(nodeId: string, patch: Partial<Pick<UINode, "name" | "visible">> & { text?: string; style?: TextStyleDefinition; opacity?: number }): void;
  updateNodeProfileTransform(nodeId: string, patch: Partial<UINode["transform"]>): void;
  updateNodeProfileTransforms(updates: { nodeId: string; patch: Partial<UINode["transform"]> }[]): void;
  updateLayoutGroup(nodeId: string, patch: Partial<LinearLayoutSettings | GridLayoutSettings>): void;
  updateLayoutItem(nodeId: string, patch: Partial<LayoutItemDefinition>): void;
  setLayoutGroupBackgroundAsset(nodeId: string, assetId: string | undefined): void;
  updateScrollView(nodeId: string, patch: Partial<ScrollViewSettings>): void;
  updateInput(nodeId: string, patch: InputPatch): void;
  updateSlider(nodeId: string, patch: SliderPatch): void;
  updateProgressBar(nodeId: string, patch: ProgressBarPatch): void;
  previewSliderValue(nodeId: string, value: number): void;
  previewProgressBar(nodeId: string, progress: number): void;
  setNodeProfileAnchor(nodeId: string, anchor: AnchorRect, options: { setPivot: boolean; snap: boolean }): void;
  setNodeOrientationVisibility(nodeId: string, profile: LayoutProfileId, visible: boolean): void;
  // `id`, when passed, is used as the new asset's stable ID instead of generating one: the caller (asset
  // import) needs to know the ID upfront to store the asset's Blob at its final `assets/<id>/<fileName>`
  // path in projectStore before the document mutation commits.
  addImageAsset(name: string, source: { uri: string; mediaType: string }, id?: string): void;
  addFontAsset(name: string, family: string, weight: "normal" | "bold", style: "normal" | "italic", source: { uri: string; mediaType: string }, id?: string): void;
  addSpineAsset(name: string, files: { skeleton: AssetFile; atlas: AssetFile; textures: AssetFile[] }, id?: string): void;
  addAtlasAsset(name: string, files: { json: AssetFile; texture: AssetFile }, frameNames: string[], id?: string): void;
  addSoundAsset(name: string, source: { uri: string; mediaType: string }, id?: string): void;
  setImageNodeAsset(nodeId: string, assetId: string): void;
  replaceAssetSource(assetId: string, source: { uri: string; mediaType: string }): void;
  replaceSpineAssetFiles(assetId: string, files: { skeleton: AssetFile; atlas: AssetFile; textures: AssetFile[] }): void;
  deleteAsset(assetId: string): void;
  updateSpineNodeAnimation(nodeId: string, animation: string | undefined): void;
  updateSpineNodeLoop(nodeId: string, loop: boolean): void;
  requestSpineFrame(nodeId: string, frame: number): void;
  setSpineAutoplay(nodeId: string, autoplay: boolean): void;
  reportSpinePlaybackFrame(nodeId: string, playback: { current: number; total: number }): void;
  setButtonStateAsset(nodeId: string, state: ButtonStateKey, assetId: string | undefined): void;
  setButtonEnabled(nodeId: string, enabled: boolean): void;
  setButtonSounds(nodeId: string, sounds: Extract<UINode, { type: "button" }>["sounds"]): void;
  previewButtonState(nodeId: string, state: ButtonStateKey): void;
  createParticleEffect(name?: string): string | null;
  assignParticleEffect(nodeId: string, effectId: string): void;
  updateParticleEffect(effectId: string, patch: Partial<ParticleEffectDefinition>): void;
  updateParticleEmitter(nodeId: string, patch: Partial<Extract<UINode, { type: "particle-emitter" }>>): void;
  duplicateParticleEffect(nodeId: string): void;
  renameParticleEffect(effectId: string, name: string): void;
  deleteParticleEffect(effectId: string): void;
  controlParticlePlayback(nodeId: string, action: "play" | "pause" | "restart" | "step" | "stop"): void;
  reportParticleDiagnostics(nodeId: string, diagnostics: { active: number; free: number; dropped: number; playing: boolean; stopped: boolean; disposed: boolean }): void;
  undo(): void;
  redo(): void;
  beginHistoryGesture(): void;
  endHistoryGesture(): void;
  addNode(type: AddableNodeType): void;
  addNodeFromAsset(assetId: string, position: { x: number; y: number }): void;
  moveNode(nodeId: string, placement: { parentId: string | null; index: number }): void;
  deleteNode(nodeId: string): void;
  createPrefabFromNode(nodeId: string): string | null;
  addPrefabInstance(prefabId: string, position: { x: number; y: number }): void;
  renamePrefab(prefabId: string, name: string): void;
  deletePrefab(prefabId: string): void;
  setEditingPrefabId(prefabId: string | null): void;
};

export type EditingTarget = Scene | PrefabDefinition;
export type AnchorRect = { minX: number; minY: number; maxX: number; maxY: number };
export type EditorSlice<K extends keyof EditorState> = (set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]) => Pick<EditorState, K>;
