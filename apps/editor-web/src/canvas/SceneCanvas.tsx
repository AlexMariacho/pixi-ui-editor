import { useEffect, useMemo, useRef, useState } from "react";
import { buildSceneView, collectNodeAssetIds, collectRenderedNodes, getSpineViewPlayback, NodeView, previewNodeView, resolveAnchoredTransform, resolveProfileTransform, setButtonViewState, setSpineViewAutoplay, setSpineViewFrame, updateNodeView, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import { isPositionManagingContainer, type ButtonStateKey, type LayoutProfileId, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { Application, Container, Graphics, Text as PixiText, type FederatedPointerEvent, type Texture } from "pixi.js";
import { getEditingTarget, getSceneRoot, useEditorStore, type AddableNodeType, type EditorTool, type ViewMode } from "../store/index.js";
import { loadEditorImageAssetSize, loadEditorSceneFonts, loadEditorSceneSpines, loadEditorSceneTextures, loadEditorSpineAssetSize } from "../shared/assets.js";
import { PREFAB_DRAG_TYPE } from "../panels/presets/PresetsPanel.js";
import { EDITOR_COMMAND_IDS, editorCommandRegistry } from "../shared/editorCommands.js";
import { selectionBounds, getParentLayoutSize } from "./bounds.js";
import { ANCHOR_GIZMO_GAP, ANCHOR_GIZMO_HALF_WIDTH, ANCHOR_GIZMO_LENGTH, ARTBOARD_BORDER, ARTBOARD_FILL, CANVAS_BACKGROUND, PIVOT_GIZMO_HALF_SIZE, PIVOT_GIZMO_THICKNESS, RESIZE_HANDLES, SELECTION_COLOR, drawAnchorPetal, type ResizeHandle } from "./gizmos.js";
import { ToolPanel, commandTitle } from "../panels/toolbar/ToolPanel.js";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const roundTransformValue = (value: number) => Math.round(value * 100) / 100;
// Структурный ключ сцены: Pixi-дерево пересобирается, только когда меняется он.
// Transform, visibility и text не входят в ключ — они применяются к живым view через updateNodeView.
function nodeStructure(node: UINode): unknown[] {
  switch (node.type) {
    case "image":
      return [node.id, node.parentId, node.children, node.type];
    case "spine":
      return [node.id, node.parentId, node.children, node.type, node.assetId, node.animation, node.loop];
    case "prefab-instance":
      return [node.id, node.parentId, node.children, node.type, node.prefabId];
    case "scroll-view":
      // padding/itemSpacing/backgroundColor обновляются на живом view (ScrollViewNodeView.syncContent);
      // у @pixi/ui ScrollBox 2.3.2 нет безопасного публичного API для live-изменения этих полей.
      return [node.id, node.parentId, node.children, node.type, node.scrollView.direction, node.scrollView.cornerRadius, node.scrollView.easingEnabled, node.scrollView.shiftWheelHorizontal];
    case "input":
      // clipText включает internal mask у @pixi/ui Input только при (пере)присвоении bg, а безопасного
      // способа снять маску после этого нет — переключение пересобирает сцену, как и у scroll-view.
      return [node.id, node.parentId, node.children, node.type, node.clipText];
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


export function SceneCanvas({ document, sceneId, activeProfile, activeTool, viewMode, selectedNodeIds, selectedNodeId, editingPrefabName, spineFrameRequest, spineAutoplay, buttonPreviewState, deleteDisabled, setActiveProfile, addNode, addNodeFromAsset, addPrefabInstance, finishEditingPrefab }: {
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
  buttonPreviewState: ButtonStateKey | undefined;
  deleteDisabled: boolean;
  setActiveProfile: (profile: LayoutProfileId) => void;
  addNode: (type: AddableNodeType) => void;
  addNodeFromAsset: (assetId: string, position: { x: number; y: number }) => void;
  addPrefabInstance: (prefabId: string, position: { x: number; y: number }) => void;
  finishEditingPrefab: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<Container | null>(null);
  const artboardRef = useRef<Graphics | null>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const nodeViewsRef = useRef<Map<string, Container>>(new Map());
  const texturesRef = useRef<Map<string, Texture>>(new Map());
  const fontsRef = useRef<Map<string, string>>(new Map());
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
      anchorOffsetX: number;
      anchorOffsetY: number;
    }[];
  } | null>(null);
  const resizeDragRef = useRef<{
    handle: ResizeHandle;
    nodeId: string;
    startX: number;
    startY: number;
    // Rendered-трансформ (якоря уже применены); при коммите офсеты и stretch-дельта вычитаются обратно.
    transform: UINode["transform"];
    anchorOffsetX: number;
    anchorOffsetY: number;
    spanWidth: number;
    spanHeight: number;
    scaleX: number;
    scaleY: number;
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
  const renderedAssetReferencesKey = useMemo(() => {
    const scene = document.scenes.find((candidate) => candidate.id === sceneId);
    return scene === undefined ? "[]" : JSON.stringify(collectRenderedNodes(document, scene).map((node) => [node.id, collectNodeAssetIds(node)]));
  }, [document, sceneId]);

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
      const bounds = selectionBounds(node, nodeViewsRef.current);
      if (bounds === undefined) return [];
      selectionGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({ width: 1.5, color: SELECTION_COLOR });
      const { transform } = resolveProfileTransform(node, editorState.activeProfile);
      const parentSize = getParentLayoutSize(owner, node, editorState.activeProfile);
      const resolvedTransform = resolveAnchoredTransform(transform, parentSize);
      const managedByLayout = node.parentId !== null && isPositionManagingContainer(nodesById.get(node.parentId) ?? node);
      const logicalSize = nodeView instanceof NodeView ? nodeView.layoutRectangle : resolvedTransform;
      const pivot = nodeView.toGlobal({
        x: (resolvedTransform.pivotX ?? 0) * logicalSize.width,
        y: (resolvedTransform.pivotY ?? 0) * logicalSize.height,
      });
      selectionGraphics
        .rect(pivot.x - PIVOT_GIZMO_HALF_SIZE, pivot.y - PIVOT_GIZMO_THICKNESS / 2, PIVOT_GIZMO_HALF_SIZE * 2, PIVOT_GIZMO_THICKNESS)
        .rect(pivot.x - PIVOT_GIZMO_THICKNESS / 2, pivot.y - PIVOT_GIZMO_HALF_SIZE, PIVOT_GIZMO_THICKNESS, PIVOT_GIZMO_HALF_SIZE * 2)
        .fill(0xffffff);
      const parentView = nodeView.parent;
      if (!managedByLayout && parentView !== null && parentSize !== undefined) {
        const anchorMinX = transform.anchorMinX ?? 0;
        const anchorMinY = transform.anchorMinY ?? 0;
        const anchorMaxX = transform.anchorMaxX ?? anchorMinX;
        const anchorMaxY = transform.anchorMaxY ?? anchorMinY;
        for (const [anchorX, anchorY, dirX, dirY] of [
          [anchorMinX, anchorMinY, -1, -1],
          [anchorMaxX, anchorMinY, 1, -1],
          [anchorMinX, anchorMaxY, -1, 1],
          [anchorMaxX, anchorMaxY, 1, 1],
        ] as const) {
          const point = parentView.toGlobal({ x: anchorX * parentSize.width, y: anchorY * parentSize.height });
          drawAnchorPetal(selectionGraphics, point, dirX, dirY);
        }
      }
      return [{ node, nodeView, bounds }];
    });

    if (resizeHandles === null || selectedBounds.length !== 1) return;
    const [{ node, bounds }] = selectedBounds;
    if (node.parentId !== null && isPositionManagingContainer(nodesById.get(node.parentId) ?? node)) return;
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
        const selectedIds = owner?.nodes.flatMap((node) => {
          if (node.id === technicalRootId) return [];
          const bounds = selectionBounds(node, nodeViewsRef.current);
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
        // drag.x/y — это view.position (= anchor + transform + pivot), поэтому перед коммитом layout-офсеты вычитаем.
        const updates = drag.entries.flatMap((entry) => entry.x === entry.startX && entry.y === entry.startY
          ? []
          : [{ nodeId: entry.nodeId, patch: { x: entry.x - entry.anchorOffsetX, y: entry.y - entry.anchorOffsetY } }]);
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
          const node = nodesById.get(selectedId);
          if (node === undefined) return [];
          const transform = resolveProfileTransform(node, state.activeProfile).transform;
          const parentSize = getParentLayoutSize(owner, node, state.activeProfile);
          return [{
            nodeId: selectedId,
            pointerStartX: pointerStart.x,
            pointerStartY: pointerStart.y,
            startX: nodeView.position.x,
            startY: nodeView.position.y,
            x: nodeView.position.x,
            y: nodeView.position.y,
            anchorOffsetX: (transform.anchorMinX ?? 0) * (parentSize?.width ?? 0),
            anchorOffsetY: (transform.anchorMinY ?? 0) * (parentSize?.height ?? 0),
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
        if (Object.keys(drag.patch).length === 0) return;
        // patch посчитан в rendered-координатах — переводим обратно в хранимые (минус якорный офсет и stretch-дельта).
        const patch = { ...drag.patch };
        if (patch.x !== undefined) patch.x = roundTransformValue(patch.x - drag.anchorOffsetX);
        if (patch.y !== undefined) patch.y = roundTransformValue(patch.y - drag.anchorOffsetY);
        if (patch.width !== undefined) patch.width = roundTransformValue(patch.width - drag.spanWidth);
        if (patch.height !== undefined) patch.height = roundTransformValue(patch.height - drag.spanHeight);
        useEditorStore.getState().updateNodeProfileTransform(drag.nodeId, patch);
      };
      const moveResizedNode = (event: FederatedPointerEvent) => {
        const drag = resizeDragRef.current;
        if (drag === null) return;

        const nodeView = nodeViewsRef.current.get(drag.nodeId);
        const parentView = nodeView?.parent;
        const state = useEditorStore.getState();
        const node = getEditingTarget(state.document, state)?.nodes.find((candidate) => candidate.id === drag.nodeId);
        if (node === undefined || nodeView === undefined || nodeView.destroyed || parentView === null || parentView === undefined) return;

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
        if (nodeView instanceof NodeView) {
          previewNodeView(nodeView, node, state.activeProfile, { ...drag.transform, ...patch });
        }
        resizeDragRef.current = { ...drag, patch };
        redrawSelectionRef.current();
      };
      startResizeRef.current = (handle, event) => {
        const state = useEditorStore.getState();
        const nodeId = state.selectedNodeId;
        if (nodeId === null) return;
        const owner = getEditingTarget(state.document, state);
        const node = owner?.nodes.find((candidate) => candidate.id === nodeId);
        const nodeView = nodeViewsRef.current.get(nodeId);
        const parentView = nodeView?.parent;
        if (owner === undefined || node === undefined || nodeView === undefined || parentView === null || parentView === undefined) return;

        event.stopPropagation();
        const position = parentView.toLocal(event.global);
        const stored = resolveProfileTransform(node, state.activeProfile).transform;
        const transform = resolveAnchoredTransform(stored, getParentLayoutSize(owner, node, state.activeProfile));
        resizeDragRef.current = {
          handle,
          nodeId,
          startX: position.x,
          startY: position.y,
          transform: { ...transform },
          anchorOffsetX: transform.x - stored.x,
          anchorOffsetY: transform.y - stored.y,
          spanWidth: transform.width - stored.width,
          spanHeight: transform.height - stored.height,
          scaleX: nodeView.scale.x,
          scaleY: nodeView.scale.y,
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
        loadEditorSceneFonts(effectDocument, placement.scene.id),
      ]))).then((loadedScenes) => {
        if (cancelled) return;

        const mapRoot = new Container();
        placements.forEach((placement, index) => {
          const [textures, spines, fonts] = loadedScenes[index]!;
          const { root } = buildSceneView(effectDocument, placement.scene.id, activeProfile, { interaction: "authoring", textures, spines, fonts });
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

    void Promise.all([loadEditorSceneTextures(effectDocument, sceneId), loadEditorSceneSpines(effectDocument, sceneId), loadEditorSceneFonts(effectDocument, sceneId)]).then(([textures, spines, fonts]) => {
      if (cancelled) return;

      // Пока грузились ассеты, могли пройти нестуктурные коммиты — строим по самому свежему документу.
      const buildDocument = documentRef.current;
      const builtScene = buildDocument.scenes.find((candidate) => candidate.id === sceneId);
      if (builtScene === undefined) return;
      // Editor canvas — authoring-поверхность: контролы не перехватывают selection и drag.
      const { root, nodeViews } = buildSceneView(buildDocument, sceneId, activeProfile, { interaction: "authoring", textures, spines, fonts, onLayout: () => redrawSelectionRef.current() });
      const technicalRootNodeId = editingPrefabName === null ? getSceneRoot(builtScene)?.id : undefined;
      const builtNodes = new Map(builtScene.nodes.map((node) => [node.id, node]));
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
          const node = builtNodes.get(nodeId);
          if (node !== undefined && node.parentId !== null && isPositionManagingContainer(builtNodes.get(node.parentId) ?? node)) return;
          startDragRef.current?.(nodeId, event);
        });
      }

      sceneRootRef.current?.destroy({ children: true });
      sceneRootRef.current = root;
      nodeViewsRef.current = nodeViews;
      texturesRef.current = textures;
      fontsRef.current = fonts;
      spineDataRef.current = spines;
      world.addChild(root);
      const playbackState = useEditorStore.getState();
      for (const node of builtScene.nodes) {
        if (node.type === "button") {
          // Пересборка сцены создаёт новые views, поэтому transient preview state применяем заново.
          const buttonView = nodeViews.get(node.id);
          const previewState = playbackState.buttonPreviewStates[node.id];
          if (buttonView !== undefined && previewState !== undefined) setButtonViewState(buttonView, previewState);
          continue;
        }
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
    const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));

    for (const node of scene.nodes) {
      const view = nodeViewsRef.current.get(node.id);
      if (view === undefined || view.destroyed) continue;
      updateNodeView(view, node, activeProfile, getParentLayoutSize(scene, node, activeProfile), node.parentId === null ? undefined : nodesById.get(node.parentId));
    }
    redrawSelectionRef.current();
  }, [activeProfile, application, document, sceneId, viewMode]);

  // An asset newly assigned to any rendered node may not have been loaded yet. Add it to the
  // existing map and synchronize stable views in place instead of rebuilding the scene.
  useEffect(() => {
    if (application === null || viewMode !== "single") return;
    const textures = texturesRef.current;
    const fonts = fontsRef.current;
    let cancelled = false;

    void Promise.all([loadEditorSceneTextures(document, sceneId), loadEditorSceneFonts(document, sceneId)]).then(([loadedTextures, loadedFonts]) => {
      if (cancelled || texturesRef.current !== textures || fontsRef.current !== fonts) return;
      for (const [assetId, texture] of loadedTextures) textures.set(assetId, texture);
      for (const [assetId, family] of loadedFonts) fonts.set(assetId, family);

      const scene = document.scenes.find((candidate) => candidate.id === sceneId);
      if (scene === undefined) return;
      const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
      for (const node of scene.nodes) {
        const view = nodeViewsRef.current.get(node.id);
        if (view !== undefined && !view.destroyed) {
          updateNodeView(view, node, activeProfile, getParentLayoutSize(scene, node, activeProfile), node.parentId === null ? undefined : nodesById.get(node.parentId));
        }
      }
    }).catch((error: unknown) => {
      console.error(`Unable to load scene assets for '${sceneId}'.`, error);
    });

    return () => {
      cancelled = true;
    };
  }, [activeProfile, application, document, renderedAssetReferencesKey, sceneId, viewMode]);

  useEffect(() => {
    if (buttonPreviewState === undefined || selectedNodeId === null) return;
    const view = nodeViewsRef.current.get(selectedNodeId);
    if (view !== undefined) setButtonViewState(view, buttonPreviewState);
  }, [application, buttonPreviewState, selectedNodeId]);

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
      const asset = document.assets.find((candidate) => candidate.id === assetId);
      if (asset !== undefined && position !== undefined) {
        void (asset.type === "image" ? loadEditorImageAssetSize(asset) : loadEditorSpineAssetSize(asset))
          .catch((error) => console.warn(`Unable to load native size for asset '${asset.id}'.`, error))
          .finally(() => addNodeFromAsset(assetId, position));
      }
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
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("horizontal-layout")}>+ Horizontal Layout</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("vertical-layout")}>+ Vertical Layout</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("grid-layout")}>+ Grid Layout</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("scroll-view")}>+ Scroll View</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("image")}>+ Image</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("text")}>+ Text</button>
        <button type="button" disabled={viewMode === "map"} onClick={() => addNode("input")}>+ Input</button>
        <button type="button" disabled={viewMode === "map" || !document.assets.some((asset) => asset.type === "spine")} onClick={() => addNode("spine")}>+ Spine</button>
        <button type="button" disabled={viewMode === "map" || !document.assets.some((asset) => asset.type === "image")} onClick={() => addNode("button")}>+ Button</button>
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
