import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildSceneView } from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import { Application, Container, Graphics, type FederatedPointerEvent } from "pixi.js";
import { useEditorStore } from "./store.js";
import { Inspector } from "./Inspector.js";

const CANVAS_BACKGROUND = 0x181818;
const ARTBOARD_FILL = 0x1e1e2e;
const ARTBOARD_BORDER = 0x3c3c50;
const SELECTION_COLOR = 0x4c9aff;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

function HierarchyTree({ scene, selectedNodeId }: { scene: ProjectDocument["scenes"][number]; selectedNodeId: string | null }) {
  const selectNode = useEditorStore((state) => state.selectNode);
  const nodesById = new Map<string, UINode>(scene.nodes.map((node) => [node.id, node]));

  const renderNode = (nodeId: string, depth: number): ReactNode => {
    const node = nodesById.get(nodeId);
    if (node === undefined) return null;

    return (
      <li key={node.id}>
        <button
          type="button"
          className={`tree-node${node.id === selectedNodeId ? " tree-node-selected" : ""}`}
          style={{ paddingInlineStart: `${depth * 16 + 12}px` }}
          onClick={() => selectNode(node.id)}
        >
          {node.name} <span>({node.type})</span>
        </button>
        {node.children.length > 0 && <ul>{node.children.map((childId) => renderNode(childId, depth + 1))}</ul>}
      </li>
    );
  };

  return <ul className="tree">{scene.rootNodeIds.map((nodeId) => renderNode(nodeId, 0))}</ul>;
}

