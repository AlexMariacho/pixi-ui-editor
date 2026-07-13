import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildSceneView, loadProjectDocument } from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import { Application, type Container } from "pixi.js";
import sampleJson from "../../../examples/sample-project/project.json";

function HierarchyTree({ scene }: { scene: ProjectDocument["scenes"][number] }) {
  const nodesById = new Map<string, UINode>(scene.nodes.map((node) => [node.id, node]));

  const renderNode = (nodeId: string, depth: number): ReactNode => {
    const node = nodesById.get(nodeId);

    if (node === undefined) {
      return null;
    }

    return (
      <li key={node.id}>
        <div className="tree-node" style={{ paddingInlineStart: `${depth * 20 + 12}px` }}>
          {node.name} <span>({node.type})</span>
        </div>
        {node.children.length > 0 && <ul>{node.children.map((childId) => renderNode(childId, depth + 1))}</ul>}
      </li>
    );
  };

  return <ul className="tree">{scene.rootNodeIds.map((nodeId) => renderNode(nodeId, 0))}</ul>;
}

function SceneCanvas({ document, sceneId }: { document: ProjectDocument; sceneId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const [application, setApplication] = useState<Application | null>(null);

  useEffect(() => {
    const application = new Application();
    let cancelled = false;

    void application.init({ background: 0x1e1e2e, resizeTo: hostRef.current! }).then(() => {
      if (cancelled) {
        application.destroy(true);
        return;
      }

      hostRef.current?.appendChild(application.canvas);
      setApplication(application);
    });

    return () => {
      cancelled = true;
      sceneRootRef.current = null;
      application.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (application === null) {
      return;
    }

    const scene = document.scenes.find((candidate) => candidate.id === sceneId);
    if (scene === undefined) {
      throw new Error(`Scene '${sceneId}' does not exist in the project document.`);
    }

    const { root } = buildSceneView(document, sceneId, "desktop");
    sceneRootRef.current?.destroy({ children: true });
    sceneRootRef.current = root;
    application.stage.addChild(root);

    const resizeScene = () => {
      const host = hostRef.current;
      if (host === null) {
        return;
      }

      const viewport = scene.layout.referenceViewports.desktop;
      const scale = Math.min(host.clientWidth / viewport.width, host.clientHeight / viewport.height);
      root.scale.set(scale);
      root.position.set((host.clientWidth - viewport.width * scale) / 2, (host.clientHeight - viewport.height * scale) / 2);
    };
    const observer = new ResizeObserver(resizeScene);
    observer.observe(hostRef.current!);
    resizeScene();

    return () => {
      observer.disconnect();
      root.destroy({ children: true });
      if (sceneRootRef.current === root) {
        sceneRootRef.current = null;
      }
    };
  }, [application, document, sceneId]);

  return <div ref={hostRef} className="scene-canvas" />;
}

export function App() {
  let document: ProjectDocument;

  try {
    document = loadProjectDocument(sampleJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return <main className="load-error">Unable to load sample project: {message}</main>;
  }

  return (
    <main className="editor-shell">
      <header className="toolbar">
        <strong>Pixi UI Editor</strong>
        <span>{document.project.name}</span>
      </header>
      <aside className="panel hierarchy-panel">
        <h1>Hierarchy</h1>
        <HierarchyTree scene={document.scenes[0]} />
      </aside>
      <section className="canvas-panel">
        <SceneCanvas document={document} sceneId={document.scenes[0]!.id} />
      </section>
      <aside className="panel inspector-panel">
        <h1>Inspector</h1>
        <p>Select a node</p>
      </aside>
    </main>
  );
}
