import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildSceneView } from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import { Application, Container, Graphics, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { useEditorStore } from "./store.js";
import { Inspector } from "./Inspector.js";

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
          style={{ paddingInlineStart: `${depth * 20 + 12}px` }}
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
  const sceneRootRef = useRef<Container | null>(null);
  const nodeViewsRef = useRef<Map<string, Container>>(new Map());
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    parentView: Container;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const startDragRef = useRef<((nodeId: string, nodeView: Container, event: FederatedPointerEvent) => void) | null>(null);
  const [application, setApplication] = useState<Application | null>(null);

  useEffect(() => {
    const application = new Application();
    let cancelled = false;
    let initialized = false;

    void application.init({ background: 0x1e1e2e, resizeTo: hostRef.current! }).then(() => {
      initialized = true;
      if (cancelled) {
        application.destroy(true);
        return;
      }

      hostRef.current?.appendChild(application.canvas);
      const overlay = new Container();
      const selectionGraphics = new Graphics();
      overlay.eventMode = "none";
      overlay.addChild(selectionGraphics);
      application.stage.eventMode = "static";
      application.stage.hitArea = new Rectangle(0, 0, application.screen.width, application.screen.height);
      application.stage.on("pointerdown", () => useEditorStore.getState().selectNode(null));

      const stopDrag = () => {
        dragRef.current = null;
        application.stage.off("pointermove", moveDraggedNode);
        application.stage.off("pointerup", stopDrag);
        application.stage.off("pointerupoutside", stopDrag);
      };
      const moveDraggedNode = (event: FederatedPointerEvent) => {
        const drag = dragRef.current;
        if (drag === null) return;

        const localPosition = drag.parentView.toLocal(event.global);
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

      const startDrag = (nodeId: string, nodeView: Container, event: FederatedPointerEvent) => {
        const parentView = nodeView.parent;
        if (parentView === null) return;

        const localPosition = parentView.toLocal(event.global);
        dragRef.current = {
          nodeId,
          parentView,
          offsetX: localPosition.x - nodeView.position.x,
          offsetY: localPosition.y - nodeView.position.y,
        };
        application.stage.on("pointermove", moveDraggedNode);
        application.stage.on("pointerup", stopDrag);
        application.stage.on("pointerupoutside", stopDrag);
      };
      startDragRef.current = startDrag;
      application.stage.addChild(overlay);
      selectionGraphicsRef.current = selectionGraphics;
      setApplication(application);
    });

    return () => {
      cancelled = true;
      sceneRootRef.current = null;
      nodeViewsRef.current = new Map();
      selectionGraphicsRef.current = null;
      if (initialized) application.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (application === null) return;

    const scene = document.scenes.find((candidate) => candidate.id === sceneId);
    if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

    const { root, nodeViews } = buildSceneView(document, sceneId, "desktop");
    for (const [nodeId, nodeView] of nodeViews) {
      nodeView.eventMode = "static";
      nodeView.on("pointerdown", (event) => {
        event.stopPropagation();
        useEditorStore.getState().selectNode(nodeId);
        startDragRef.current?.(nodeId, nodeView, event);
      });
    }

    sceneRootRef.current?.destroy({ children: true });
    sceneRootRef.current = root;
    nodeViewsRef.current = nodeViews;
    application.stage.addChildAt(root, 0);

    const resizeScene = () => {
      const host = hostRef.current;
      if (host === null) return;

      const viewport = scene.layout.referenceViewports.desktop;
      const scale = Math.min(host.clientWidth / viewport.width, host.clientHeight / viewport.height);
      root.scale.set(scale);
      root.position.set((host.clientWidth - viewport.width * scale) / 2, (host.clientHeight - viewport.height * scale) / 2);
      application.stage.hitArea = new Rectangle(0, 0, application.screen.width, application.screen.height);
    };
    const observer = new ResizeObserver(resizeScene);
    observer.observe(hostRef.current!);
    resizeScene();

    return () => {
      observer.disconnect();
      root.destroy({ children: true });
      if (sceneRootRef.current === root) {
        sceneRootRef.current = null;
        nodeViewsRef.current = new Map();
      }
    };
  }, [application, document, sceneId]);

  useEffect(() => {
    const selectionGraphics = selectionGraphicsRef.current;
    if (selectionGraphics === null) return;

    selectionGraphics.clear();
    if (selectedNodeId === null) return;

    const selectedNodeView = nodeViewsRef.current.get(selectedNodeId);
    if (selectedNodeView === undefined) return;

    const bounds = selectedNodeView.getBounds();
    selectionGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({ width: 2, color: 0xfacc15 });
  }, [application, document, sceneId, selectedNodeId]);

  return <div ref={hostRef} className="scene-canvas" />;
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
          <button type="button" disabled={deleteDisabled} onClick={() => selectedNodeId !== null && deleteNode(selectedNodeId)}>Delete</button>
          <button type="button" onClick={resetToSample}>Reset to sample</button>
        </div>
      </header>
      <aside className="panel hierarchy-panel"><h1>Hierarchy</h1><HierarchyTree scene={scene} selectedNodeId={selectedNodeId} /></aside>
      <section className="canvas-panel"><SceneCanvas document={document} sceneId={sceneId} selectedNodeId={selectedNodeId} /></section>
      <aside className="panel inspector-panel"><h1>Inspector</h1><Inspector selectedNode={selectedNode} /></aside>
    </main>
  );
}
