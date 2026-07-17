import { useState, type DragEvent } from "react";
import { useEditorStore } from "./store/index.js";
import { useUiPrefsStore } from "./uiPrefs.js";
import { FloatingWindow } from "./FloatingWindow.js";

export const NODE_DRAG_TYPE = "application/x-pixi-ui-editor-node";
export const PREFAB_DRAG_TYPE = "application/x-pixi-ui-editor-prefab";

export function PresetsPanel() {
  const prefabs = useEditorStore((state) => state.document.prefabs);
  const scenes = useEditorStore((state) => state.document.scenes);
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);
  const setEditingPrefabId = useEditorStore((state) => state.setEditingPrefabId);
  const createPrefabFromNode = useEditorStore((state) => state.createPrefabFromNode);
  const renamePrefab = useEditorStore((state) => state.renamePrefab);
  const deletePrefab = useEditorStore((state) => state.deletePrefab);
  const [renamingPrefabId, setRenamingPrefabId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [isDropActive, setIsDropActive] = useState(false);

  const instanceCount = (prefabId: string) => scenes.reduce(
    (count, scene) => count + scene.nodes.filter((node) => node.type === "prefab-instance" && node.prefabId === prefabId).length,
    0,
  );

  const isNodeDrag = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes(NODE_DRAG_TYPE);
  const dropNode = (event: DragEvent<HTMLElement>) => {
    if (!isNodeDrag(event)) return;
    event.preventDefault();
    setIsDropActive(false);
    if (editingPrefabId !== null) {
      window.alert("A preset cannot be created while a preset is being edited.");
      return;
    }
    const error = createPrefabFromNode(event.dataTransfer.getData(NODE_DRAG_TYPE));
    if (error !== null) window.alert(error);
  };

  const commitRename = () => {
    if (renamingPrefabId !== null && renameText.trim() !== "") renamePrefab(renamingPrefabId, renameText);
    setRenamingPrefabId(null);
  };

  return (
    <section
      className={`presets-panel${isDropActive ? " presets-panel-drop-active" : ""}`}
      aria-label="Presets"
      onDragOver={(event) => {
        if (!isNodeDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDropActive(true);
      }}
      onDragLeave={() => setIsDropActive(false)}
      onDrop={dropNode}
    >
      <p className="presets-drop-hint">Drop a node from Hierarchy here to create a preset</p>
      <ul className="presets-list">
        {prefabs.map((prefab) => {
          const usage = instanceCount(prefab.id);
          return (
            <li key={prefab.id} className={`preset-row${prefab.id === editingPrefabId ? " preset-row-editing" : ""}`}>
              {renamingPrefabId === prefab.id ? (
                <input
                  className="preset-rename-input"
                  autoFocus
                  value={renameText}
                  onChange={(event) => setRenameText(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename();
                    if (event.key === "Escape") setRenamingPrefabId(null);
                  }}
                />
              ) : (
                <span
                  className="preset-name"
                  draggable={editingPrefabId === null}
                  title={prefab.name}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PREFAB_DRAG_TYPE, prefab.id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDoubleClick={() => {
                    setRenamingPrefabId(prefab.id);
                    setRenameText(prefab.name);
                  }}
                >
                  {prefab.name} <span className="preset-usage">({usage})</span>
                </span>
              )}
              <div className="preset-actions">
                <button
                  type="button"
                  disabled={editingPrefabId !== null}
                  onClick={() => setEditingPrefabId(prefab.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete preset ${prefab.name}`}
                  disabled={usage > 0}
                  title={usage > 0 ? `Used by ${usage} instance(s)` : `Delete preset ${prefab.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete preset "${prefab.name}"?`)) deletePrefab(prefab.id);
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PresetsWindow() {
  const position = useUiPrefsStore((state) => state.presetsWindowPosition);
  const size = useUiPrefsStore((state) => state.presetsWindowSize);
  const setOpen = useUiPrefsStore((state) => state.setPresetsWindowOpen);
  const setPosition = useUiPrefsStore((state) => state.setPresetsWindowPosition);
  const setSize = useUiPrefsStore((state) => state.setPresetsWindowSize);

  return (
    <FloatingWindow
      ariaLabel="Presets"
      className="presets-window"
      title="Presets"
      position={position}
      size={size}
      minSize={{ width: 240, height: 160 }}
      onPositionChange={setPosition}
      onSizeChange={setSize}
      onClose={() => setOpen(false)}
    >
      <PresetsPanel />
    </FloatingWindow>
  );
}
