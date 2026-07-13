import type { ReactNode } from "react";
import { loadProjectDocument } from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument, UINode } from "@pixi-ui-editor/schema";
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
      <section className="canvas-placeholder">Canvas (will appear in TASK-005)</section>
      <aside className="panel inspector-panel">
        <h1>Inspector</h1>
        <p>Select a node</p>
      </aside>
    </main>
  );
}