function SceneCanvas({ document, sceneId, selectedNodeId }: { document: ProjectDocument; sceneId: string; selectedNodeId: string | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<Container | null>(null);
  const artboardRef = useRef<Graphics | null>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const nodeViewsRef = useRef<Map<string, Container>>(new Map());
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const viewportRef = useRef<{ width: number; height: number } | null>(null);
  const cameraFittedRef = useRef(false);
  const fitCameraRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const startDragRef = useRef<((nodeId: string, nodeView: Container, event: FederatedPointerEvent) => void) | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [zoom, setZoom] = useState(1);

  const redrawSelectionRef = useRef<() => void>(() => {
    const selectionGraphics = selectionGraphicsRef.current;
    if (selectionGraphics === null) return;

    selectionGraphics.clear();
    const nodeId = useEditorStore.getState().selectedNodeId;
    if (nodeId === null) return;

    const nodeView = nodeViewsRef.current.get(nodeId);
    if (nodeView === undefined || nodeView.destroyed) return;

    const bounds = nodeView.getBounds();
    selectionGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({ width: 1.5, color: SELECTION_COLOR });
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
      application.stage.addChild(world, overlay);
      application.stage.eventMode = "static";
      application.stage.hitArea = application.screen;
      application.stage.on("pointerdown", (event) => {
        if (event.button === 0) useEditorStore.getState().selectNode(null);
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
        if (event.button !== 1) return;
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
        canvas.style.cursor = "";
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
        dragRef.current = null;
        application.stage.off("pointermove", moveDraggedNode);
        application.stage.off("pointerup", stopDrag);
        application.stage.off("pointerupoutside", stopDrag);
      };
      const moveDraggedNode = (event: FederatedPointerEvent) => {
        const drag = dragRef.current;
        if (drag === null) return;

        // Сцена пересобирается при каждом изменении документа, поэтому view ищем заново.
        const nodeView = nodeViewsRef.current.get(drag.nodeId);
        const parentView = nodeView?.parent;
        if (nodeView === undefined || nodeView.destroyed || parentView === null || parentView === undefined) return;

        const localPosition = parentView.toLocal(event.global);
        const node = useEditorStore.getState().document.scenes
          .find((candidate) => candidate.id === sceneId)?.nodes.find((candidate) => candidate.id === drag.nodeId);
        if (node === undefined) return;

        useEditorStore.getState().updateNode(drag.nodeId, {
          transform: {
            ...node.transform,
            x: Math.round((localPosition.x - drag.offsetX) * 100) / 100,
            y: Math.round((localPosition.y - drag.offsetY) * 100) / 100,
          },
        });
      };
      startDragRef.current = (nodeId, nodeView, event) => {
        const parentView = nodeView.parent;
        if (parentView === null) return;

        const localPosition = parentView.toLocal(event.global);
        dragRef.current = {
          nodeId,
          offsetX: localPosition.x - nodeView.position.x,
          offsetY: localPosition.y - nodeView.position.y,
        };
        application.stage.on("pointermove", moveDraggedNode);
        application.stage.on("pointerup", stopDrag);
        application.stage.on("pointerupoutside", stopDrag);
      };

      worldRef.current = world;
      artboardRef.current = artboard;
      selectionGraphicsRef.current = selectionGraphics;
      setApplication(application);
    });

    return () => {
      cancelled = true;
      removeDomListeners?.();
      worldRef.current = null;
      artboardRef.current = null;
      sceneRootRef.current = null;
      nodeViewsRef.current = new Map();
      selectionGraphicsRef.current = null;
      fitCameraRef.current = null;
      cameraFittedRef.current = false;
      if (initialized) application.destroy(true);
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    if (application === null || world === null) return;

    const scene = document.scenes.find((candidate) => candidate.id === sceneId);
    if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

    const viewport = scene.layout.referenceViewports.desktop;
    viewportRef.current = { width: viewport.width, height: viewport.height };
    artboardRef.current?.clear().rect(0, 0, viewport.width, viewport.height).fill(ARTBOARD_FILL).stroke({ width: 2, color: ARTBOARD_BORDER });

    const { root, nodeViews } = buildSceneView(document, sceneId, "desktop");
    for (const [nodeId, nodeView] of nodeViews) {
      nodeView.eventMode = "static";
      nodeView.on("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        useEditorStore.getState().selectNode(nodeId);
        startDragRef.current?.(nodeId, nodeView, event);
      });
    }

    sceneRootRef.current?.destroy({ children: true });
    sceneRootRef.current = root;
    nodeViewsRef.current = nodeViews;
    world.addChild(root);

    if (!cameraFittedRef.current) {
      cameraFittedRef.current = true;
      fitCameraRef.current?.();
    }

    return () => {
      root.destroy({ children: true });
      if (sceneRootRef.current === root) {
        sceneRootRef.current = null;
        nodeViewsRef.current = new Map();
      }
    };
  }, [application, document, sceneId]);

  useEffect(() => {
    redrawSelectionRef.current();
  }, [application, document, sceneId, selectedNodeId]);

  return (
    <div ref={hostRef} className="scene-canvas">
      <div className="canvas-hud">
        <button type="button" onClick={() => fitCameraRef.current?.()}>Fit</button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}

export function App() {
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const addNode = useEditorStore((state) => state.addNode);
  const deleteNode = useEditorStore((state) => state.deleteNode);
  const resetToSample = useEditorStore((state) => state.resetToSample);
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);

  if (scene === undefined) return <main className="load-error">Selected scene does not exist in the project document.</main>;

  const selectedNode = scene.nodes.find((node) => node.id === selectedNodeId);
  const deleteDisabled = selectedNode === undefined || (selectedNode.parentId === null && scene.rootNodeIds.length === 1);

  return (
    <main className="editor-shell">
      <header className="toolbar">
        <strong>Pixi UI Editor</strong><span>{document.project.name}</span>
        <div className="toolbar-actions">
          <button type="button" onClick={() => addNode("container")}>+ Container</button>
          <button type="button" onClick={() => addNode("image")}>+ Image</button>
          <button type="button" onClick={() => addNode("text")}>+ Text</button>
          <button type="button" className="toolbar-danger" disabled={deleteDisabled} onClick={() => selectedNodeId !== null && deleteNode(selectedNodeId)}>Delete</button>
          <button type="button" onClick={resetToSample}>Reset to sample</button>
        </div>
      </header>
      <aside className="panel hierarchy-panel"><h1>Hierarchy</h1><HierarchyTree scene={scene} selectedNodeId={selectedNodeId} /></aside>
      <section className="canvas-panel"><SceneCanvas document={document} sceneId={sceneId} selectedNodeId={selectedNodeId} /></section>
      <aside className="panel inspector-panel"><h1>Inspector</h1><Inspector selectedNode={selectedNode} /></aside>
    </main>
  );
}
