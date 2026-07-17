import { useState } from "react";
import type { ProjectDocument } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../store/index.js";
export function WindowsSection({ document, sceneId, editingPrefab }: { document: ProjectDocument; sceneId: string | null; editingPrefab: boolean }) {
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
