import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../store/index.js";
import { NODE_DRAG_TYPE } from "../presets/PresetsPanel.js";
export type HierarchyDropMode = "before" | "inside" | "after";

export function HierarchyTree({ owner, prefabs, selectedNodeIds, implicitRootNodeId }: { owner: { rootNodeIds: string[]; nodes: UINode[] }; prefabs: ProjectDocument["prefabs"]; selectedNodeIds: string[]; implicitRootNodeId?: string }) {
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

  /** Preserves the on-screen top-to-bottom order of the tree, independent of click/selection order. */
  const buildTraversalOrder = (): Map<string, number> => {
    const order = new Map<string, number>();
    let counter = 0;
    const visit = (id: string): void => {
      const node = nodesById.get(id);
      if (node === undefined) return;
      order.set(id, counter++);
      node.children.forEach(visit);
    };
    visibleRootNodeIds.forEach(visit);
    return order;
  };

  /** When dragging a multi-selected node, moves the whole selection together; descendants of another selected node are dropped since moving their ancestor already carries them along. */
  const getDragSourceIds = (sourceId: string): string[] => {
    if (selectedNodeIds.length <= 1 || !selectedNodeIds.includes(sourceId)) return [sourceId];
    const candidateIds = selectedNodeIds.filter((id) => nodesById.has(id));
    const topLevelIds = candidateIds.filter((id) => !candidateIds.some((otherId) => otherId !== id && isDescendantOf(id, otherId)));
    const order = buildTraversalOrder();
    return topLevelIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  };

  const dropOnNode = (event: DragEvent<HTMLButtonElement>, targetNode: UINode, mode: HierarchyDropMode): void => {
    const sourceId = event.dataTransfer.getData(NODE_DRAG_TYPE) || draggedNodeId;
    if (sourceId === null) return;
    const sourceIds = getDragSourceIds(sourceId);
    if (sourceIds.length === 0 || !sourceIds.every((id) => canDrop(id, targetNode, mode))) return;
    event.preventDefault();
    event.stopPropagation();

    if (mode === "inside") {
      const baseIndex = targetNode.children.length;
      sourceIds.forEach((id, offset) => moveNode(id, { parentId: targetNode.id, index: baseIndex + offset }));
    } else {
      const siblings = targetNode.parentId === null
        ? owner.rootNodeIds
        : nodesById.get(targetNode.parentId)?.children ?? [];
      const targetIndex = siblings.indexOf(targetNode.id);
      const baseIndex = targetIndex + (mode === "after" ? 1 : 0);
      sourceIds.forEach((id, offset) => moveNode(id, { parentId: targetNode.parentId, index: baseIndex + offset }));
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
            if (sourceId === null) return;
            event.preventDefault();
            event.stopPropagation();
            const sourceIds = getDragSourceIds(sourceId);
            const baseIndex = implicitRoot?.children.length ?? owner.rootNodeIds.length;
            sourceIds.forEach((id, offset) => moveNode(id, {
              parentId: implicitRoot?.id ?? null,
              index: baseIndex + offset,
            }));
            finishDrag();
          }}
        >
          Move to top level
        </li>
      )}
    </ul>
  );
}
