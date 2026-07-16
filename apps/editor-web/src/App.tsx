import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { buildSceneView, getSpineViewPlayback, resolveProfileTransform, setSpineViewAutoplay, setSpineViewFrame, updateNodeView, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import type { LayoutProfileId, ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import { Application, Container, Graphics, Text as PixiText, type FederatedPointerEvent } from "pixi.js";
import { getEditingTarget, getSceneRoot, useEditorStore, type EditorTool, type ViewMode } from "./store.js";
import { Inspector } from "./Inspector.js";
import { loadEditorSceneSpines, loadEditorSceneTextures, resolveFileUrl } from "./assets.js";
import { downloadProjectPackage } from "./exportPackage.js";
import { AssetsWindow } from "./AssetPanel.js";
import { NODE_DRAG_TYPE, PREFAB_DRAG_TYPE, PresetsWindow } from "./PresetsPanel.js";
import { useUiPrefsStore } from "./uiPrefs.js";
import { EDITOR_COMMAND_IDS, editorCommandRegistry, isEditorTextInput, type EditorCommandId } from "./editorCommands.js";

const CANVAS_BACKGROUND = 0x181818;
const ARTBOARD_FILL = 0x1e1e2e;
const ARTBOARD_BORDER = 0x3c3c50;
const SELECTION_COLOR = 0x4c9aff;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const EMPTY_CONTAINER_GIZMO_SIZE = 100;

type CanvasBounds = { x: number; y: number; width: number; height: number };

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const RESIZE_HANDLES: readonly { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { handle: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { handle: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { handle: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { handle: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { handle: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { handle: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { handle: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { handle: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

function nodeRectBounds(nodeView: Container, width: number, height: number): CanvasBounds {
  const matrix = nodeView.getGlobalTransform();
  const corners = [
    { x: matrix.tx, y: matrix.ty },
    { x: matrix.a * width + matrix.tx, y: matrix.b * width + matrix.ty },
    { x: matrix.c * height + matrix.tx, y: matrix.d * height + matrix.ty },
    {
      x: matrix.a * width + matrix.c * height + matrix.tx,
      y: matrix.b * width + matrix.d * height + matrix.ty,
    },
  ];
  const left = Math.min(...corners.map((corner) => corner.x));
  const top = Math.min(...corners.map((corner) => corner.y));
  const right = Math.max(...corners.map((corner) => corner.x));
  const bottom = Math.max(...corners.map((corner) => corner.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function displayedBounds(nodeView: Container): CanvasBounds {
  const bounds = nodeView.getBounds();
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function selectionBounds(
  node: UINode,
  nodesById: ReadonlyMap<string, UINode>,
  nodeViews: ReadonlyMap<string, Container>,
): CanvasBounds | undefined {
  const nodeView = nodeViews.get(node.id);
  if (nodeView === undefined || nodeView.destroyed || !nodeView.visible) return undefined;

  if (node.type !== "container") return displayedBounds(nodeView);

  const childBounds = node.children.flatMap((childId) => {
    const child = nodesById.get(childId);
    if (child === undefined) return [];
    const bounds = selectionBounds(child, nodesById, nodeViews);
    return bounds === undefined ? [] : [bounds];
  });
  return unionBounds(childBounds) ?? nodeRectBounds(nodeView, EMPTY_CONTAINER_GIZMO_SIZE, EMPTY_CONTAINER_GIZMO_SIZE);
}

function unionBounds(bounds: readonly CanvasBounds[]): CanvasBounds | undefined {
  if (bounds.length === 0) return undefined;
  const left = Math.min(...bounds.map((candidate) => candidate.x));
  const top = Math.min(...bounds.map((candidate) => candidate.y));
  const right = Math.max(...bounds.map((candidate) => candidate.x + candidate.width));
  const bottom = Math.max(...bounds.map((candidate) => candidate.y + candidate.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const roundTransformValue = (value: number) => Math.round(value * 100) / 100;

type ScreenPreset = { label: string; width: number; height: number };

const SCREEN_PRESET_GROUPS: readonly { label: string; presets: readonly ScreenPreset[] }[] = [
  {
    label: "Mobile",
    presets: [
      { label: "640 × 1136 (iPhone SE 1st Gen)", width: 640, height: 1136 },
      { label: "750 × 1334 (iPhone 6, 7, 8, SE 2nd/3rd Gen)", width: 750, height: 1334 },
      { label: "828 × 1792 (iPhone XR, 11)", width: 828, height: 1792 },
      { label: "1080 × 1920 (Pixel 2, Galaxy S5-S7)", width: 1080, height: 1920 },
      { label: "1170 × 2532 (iPhone 12, 13, 14, 15)", width: 1170, height: 2532 },
      { label: "1284 × 2778 (iPhone 12/13/14/15 Pro Max)", width: 1284, height: 2778 },
      { label: "1440 × 3200 (Galaxy S22 Ultra, OnePlus 8 Pro)", width: 1440, height: 3200 },
    ],
  },
  {
    label: "Desktop",
    presets: [
      { label: "1024 × 768 (Older CRT, legacy monitors)", width: 1024, height: 768 },
      { label: "1366 × 768 (Common budget laptops)", width: 1366, height: 768 },
      { label: "1920 × 1080 (Standard 1080p monitors)", width: 1920, height: 1080 },
      { label: "2560 × 1440 (2K monitors, gaming displays)", width: 2560, height: 1440 },
      { label: "3024 × 1964 (MacBook Pro 14” 2021+)", width: 3024, height: 1964 },
      { label: "3840 × 2160 (4K UHD monitors)", width: 3840, height: 2160 },
      { label: "6016 × 3384 (6K Apple Pro Display XDR)", width: 6016, height: 3384 },
    ],
  },
  {
    label: "Tablet",
    presets: [
      { label: "768 × 1024 (iPad Mini 1st-5th Gen, iPad 1st-9th Gen)", width: 768, height: 1024 },
      { label: "810 × 1080 (iPad Mini 6th Gen)", width: 810, height: 1080 },
      { label: "834 × 1194 (iPad Air 3rd-5th Gen)", width: 834, height: 1194 },
      { label: "1024 × 1366 (iPad Pro 12.9”)", width: 1024, height: 1366 },
      { label: "1200 × 1920 (Galaxy Tab A7, Fire HD 10)", width: 1200, height: 1920 },
      { label: "1600 × 2560 (Galaxy Tab S7/S8/S9)", width: 1600, height: 2560 },
    ],
  },
] as const;

const SCREEN_PRESETS = SCREEN_PRESET_GROUPS.flatMap((group) => group.presets);

function toActiveViewport(preset: ScreenPreset, profile: LayoutProfileId) {
  const shortSide = Math.min(preset.width, preset.height);
  const longSide = Math.max(preset.width, preset.height);
  return profile === "desktop" ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide };
}

function getPresetLabel(preset: ScreenPreset, profile: LayoutProfileId) {
  const viewport = toActiveViewport(preset, profile);
  return preset.label.replace(/^\d+ × \d+/, `${viewport.width} × ${viewport.height}`);
}

function isCurrentPreset(preset: ScreenPreset, viewport: { width: number; height: number }, profile: LayoutProfileId) {
  const expectedViewport = toActiveViewport(preset, profile);
  return viewport.width === expectedViewport.width && viewport.height === expectedViewport.height;
}

function ScreenNumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  const applyValue = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChange(parsed);
  };

  return <label className="toolbar-screen-number"><span>{label}</span><input type="number" value={text} step={1} onChange={applyValue} /></label>;
}

function ScreenResolutionsMenu({
  activeProfile,
  viewport,
  setActiveProfile,
  updateReferenceViewport,
}: {
  activeProfile: LayoutProfileId;
  viewport: { width: number; height: number };
  setActiveProfile: (profile: LayoutProfileId) => void;
  updateReferenceViewport: (profile: LayoutProfileId, viewport: { width: number; height: number }) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const preferredGroupLabels = activeProfile === "desktop"
    ? ["Desktop", "Tablet", "Mobile"]
    : ["Mobile", "Tablet", "Desktop"];
  const selectedPreset = preferredGroupLabels
    .flatMap((groupLabel) => SCREEN_PRESET_GROUPS.find((group) => group.label === groupLabel)?.presets ?? [])
    .find((preset) => isCurrentPreset(preset, viewport, activeProfile));

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const updateViewportDimension = (dimension: "width" | "height", value: number) => {
    updateReferenceViewport(activeProfile, { ...viewport, [dimension]: value });
  };
  const applyPreset = (preset: ScreenPreset) => {
    updateReferenceViewport(activeProfile, toActiveViewport(preset, activeProfile));
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="screen-resolutions-menu">
      <button
        type="button"
        className={`screen-resolutions-trigger${isOpen ? " screen-resolutions-trigger-open" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
      >
        Screen Resolutions
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <section className="screen-resolutions-popover" aria-label="Screen Resolutions">
          {SCREEN_PRESET_GROUPS.map((group) => (
            <fieldset key={group.label} className="screen-resolution-group">
              <legend>{group.label}</legend>
              {group.presets.map((preset) => (
                <label key={preset.label} className="screen-resolution-option">
                  <input
                    type="radio"
                    name="screen-resolution"
                    checked={selectedPreset?.label === preset.label}
                    onChange={() => applyPreset(preset)}
                  />
                  <span>{getPresetLabel(preset, activeProfile)}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <fieldset className="screen-resolution-group screen-resolution-custom">
            <legend>Custom</legend>
            <div className="screen-resolution-custom-fields">
              <ScreenNumberField label="W" value={viewport.width} onChange={(value) => updateViewportDimension("width", value)} />
              <ScreenNumberField label="H" value={viewport.height} onChange={(value) => updateViewportDimension("height", value)} />
            </div>
          </fieldset>
          <fieldset className="screen-resolution-group">
            <legend>Orientation</legend>
            <label className="screen-resolution-option">
              <input type="radio" name="orientation" checked={activeProfile === "desktop"} onChange={() => setActiveProfile("desktop")} />
              <span>Horizontal</span>
            </label>
            <label className="screen-resolution-option">
              <input type="radio" name="orientation" checked={activeProfile === "mobile"} onChange={() => setActiveProfile("mobile")} />
              <span>Vertical</span>
            </label>
          </fieldset>
        </section>
      )}
    </div>
  );
}

function WindowsSection({ document, sceneId, editingPrefab }: { document: ProjectDocument; sceneId: string | null; editingPrefab: boolean }) {
  const selectScene = useEditorStore((state) => state.selectScene);
  const addScene = useEditorStore((state) => state.addScene);
  const renameScene = useEditorStore((state) => state.renameScene);
  const deleteScene = useEditorStore((state) => state.deleteScene);
  const [renamingSceneId, setRenamingSceneId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const commitRename = () => {
    if (renamingSceneId !== null && renameText.trim() !== "") renameScene(renamingSceneId, renameText);
    setRenamingSceneId(null);
  };

  return (
    <section className="windows-section">
      <h2>Windows</h2>
      <ul className="windows-list">
        {document.scenes.map((scene) => (
          <li key={scene.id} className="windows-list-item">
            {renamingSceneId === scene.id ? (
              <input
                className="window-rename-input"
                autoFocus
                value={renameText}
                onChange={(event) => setRenameText(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setRenamingSceneId(null);
                }}
              />
            ) : (
              <button
                type="button"
                className={`window-row${scene.id === sceneId ? " window-row-active" : ""}`}
                onClick={() => selectScene(scene.id)}
                onDoubleClick={() => {
                  if (editingPrefab) return;
                  setRenamingSceneId(scene.id);
                  setRenameText(scene.name);
                }}
              >
                {scene.name}
              </button>
            )}
            <button
              type="button"
              className="window-delete"
              aria-label={`Delete window ${scene.name}`}
              title={`Delete window ${scene.name}`}
              disabled={editingPrefab || document.scenes.length === 1}
              onClick={() => {
                if (window.confirm(`Delete window "${scene.name}"?`)) deleteScene(scene.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="window-add" disabled={editingPrefab} onClick={() => addScene()}>+ Window</button>
    </section>
  );
}

type HierarchyDropMode = "before" | "inside" | "after";

function HierarchyTree({ owner, prefabs, selectedNodeIds, implicitRootNodeId }: { owner: { rootNodeIds: string[]; nodes: UINode[] }; prefabs: ProjectDocument["prefabs"]; selectedNodeIds: string[]; implicitRootNodeId?: string }) {
  const selectNode = useEditorStore((state) => state.selectNode);
  const moveNode = useEditorStore((state) => state.moveNode);
  const draggedNodeIdRef = useRef<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string | null; mode: HierarchyDropMode | "root" } | null>(null);
  const nodesById = new Map<string, UINode>(owner.nodes.map((node) => [node.id, node]));
  const implicitRoot = implicitRootNodeId === undefined ? undefined : nodesById.get(implicitRootNodeId);
  const visibleRootNodeIds = implicitRoot === undefined
    ? owner.rootNodeIds
    : [...implicitRoot.children, ...owner.rootNodeIds.filter((nodeId) => nodeId !== implicitRoot.id)];

  const isDescendantOf = (candidateId: string, ancestorId: string): boolean => {
    let current = nodesById.get(candidateId);
    while (current?.parentId !== null && current?.parentId !== undefined) {
      if (current.parentId === ancestorId) return true;
      current = nodesById.get(current.parentId);
    }
    return false;
  };

  const canDrop = (sourceId: string, targetNode: UINode, mode: HierarchyDropMode): boolean => {
    if (sourceId === targetNode.id) return false;
    const parentId = mode === "inside" ? targetNode.id : targetNode.parentId;
    return parentId === null || (parentId !== sourceId && !isDescendantOf(parentId, sourceId));
  };

  const finishDrag = (): void => {
    draggedNodeIdRef.current = null;
    setDraggedNodeId(null);
    setDropTarget(null);
  };

  const dropOnNode = (event: DragEvent<HTMLButtonElement>, targetNode: UINode, mode: HierarchyDropMode): void => {
    const sourceId = event.dataTransfer.getData(NODE_DRAG_TYPE) || draggedNodeId;
    if (sourceId === null || !canDrop(sourceId, targetNode, mode)) return;
    event.preventDefault();
    event.stopPropagation();

    if (mode === "inside") {
      moveNode(sourceId, { parentId: targetNode.id, index: targetNode.children.length });
    } else {
      const siblings = targetNode.parentId === null
        ? owner.rootNodeIds
        : nodesById.get(targetNode.parentId)?.children ?? [];
      const targetIndex = siblings.indexOf(targetNode.id);
      moveNode(sourceId, { parentId: targetNode.parentId, index: targetIndex + (mode === "after" ? 1 : 0) });
    }
    finishDrag();
  };

  const renderNode = (nodeId: string, depth: number): ReactNode => {
    const node = nodesById.get(nodeId);
    if (node === undefined) return null;

    return (
      <li key={node.id}>
        <button
          type="button"
          className={`tree-node${selectedNodeIds.includes(node.id) ? " tree-node-selected" : ""}${dropTarget?.nodeId === node.id ? ` tree-node-drop-${dropTarget.mode}` : ""}`}
          style={{ paddingInlineStart: `${depth * 16 + 12}px` }}
          draggable
          title="Drag to reorder or make this node a child of another node"
          onDragStart={(event) => {
            event.dataTransfer.setData(NODE_DRAG_TYPE, node.id);
            event.dataTransfer.effectAllowed = "copyMove";
            draggedNodeIdRef.current = node.id;
            setDraggedNodeId(node.id);
            setDropTarget(null);
          }}
          onDragEnd={finishDrag}
          onDragOver={(event) => {
            const sourceId = draggedNodeIdRef.current;
            if (sourceId === null) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientY - bounds.top) / bounds.height;
            const mode: HierarchyDropMode = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
            if (!canDrop(sourceId, node, mode)) {
              event.dataTransfer.dropEffect = "none";
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropTarget({ nodeId: node.id, mode });
          }}
          onDrop={(event) => {
            const mode = dropTarget?.nodeId === node.id && dropTarget.mode !== "root" ? dropTarget.mode : "inside";
            dropOnNode(event, node, mode);
          }}
          onClick={(event) => selectNode(node.id, event.shiftKey)}
          aria-pressed={selectedNodeIds.includes(node.id)}
        >
          {node.name} <span>({node.type === "prefab-instance" ? "preset" : node.type})</span>
        </button>
        {node.type === "prefab-instance"
          ? renderPrefabChildren(node.prefabId, depth + 1)
          : node.children.length > 0 && <ul>{node.children.map((childId) => renderNode(childId, depth + 1))}</ul>}
      </li>
    );
  };

  const renderPrefabChildren = (prefabId: string, depth: number): ReactNode => {
    const prefab = prefabs.find((candidate) => candidate.id === prefabId);
    if (prefab === undefined) return null;
    const prefabNodesById = new Map(prefab.nodes.map((node) => [node.id, node]));
    const renderLockedNode = (nodeId: string, nestedDepth: number): ReactNode => {
      const node = prefabNodesById.get(nodeId);
      if (node === undefined) return null;
      return <li key={node.id}>
        <button
          type="button"
          className={`tree-node tree-node-locked${selectedNodeIds.includes(node.id) ? " tree-node-selected" : ""}`}
          style={{ paddingInlineStart: `${nestedDepth * 16 + 12}px` }}
          title="Preset content is read-only. Edit the preset to change it."
          onClick={(event) => selectNode(node.id, event.shiftKey)}
          aria-disabled="true"
          aria-pressed={selectedNodeIds.includes(node.id)}
        >
          {node.name} <span>({node.type})</span>
        </button>
        {node.children.length > 0 && <ul>{node.children.map((childId) => renderLockedNode(childId, nestedDepth + 1))}</ul>}
      </li>;
    };
    return <ul>{prefab.rootNodeIds.map((nodeId) => renderLockedNode(nodeId, depth))}</ul>;
  };

  return (
    <ul className="tree">
      {visibleRootNodeIds.map((nodeId) => renderNode(nodeId, 0))}
      {draggedNodeId !== null && (
        <li
          className={`tree-root-drop-zone${dropTarget?.mode === "root" ? " tree-root-drop-zone-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropTarget({ nodeId: null, mode: "root" });
          }}
          onDrop={(event) => {
            const sourceId = event.dataTransfer.getData(NODE_DRAG_TYPE) || draggedNodeId;
            event.preventDefault();
            event.stopPropagation();
            moveNode(sourceId, {
              parentId: implicitRoot?.id ?? null,
              index: implicitRoot?.children.length ?? owner.rootNodeIds.length,
            });
            finishDrag();
          }}
        >
          Move to top level
        </li>
      )}
    </ul>
  );
}

// Структурный ключ сцены: Pixi-дерево пересобирается, только когда меняется он.
// Transform, visibility и text не входят в ключ — они применяются к живым view через updateNodeView.
function nodeStructure(node: UINode): unknown[] {
  switch (node.type) {
    case "image":
      return [node.id, node.parentId, node.children, node.type, node.assetId];
    case "spine":
      return [node.id, node.parentId, node.children, node.type, node.assetId, node.animation, node.loop];
    case "prefab-instance":
      return [node.id, node.parentId, node.children, node.type, node.prefabId];
    default:
      return [node.id, node.parentId, node.children, node.type];
  }
}

function computeStructuralKey(document: ProjectDocument, sceneId: string, viewMode: ViewMode): string {
  // Map рендерит все сцены с запечёнными transform, поэтому там любой коммит остаётся полной пересборкой.
  if (viewMode === "map") return JSON.stringify({ mode: "map", scenes: document.scenes, assets: document.assets, prefabs: document.prefabs });

  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  return JSON.stringify({
    mode: "single",
    scene: scene === undefined ? null : { id: scene.id, roots: scene.rootNodeIds, layout: scene.layout, nodes: scene.nodes.map(nodeStructure) },
    assets: document.assets,
    // Редактируемый пресет отображается собственной синтетической сценой (id пресета = id сцены),
    // поэтому его определение из ключа исключается — иначе каждый его коммит пересобирал бы сцену.
    prefabs: document.prefabs.filter((prefab) => prefab.id !== sceneId),
  });
}

function SceneCanvas({ document, sceneId, activeProfile, activeTool, viewMode, selectedNodeIds, selectedNodeId, editingPrefabName, spineFrameRequest, spineAutoplay, deleteDisabled, setActiveProfile, addNode, addNodeFromAsset, addPrefabInstance, finishEditingPrefab }: {
  document: ProjectDocument;
  sceneId: string;
  activeProfile: LayoutProfileId;
  activeTool: EditorTool;
  viewMode: ViewMode;
  selectedNodeIds: string[];
  selectedNodeId: string | null;
  editingPrefabName: string | null;
  spineFrameRequest: number | undefined;
  spineAutoplay: boolean;
  deleteDisabled: boolean;
  setActiveProfile: (profile: LayoutProfileId) => void;
  addNode: (type: "container" | "image" | "text" | "spine") => void;
  addNodeFromAsset: (assetId: string, position: { x: number; y: number }) => void;
  addPrefabInstance: (prefabId: string, position: { x: number; y: number }) => void;
  finishEditingPrefab: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<Container | null>(null);
  const artboardRef = useRef<Graphics | null>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const nodeViewsRef = useRef<Map<string, Container>>(new Map());
  const spineDataRef = useRef<Map<string, SkeletonData>>(new Map());
  const spinePlaybackTickerRef = useRef<(() => void) | null>(null);
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const resizeHandlesRef = useRef<Container | null>(null);
  const viewportRef = useRef<{ width: number; height: number } | null>(null);
  const cameraFittedRef = useRef(false);
  const renderedProfileRef = useRef<LayoutProfileId | null>(null);
  const renderedViewModeRef = useRef<ViewMode | null>(null);
  const fitCameraRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{
    entries: {
      nodeId: string;
      pointerStartX: number;
      pointerStartY: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      pivotX: number;
      pivotY: number;
    }[];
  } | null>(null);
  const resizeDragRef = useRef<{
    handle: ResizeHandle;
    nodeId: string;
    startX: number;
    startY: number;
    transform: UINode["transform"];
    scaleX: number;
    scaleY: number;
    viewScaleX: number;
    viewScaleY: number;
    viewPositionX: number;
    viewPositionY: number;
    patch: Partial<UINode["transform"]>;
  } | null>(null);
  const startDragRef = useRef<((nodeId: string, event: FederatedPointerEvent) => void) | null>(null);
  const startResizeRef = useRef<((handle: ResizeHandle, event: FederatedPointerEvent) => void) | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [zoom, setZoom] = useState(1);
  // Актуальный документ для асинхронной пересборки: она может завершиться позже очередного нестуктурного коммита.
  const documentRef = useRef(document);
  documentRef.current = document;
  const structuralKey = useMemo(() => computeStructuralKey(document, sceneId, viewMode), [document, sceneId, viewMode]);

  const redrawSelectionRef = useRef<() => void>(() => {
    const selectionGraphics = selectionGraphicsRef.current;
    if (selectionGraphics === null) return;

    selectionGraphics.clear();
    const resizeHandles = resizeHandlesRef.current;
    resizeHandles?.removeChildren().forEach((child) => child.destroy());
    const editorState = useEditorStore.getState();
    const owner = getEditingTarget(editorState.document, editorState);
    if (owner === undefined) return;
    const nodesById = new Map(owner.nodes.map((candidate) => [candidate.id, candidate]));
    const selectedBounds = editorState.selectedNodeIds.flatMap((nodeId) => {
      const node = nodesById.get(nodeId);
      const nodeView = nodeViewsRef.current.get(nodeId);
      if (node === undefined || nodeView === undefined) return [];
      const bounds = selectionBounds(node, nodesById, nodeViewsRef.current);
      if (bounds === undefined) return [];
      selectionGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({ width: 1.5, color: SELECTION_COLOR });
      return [{ node, nodeView, bounds }];
    });

    if (resizeHandles === null || selectedBounds.length !== 1) return;
    const [{ node, nodeView, bounds }] = selectedBounds;
    if (node.type === "container") {
      const matrix = nodeView.getGlobalTransform();
      selectionGraphics
        .circle(matrix.tx, matrix.ty, 4)
        .stroke({ width: 1.5, color: 0xffffff });
      const moveHandle = new Graphics()
        .circle(0, 0, 8)
        .fill(SELECTION_COLOR)
        .stroke({ width: 1.5, color: 0xffffff })
        .moveTo(-4, 0).lineTo(4, 0)
        .moveTo(0, -4).lineTo(0, 4)
        .stroke({ width: 1.5, color: 0xffffff });
      moveHandle.position.set(bounds.x, bounds.y);
      moveHandle.eventMode = editorState.activeTool === "pan" ? "none" : "static";
      moveHandle.cursor = "move";
      moveHandle.on("pointerdown", (event) => {
        if (event.button !== 0 || useEditorStore.getState().activeTool === "pan") return;
        event.stopPropagation();
        startDragRef.current?.(node.id, event);
      });
      resizeHandles.addChild(moveHandle);
      return;
    }
    if (useEditorStore.getState().activeTool !== "resize") return;

    for (const { handle, x, y, cursor } of RESIZE_HANDLES) {
      const control = new Graphics().rect(-5, -5, 10, 10).fill(0xffffff).stroke({ width: 1.5, color: SELECTION_COLOR });
      control.position.set(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
      control.eventMode = "static";
      control.cursor = cursor;
      control.on("pointerdown", (event) => startResizeRef.current?.(handle, event));
      resizeHandles.addChild(control);
    }
  });

  useEffect(() => {
    const application = new Application();
    let cancelled = false;
    let initialized = false;
    let removeDomListeners: (() => void) | null = null;

    void application.init({ background: CANVAS_BACKGROUND, resizeTo: hostRef.current! }).then(() => {
      initialized = true;
      if (cancelled) {
        application.destroy(true);
        return;
      }

      hostRef.current?.appendChild(application.canvas);

      const world = new Container();
      const artboard = new Graphics();
      world.addChild(artboard);
      const overlay = new Container();
      overlay.eventMode = "none";
      const selectionGraphics = new Graphics();
      overlay.addChild(selectionGraphics);
      const selectionAreaGraphics = new Graphics();
      overlay.addChild(selectionAreaGraphics);
      const resizeHandles = new Container();
      resizeHandles.eventMode = "static";
      application.stage.addChild(world, overlay, resizeHandles);
      application.stage.eventMode = "static";
      application.stage.hitArea = application.screen;
      let selectionArea: { startX: number; startY: number; currentX: number; currentY: number; additive: boolean } | null = null;
      const drawSelectionArea = () => {
        selectionAreaGraphics.clear();
        if (selectionArea === null) return;
        const x = Math.min(selectionArea.startX, selectionArea.currentX);
        const y = Math.min(selectionArea.startY, selectionArea.currentY);
        const width = Math.abs(selectionArea.currentX - selectionArea.startX);
        const height = Math.abs(selectionArea.currentY - selectionArea.startY);
        selectionAreaGraphics.rect(x, y, width, height).fill({ color: SELECTION_COLOR, alpha: 0.12 }).stroke({ width: 1, color: SELECTION_COLOR });
      };
      const moveSelectionArea = (event: FederatedPointerEvent) => {
        if (selectionArea === null) return;
        selectionArea.currentX = event.global.x;
        selectionArea.currentY = event.global.y;
        drawSelectionArea();
      };
      const finishSelectionArea = () => {
        if (selectionArea === null) return;
        const area = {
          x: Math.min(selectionArea.startX, selectionArea.currentX),
          y: Math.min(selectionArea.startY, selectionArea.currentY),
          width: Math.abs(selectionArea.currentX - selectionArea.startX),
          height: Math.abs(selectionArea.currentY - selectionArea.startY),
        };
        const state = useEditorStore.getState();
        const owner = getEditingTarget(state.document, state);
        const technicalRootId = state.editingPrefabId === null && owner !== undefined && "layout" in owner ? getSceneRoot(owner)?.id : undefined;
        const nodesById = new Map(owner?.nodes.map((node) => [node.id, node]) ?? []);
        const selectedIds = owner?.nodes.flatMap((node) => {
          if (node.id === technicalRootId) return [];
          const bounds = selectionBounds(node, nodesById, nodeViewsRef.current);
          if (bounds === undefined) return [];
          const intersects = bounds.x <= area.x + area.width && bounds.x + bounds.width >= area.x
            && bounds.y <= area.y + area.height && bounds.y + bounds.height >= area.y;
          return intersects ? [node.id] : [];
        }) ?? [];
        state.selectNodes(selectedIds, selectionArea.additive);
        selectionArea = null;
        selectionAreaGraphics.clear();
        application.stage.off("pointermove", moveSelectionArea);
        application.stage.off("pointerup", finishSelectionArea);
        application.stage.off("pointerupoutside", finishSelectionArea);
      };
      application.stage.on("pointerdown", (event) => {
        if (event.button !== 0 || useEditorStore.getState().activeTool === "pan") return;
        selectionArea = { startX: event.global.x, startY: event.global.y, currentX: event.global.x, currentY: event.global.y, additive: event.shiftKey };
        drawSelectionArea();
        application.stage.on("pointermove", moveSelectionArea);
        application.stage.on("pointerup", finishSelectionArea);
        application.stage.on("pointerupoutside", finishSelectionArea);
      });

      const syncCamera = () => {
        setZoom(world.scale.x);
        redrawSelectionRef.current();
      };

      fitCameraRef.current = () => {
        const viewport = viewportRef.current;
        const host = hostRef.current;
        if (viewport === null || host === null) return;

        const scale = Math.min(host.clientWidth / viewport.width, host.clientHeight / viewport.height) * 0.9;
        world.scale.set(scale);
        world.position.set((host.clientWidth - viewport.width * scale) / 2, (host.clientHeight - viewport.height * scale) / 2);
        syncCamera();
      };

      const canvas = application.canvas;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, world.scale.x * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const ratio = scale / world.scale.x;
        world.position.set(pointerX - (pointerX - world.position.x) * ratio, pointerY - (pointerY - world.position.y) * ratio);
        world.scale.set(scale);
        syncCamera();
      };

      let pan: { pointerId: number; lastX: number; lastY: number } | null = null;
      const onMouseDown = (event: MouseEvent) => {
        if (event.button === 1) event.preventDefault();
      };
      const onPointerDown = (event: PointerEvent) => {
        const activeTool = useEditorStore.getState().activeTool;
        if (event.button !== 1 && !(event.button === 0 && activeTool === "pan")) return;
        event.preventDefault();
        pan = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
        canvas.style.cursor = "grabbing";
        canvas.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (pan === null || event.pointerId !== pan.pointerId) return;
        world.position.x += event.clientX - pan.lastX;
        world.position.y += event.clientY - pan.lastY;
        pan = { pointerId: pan.pointerId, lastX: event.clientX, lastY: event.clientY };
        redrawSelectionRef.current();
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pan === null || event.pointerId !== pan.pointerId) return;
        pan = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = useEditorStore.getState().activeTool === "pan" ? "grab" : "";
      };

      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      removeDomListeners = () => {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      };

      const stopDrag = () => {
        const drag = dragRef.current;
        if (drag === null) return;
        dragRef.current = null;
        application.stage.off("pointermove", moveDraggedNode);
        application.stage.off("pointerup", stopDrag);
        application.stage.off("pointerupoutside", stopDrag);
        // Клик без перемещения не коммитит документ — иначе каждое выделение дергало бы store и подписчиков.
        // drag.x/y — это view.position (= transform.x + pivot-офсет), поэтому перед коммитом офсет вычитаем.
        const updates = drag.entries.flatMap((entry) => entry.x === entry.startX && entry.y === entry.startY
          ? []
          : [{ nodeId: entry.nodeId, patch: { x: entry.x - entry.pivotX, y: entry.y - entry.pivotY } }]);
        useEditorStore.getState().updateNodeProfileTransforms(updates);
      };
      const moveDraggedNode = (event: FederatedPointerEvent) => {
        const drag = dragRef.current;
        if (drag === null) return;

        // Сцена пересобирается при каждом изменении документа, поэтому view ищем заново.
        const entries = drag.entries.map((entry) => {
          const nodeView = nodeViewsRef.current.get(entry.nodeId);
          const parentView = nodeView?.parent;
          if (nodeView === undefined || nodeView.destroyed || parentView === null || parentView === undefined) return entry;
          const localPosition = parentView.toLocal(event.global);
          const x = Math.round((entry.startX + localPosition.x - entry.pointerStartX) * 100) / 100;
          const y = Math.round((entry.startY + localPosition.y - entry.pointerStartY) * 100) / 100;
          nodeView.position.set(x, y);
          return { ...entry, x, y };
        });
        dragRef.current = { entries };
        redrawSelectionRef.current();
      };
      startDragRef.current = (nodeId, event) => {
        const state = useEditorStore.getState();
        const owner = getEditingTarget(state.document, state);
        if (owner === undefined) return;
        const nodesById = new Map(owner.nodes.map((node) => [node.id, node]));
        const selectedIds = state.selectedNodeIds.includes(nodeId) ? state.selectedNodeIds : [nodeId];
        const selectedSet = new Set(selectedIds);
        const hasSelectedAncestor = (candidateId: string): boolean => {
          let parentId = nodesById.get(candidateId)?.parentId;
          while (parentId !== null && parentId !== undefined) {
            if (selectedSet.has(parentId)) return true;
            parentId = nodesById.get(parentId)?.parentId;
          }
          return false;
        };
        const entries = selectedIds.flatMap((selectedId) => {
          if (hasSelectedAncestor(selectedId)) return [];
          const nodeView = nodeViewsRef.current.get(selectedId);
          const parentView = nodeView?.parent;
          if (nodeView === undefined || nodeView.destroyed || parentView === null || parentView === undefined) return [];
          const pointerStart = parentView.toLocal(event.global);
          return [{
            nodeId: selectedId,
            pointerStartX: pointerStart.x,
            pointerStartY: pointerStart.y,
            startX: nodeView.position.x,
            startY: nodeView.position.y,
            x: nodeView.position.x,
            y: nodeView.position.y,
            pivotX: nodeView.pivot.x,
            pivotY: nodeView.pivot.y,
          }];
        });
        if (entries.length === 0) return;
        dragRef.current = { entries };
        application.stage.on("pointermove", moveDraggedNode);
        application.stage.on("pointerup", stopDrag);
        application.stage.on("pointerupoutside", stopDrag);
      };

      const stopResize = () => {
        const drag = resizeDragRef.current;
        if (drag === null) return;
        resizeDragRef.current = null;
        application.stage.off("pointermove", moveResizedNode);
        application.stage.off("pointerup", stopResize);
        application.stage.off("pointerupoutside", stopResize);
        if (Object.keys(drag.patch).length > 0) useEditorStore.getState().updateNodeProfileTransform(drag.nodeId, drag.patch);
      };
      const moveResizedNode = (event: FederatedPointerEvent) => {
        const drag = resizeDragRef.current;
        if (drag === null) return;

        const nodeView = nodeViewsRef.current.get(drag.nodeId);
        const parentView = nodeView?.parent;
        if (nodeView === undefined || nodeView.destroyed || parentView === null || parentView === undefined) return;

        const position = parentView.toLocal(event.global);
        const deltaX = position.x - drag.startX;
        const deltaY = position.y - drag.startY;
        const patch: Partial<UINode["transform"]> = {};

        if (drag.handle.includes("e")) patch.width = Math.max(1, drag.transform.width + deltaX / drag.scaleX);
        if (drag.handle.includes("w")) {
          const width = Math.max(1, drag.transform.width - deltaX / drag.scaleX);
          patch.width = width;
          patch.x = drag.transform.x + (drag.transform.width - width) * drag.scaleX;
        }
        if (drag.handle.includes("s")) patch.height = Math.max(1, drag.transform.height + deltaY / drag.scaleY);
        if (drag.handle.includes("n")) {
          const height = Math.max(1, drag.transform.height - deltaY / drag.scaleY);
          patch.height = height;
          patch.y = drag.transform.y + (drag.transform.height - height) * drag.scaleY;
        }

        for (const key of Object.keys(patch) as (keyof UINode["transform"])[]) {
          patch[key] = roundTransformValue(patch[key]!);
        }
        nodeView.scale.set(
          drag.viewScaleX * (patch.width ?? drag.transform.width) / drag.transform.width,
          drag.viewScaleY * (patch.height ?? drag.transform.height) / drag.transform.height,
        );
        nodeView.position.set(
          drag.viewPositionX + (patch.x ?? drag.transform.x) - drag.transform.x,
          drag.viewPositionY + (patch.y ?? drag.transform.y) - drag.transform.y,
        );
        resizeDragRef.current = { ...drag, patch };
        redrawSelectionRef.current();
      };
      startResizeRef.current = (handle, event) => {
        const state = useEditorStore.getState();
        const nodeId = state.selectedNodeId;
        if (nodeId === null) return;
        const node = getEditingTarget(state.document, state)?.nodes.find((candidate) => candidate.id === nodeId);
        const nodeView = nodeViewsRef.current.get(nodeId);
        const parentView = nodeView?.parent;
        if (node === undefined || nodeView === undefined || parentView === null || parentView === undefined) return;

        event.stopPropagation();
        const position = parentView.toLocal(event.global);
        const transform = resolveProfileTransform(node, state.activeProfile).transform;
        resizeDragRef.current = {
          handle,
          nodeId,
          startX: position.x,
          startY: position.y,
          transform: { ...transform },
          scaleX: nodeView.width / transform.width,
          scaleY: nodeView.height / transform.height,
          viewScaleX: nodeView.scale.x,
          viewScaleY: nodeView.scale.y,
          viewPositionX: nodeView.position.x,
          viewPositionY: nodeView.position.y,
          patch: {},
        };
        application.stage.on("pointermove", moveResizedNode);
        application.stage.on("pointerup", stopResize);
        application.stage.on("pointerupoutside", stopResize);
      };

      worldRef.current = world;
      artboardRef.current = artboard;
      selectionGraphicsRef.current = selectionGraphics;
      resizeHandlesRef.current = resizeHandles;
      setApplication(application);
    });

    return () => {
      cancelled = true;
      removeDomListeners?.();
      worldRef.current = null;
      artboardRef.current = null;
      sceneRootRef.current = null;
      nodeViewsRef.current = new Map();
      spineDataRef.current = new Map();
      if (spinePlaybackTickerRef.current !== null) application.ticker.remove(spinePlaybackTickerRef.current);
      spinePlaybackTickerRef.current = null;
      selectionGraphicsRef.current = null;
      resizeHandlesRef.current = null;
      fitCameraRef.current = null;
      cameraFittedRef.current = false;
      if (initialized) application.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (application === null) return;
    application.canvas.style.cursor = activeTool === "pan" ? "grab" : "";
  }, [activeTool, application]);

  useEffect(() => {
    const world = worldRef.current;
    if (application === null || world === null) return;

    // Effect зависит от structuralKey, а не от document: нестуктурные коммиты (transform, visibility, text)
    // применяются к живым view отдельным effect'ом ниже и не пересобирают Pixi-дерево.
    const effectDocument = documentRef.current;
    const scene = effectDocument.scenes.find((candidate) => candidate.id === sceneId);
    if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

    const profileChanged = renderedProfileRef.current !== activeProfile;
    renderedProfileRef.current = activeProfile;
    const viewModeChanged = renderedViewModeRef.current !== viewMode;
    renderedViewModeRef.current = viewMode;

    let cancelled = false;

    if (viewMode === "map") {
      const gap = scene.layout.referenceViewports[activeProfile].width * 0.1;
      let offsetX = 0;
      let maxHeight = 0;
      const placements = effectDocument.scenes.map((mapScene) => {
        const sceneViewport = mapScene.layout.referenceViewports[activeProfile];
        const placement = { scene: mapScene, viewport: sceneViewport, x: offsetX };
        offsetX += sceneViewport.width + gap;
        maxHeight = Math.max(maxHeight, sceneViewport.height);
        return placement;
      });
      const totalWidth = Math.max(1, offsetX - gap);
      const viewportChanged = viewportRef.current?.width !== totalWidth || viewportRef.current?.height !== maxHeight;
      viewportRef.current = { width: totalWidth, height: maxHeight };
      const artboard = artboardRef.current?.clear();
      for (const placement of placements) {
        artboard?.rect(placement.x, 0, placement.viewport.width, placement.viewport.height).fill(ARTBOARD_FILL).stroke({ width: 2, color: ARTBOARD_BORDER });
      }

      void Promise.all(placements.map((placement) => Promise.all([
        loadEditorSceneTextures(effectDocument, placement.scene.id),
        loadEditorSceneSpines(effectDocument, placement.scene.id),
      ]))).then((loadedScenes) => {
        if (cancelled) return;

        const mapRoot = new Container();
        placements.forEach((placement, index) => {
          const [textures, spines] = loadedScenes[index]!;
          const { root } = buildSceneView(effectDocument, placement.scene.id, activeProfile, textures, spines);
          root.position.x = placement.x;
          root.eventMode = "none";

          const label = new PixiText({
            text: placement.scene.name,
            style: { fill: 0xcccccc, fontSize: Math.max(24, placement.viewport.height * 0.04) },
          });
          label.position.set(placement.x, -label.height - 12);

          const hitArea = new Graphics().rect(0, 0, placement.viewport.width, placement.viewport.height).fill({ color: 0xffffff, alpha: 0.001 });
          hitArea.position.x = placement.x;
          hitArea.eventMode = "static";
          hitArea.cursor = "pointer";
          // Клик (без заметного перемещения — иначе это pan) открывает окно в single-режиме.
          let pressPosition: { x: number; y: number } | null = null;
          hitArea.on("pointerdown", (event) => {
            if (event.button === 0) pressPosition = { x: event.global.x, y: event.global.y };
          });
          hitArea.on("pointerup", (event) => {
            if (pressPosition === null) return;
            const deltaX = event.global.x - pressPosition.x;
            const deltaY = event.global.y - pressPosition.y;
            pressPosition = null;
            if (deltaX * deltaX + deltaY * deltaY > 25) return;
            const state = useEditorStore.getState();
            state.selectScene(placement.scene.id);
            state.setViewMode("single");
          });

          mapRoot.addChild(root, label, hitArea);
        });

        sceneRootRef.current?.destroy({ children: true });
        sceneRootRef.current = mapRoot;
        nodeViewsRef.current = new Map();
        spineDataRef.current = new Map();
        world.addChild(mapRoot);
        if (spinePlaybackTickerRef.current !== null) {
          application.ticker.remove(spinePlaybackTickerRef.current);
          spinePlaybackTickerRef.current = null;
        }

        if (!cameraFittedRef.current || profileChanged || viewportChanged || viewModeChanged) {
          cameraFittedRef.current = true;
          fitCameraRef.current?.();
        }
      }).catch((error: unknown) => {
        console.error("Unable to rebuild the map view.", error);
      });

      return () => {
        cancelled = true;
      };
    }

    const viewport = scene.layout.referenceViewports[activeProfile];
    const viewportChanged = viewportRef.current?.width !== viewport.width || viewportRef.current?.height !== viewport.height;
    viewportRef.current = { width: viewport.width, height: viewport.height };
    // У пресета нет собственного viewport, поэтому рамка reference viewport в режиме его редактирования не рисуется.
    const artboard = artboardRef.current?.clear();
    if (editingPrefabName === null) artboard?.rect(0, 0, viewport.width, viewport.height).fill(ARTBOARD_FILL).stroke({ width: 2, color: ARTBOARD_BORDER });

    void Promise.all([loadEditorSceneTextures(effectDocument, sceneId), loadEditorSceneSpines(effectDocument, sceneId)]).then(([textures, spines]) => {
      if (cancelled) return;

      // Пока грузились ассеты, могли пройти нестуктурные коммиты — строим по самому свежему документу.
      const buildDocument = documentRef.current;
      const builtScene = buildDocument.scenes.find((candidate) => candidate.id === sceneId);
      if (builtScene === undefined) return;
      const { root, nodeViews } = buildSceneView(buildDocument, sceneId, activeProfile, textures, spines);
      const technicalRootNodeId = editingPrefabName === null ? getSceneRoot(builtScene)?.id : undefined;
      for (const [nodeId, nodeView] of nodeViews) {
        if (nodeId === technicalRootNodeId) {
          nodeView.eventMode = "passive";
          continue;
        }
        nodeView.eventMode = "static";
        nodeView.on("pointerdown", (event) => {
          if (event.button !== 0) return;
          if (useEditorStore.getState().activeTool === "pan") return;
          event.stopPropagation();
          const state = useEditorStore.getState();
          if (event.shiftKey) {
            state.selectNode(nodeId, true);
            return;
          }
          if (!state.selectedNodeIds.includes(nodeId)) state.selectNode(nodeId);
          startDragRef.current?.(nodeId, event);
        });
      }

      sceneRootRef.current?.destroy({ children: true });
      sceneRootRef.current = root;
      nodeViewsRef.current = nodeViews;
      spineDataRef.current = spines;
      world.addChild(root);
      const playbackState = useEditorStore.getState();
      for (const node of builtScene.nodes) {
        if (node.type !== "spine") continue;
        const view = nodeViews.get(node.id);
        if (view !== undefined) setSpineViewAutoplay(view, playbackState.spineAutoplay[node.id] ?? true);
      }

      if (spinePlaybackTickerRef.current !== null) application.ticker.remove(spinePlaybackTickerRef.current);
      const reportSpinePlayback = () => {
        const state = useEditorStore.getState();
        const nodeId = state.selectedNodeId;
        const node = getEditingTarget(state.document, state)?.nodes.find((candidate) => candidate.id === nodeId);
        if (node?.type !== "spine" || node.animation === undefined) return;
        const view = nodeViews.get(node.id);
        const spineData = spines.get(node.assetId);
        if (view === undefined || spineData === undefined) return;
        const playback = getSpineViewPlayback(view, spineData, node.animation);
        if (playback !== undefined) state.reportSpinePlaybackFrame(node.id, playback);
      };
      spinePlaybackTickerRef.current = reportSpinePlayback;
      application.ticker.add(reportSpinePlayback);

      if (!cameraFittedRef.current || profileChanged || viewportChanged || viewModeChanged) {
        cameraFittedRef.current = true;
        fitCameraRef.current?.();
      }
    }).catch((error: unknown) => {
      console.error(`Unable to rebuild scene '${sceneId}'.`, error);
    });

    return () => {
      cancelled = true;
    };
  }, [activeProfile, application, editingPrefabName, sceneId, structuralKey, viewMode]);

  // Нестуктурные изменения документа (transform, visibility, text) применяются к живым view без пересборки сцены.
  useEffect(() => {
    if (application === null || viewMode !== "single") return;
    const scene = document.scenes.find((candidate) => candidate.id === sceneId);
    if (scene === undefined) return;

    for (const node of scene.nodes) {
      const view = nodeViewsRef.current.get(node.id);
      if (view === undefined || view.destroyed) continue;
      updateNodeView(view, node, activeProfile);
    }
    redrawSelectionRef.current();
  }, [activeProfile, application, document, sceneId, viewMode]);

  useEffect(() => {
    if (spineFrameRequest === undefined || selectedNodeId === null) return;
    const node = document.scenes.find((scene) => scene.id === sceneId)?.nodes.find((candidate) => candidate.id === selectedNodeId);
    if (node?.type !== "spine" || node.animation === undefined) return;
    const view = nodeViewsRef.current.get(node.id);
    const spineData = spineDataRef.current.get(node.assetId);
    if (view !== undefined && spineData !== undefined) setSpineViewFrame(view, spineFrameRequest, spineData, node.animation);
  }, [application, document, sceneId, selectedNodeId, spineFrameRequest]);

  useEffect(() => {
    if (selectedNodeId === null) return;
    const node = document.scenes.find((scene) => scene.id === sceneId)?.nodes.find((candidate) => candidate.id === selectedNodeId);
    if (node?.type === "spine") {
      const view = nodeViewsRef.current.get(node.id);
      if (view !== undefined) setSpineViewAutoplay(view, spineAutoplay);
    }
  }, [document, sceneId, selectedNodeId, spineAutoplay]);

  useEffect(() => {
    redrawSelectionRef.current();
  }, [activeProfile, activeTool, application, document, sceneId, selectedNodeId, selectedNodeIds]);

  const toWorldPosition = (event: React.DragEvent<HTMLDivElement>) => {
    const world = worldRef.current;
    const host = hostRef.current;
    if (world === null || host === null) return undefined;
    const rect = host.getBoundingClientRect();
    return {
      x: roundTransformValue((event.clientX - rect.left - world.position.x) / world.scale.x),
      y: roundTransformValue((event.clientY - rect.top - world.position.y) / world.scale.y),
    };
  };
  const isAssetDrag = (event: React.DragEvent<HTMLDivElement>) => viewMode === "single" && Array.from(event.dataTransfer.types).includes("application/x-pixi-ui-editor-asset");
  const isPrefabDrag = (event: React.DragEvent<HTMLDivElement>) => viewMode === "single" && editingPrefabName === null && Array.from(event.dataTransfer.types).includes(PREFAB_DRAG_TYPE);
  const drop = (event: React.DragEvent<HTMLDivElement>) => {
    if (isAssetDrag(event)) {
      event.preventDefault();
      const assetId = event.dataTransfer.getData("application/x-pixi-ui-editor-asset");
      const position = toWorldPosition(event);
      if (document.assets.some((candidate) => candidate.id === assetId) && position !== undefined) addNodeFromAsset(assetId, position);
      return;
    }
    if (!isPrefabDrag(event)) return;
    event.preventDefault();
    const prefabId = event.dataTransfer.getData(PREFAB_DRAG_TYPE);
    const position = toWorldPosition(event);
    if (document.prefabs.some((candidate) => candidate.id === prefabId) && position !== undefined) addPrefabInstance(prefabId, position);
  };

  return (
    <div ref={hostRef} className={`scene-canvas${activeTool === "pan" ? " scene-canvas-pan" : ""}`} onDragOver={(event) => { if (isAssetDrag(event) || isPrefabDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={drop}>
      <ToolPanel activeTool={activeTool} viewMode={viewMode} />
      <div className="canvas-bottom-toolbar" role="toolbar" aria-label="Canvas tools">
        <button
          type="button"
          className="canvas-orientation-button"
          aria-label={`Switch to ${activeProfile === "desktop" ? "Vertical" : "Horizontal"}`}
          title={`Switch to ${activeProfile === "desktop" ? "Vertical" : "Horizontal"}`}
          onClick={() => setActiveProfile(activeProfile === "desktop" ? "mobile" : "desktop")}
        >
          ⟳
        </button>
        <span className="canvas-toolbar-divider" aria-hidden="true" />
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("container")}>+ Container</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("image")}>+ Image</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("text")}>+ Text</button>
        <button type="button" disabled={viewMode === "map" || !document.assets.some((asset) => asset.type === "spine")} onClick={() => addNode("spine")}>+ Spine</button>
        <button type="button" className="toolbar-danger" disabled={deleteDisabled} title={commandTitle(EDITOR_COMMAND_IDS.deleteNode)} onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.deleteNode)}>Delete</button>
      </div>
      {editingPrefabName !== null && <div className="preset-editing-status">
        <span>Editing preset: {editingPrefabName}</span>
        <button type="button" onClick={finishEditingPrefab}>Done</button>
      </div>}
      <div className="canvas-hud">
        <button type="button" onClick={() => fitCameraRef.current?.()}>Fit</button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}

function ToolPanel({ activeTool, viewMode }: { activeTool: EditorTool; viewMode: ViewMode }) {
  const tools: readonly { tool: EditorTool; commandId: EditorCommandId; icon: ReactNode }[] = [
    { tool: "pan", commandId: EDITOR_COMMAND_IDS.panTool, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5M7 7l5-4 5 4M7 17l5 4 5-4" /></svg> },
    { tool: "select", commandId: EDITOR_COMMAND_IDS.selectTool, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l13 8-6 2-2 6L5 3Z" /></svg> },
    { tool: "resize", commandId: EDITOR_COMMAND_IDS.resizeTool, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4M8 8h8v8H8z" /></svg> },
  ];

  return (
    <div className="canvas-tool-mode-group" role="group" aria-label="Viewport tools">
      {tools.map(({ tool, commandId, icon }) => (
        <button
          key={tool}
          type="button"
          className={`tool-panel-button${activeTool === tool ? " tool-panel-button-active" : ""}`}
          title={commandTitle(commandId)}
          aria-label={commandTitle(commandId)}
          aria-pressed={activeTool === tool}
          disabled={!editorCommandRegistry.isEnabled(commandId)}
          onClick={() => editorCommandRegistry.execute(commandId)}
        >
          {icon}
        </button>
      ))}
      <button
        type="button"
        className={`tool-panel-button${viewMode === "map" ? " tool-panel-button-active" : ""}`}
        title={commandTitle(EDITOR_COMMAND_IDS.toggleMap)}
        aria-label={commandTitle(EDITOR_COMMAND_IDS.toggleMap)}
        aria-pressed={viewMode === "map"}
        onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.toggleMap)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7v6H3zM14 5h7v9h-7zM3 14h7v5H3zM14 17h7v2h-7z" /></svg>
      </button>
    </div>
  );
}

function commandTitle(commandId: EditorCommandId): string {
  const title = editorCommandRegistry.getTitle(commandId);
  const shortcut = editorCommandRegistry.getShortcutLabel(commandId);
  return shortcut === undefined ? title : `${title} (${shortcut})`;
}

export function App() {
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const activeTool = useEditorStore((state) => state.activeTool);
  const viewMode = useEditorStore((state) => state.viewMode);
  const setActiveProfile = useEditorStore((state) => state.setActiveProfile);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const spineFrameRequest = useEditorStore((state) => selectedNodeId === null ? undefined : state.spineFrameRequests[selectedNodeId]);
  const spineAutoplay = useEditorStore((state) => selectedNodeId === null ? true : state.spineAutoplay[selectedNodeId] ?? true);
  const addNode = useEditorStore((state) => state.addNode);
  const addNodeFromAsset = useEditorStore((state) => state.addNodeFromAsset);
  const addPrefabInstance = useEditorStore((state) => state.addPrefabInstance);
  const updateReferenceViewport = useEditorStore((state) => state.updateReferenceViewport);
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);
  const setEditingPrefabId = useEditorStore((state) => state.setEditingPrefabId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditorTextInput(event.target)) return;
      if (editorCommandRegistry.dispatchKeyboardEvent(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  const editingPrefab = document.prefabs.find((candidate) => candidate.id === editingPrefabId);

  // В режиме редактирования canvas рендерит содержимое пресета как синтетическую сцену того же документа.
  const renderDocument = useMemo<ProjectDocument | undefined>(() => {
    if (scene === undefined) return undefined;
    if (editingPrefab === undefined) return document;
    return {
      ...document,
      scenes: [{ id: editingPrefab.id, name: editingPrefab.name, rootNodeIds: editingPrefab.rootNodeIds, nodes: editingPrefab.nodes, layout: scene.layout }],
    };
  }, [document, editingPrefab, scene]);

  const assetsWindowOpen = useUiPrefsStore((state) => state.assetsWindowOpen);
  const setAssetsWindowOpen = useUiPrefsStore((state) => state.setAssetsWindowOpen);
  const presetsWindowOpen = useUiPrefsStore((state) => state.presetsWindowOpen);
  const setPresetsWindowOpen = useUiPrefsStore((state) => state.setPresetsWindowOpen);

  if (scene === undefined || renderDocument === undefined) return <main className="load-error">Selected scene does not exist in the project document.</main>;

  const owner = editingPrefab ?? scene;
  const implicitRootNodeId = editingPrefab === undefined ? getSceneRoot(scene)?.id : undefined;
  const selectedSceneNode = owner.nodes.find((node) => node.id === selectedNodeId);
  const selectedPrefabNode = editingPrefab === undefined && selectedSceneNode === undefined
    ? document.prefabs.flatMap((prefab) => prefab.nodes).find((node) => node.id === selectedNodeId)
    : undefined;
  const selectedNode = selectedSceneNode ?? selectedPrefabNode;
  const selectedNodeIsPresetContent = selectedPrefabNode !== undefined;
  const deleteDisabled = !editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.deleteNode);
  const viewport = scene.layout.referenceViewports[activeProfile];

  return (
    <main className="editor-shell">
      <header className="toolbar">
        <strong>Pixi UI Editor</strong>
        <ScreenResolutionsMenu activeProfile={activeProfile} viewport={viewport} setActiveProfile={setActiveProfile} updateReferenceViewport={updateReferenceViewport} />
        <span>{document.project.name}</span>
        <div className="toolbar-actions">
          <button type="button" onClick={() => { void downloadProjectPackage(document, resolveFileUrl); }}>Export</button>
        </div>
      </header>
      <aside className="panel hierarchy-panel">
        <h1>Hierarchy</h1>
        <WindowsSection document={document} sceneId={editingPrefab === undefined ? sceneId : null} editingPrefab={editingPrefab !== undefined} />
        <HierarchyTree owner={owner} prefabs={document.prefabs} selectedNodeIds={selectedNodeIds} implicitRootNodeId={implicitRootNodeId} />
        <div className="hierarchy-assets-action">
          <button type="button" className={`assets-window-trigger${assetsWindowOpen ? " screen-resolutions-trigger-open" : ""}`} aria-pressed={assetsWindowOpen} onClick={() => setAssetsWindowOpen(!assetsWindowOpen)}>Assets</button>
          <button type="button" className={`assets-window-trigger${presetsWindowOpen ? " screen-resolutions-trigger-open" : ""}`} aria-pressed={presetsWindowOpen} onClick={() => setPresetsWindowOpen(!presetsWindowOpen)}>Presets</button>
        </div>
      </aside>
      <section className="canvas-panel"><SceneCanvas document={renderDocument} sceneId={editingPrefab?.id ?? sceneId} activeProfile={activeProfile} activeTool={activeTool} viewMode={viewMode} selectedNodeIds={selectedNodeIds} selectedNodeId={selectedNodeId} editingPrefabName={editingPrefab?.name ?? null} spineFrameRequest={spineFrameRequest} spineAutoplay={spineAutoplay} deleteDisabled={deleteDisabled} setActiveProfile={setActiveProfile} addNode={addNode} addNodeFromAsset={addNodeFromAsset} addPrefabInstance={addPrefabInstance} finishEditingPrefab={() => setEditingPrefabId(null)} />{assetsWindowOpen && <AssetsWindow />}{presetsWindowOpen && <PresetsWindow />}</section>
      <aside className="panel inspector-panel"><h1>Inspector</h1><Inspector selectedNode={selectedNode} readOnly={selectedNodeIsPresetContent} /></aside>
    </main>
  );
}
