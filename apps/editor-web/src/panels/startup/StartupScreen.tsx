import { useEditorStore } from "../../store/index.js";
import { EDITOR_COMMAND_IDS, editorCommandRegistry } from "../../shared/editorCommands.js";
import { isFileSystemAccessSupported } from "../../shared/projectFolder/index.js";

/**
 * Shown instead of the canvas whenever `projectOpen` is false: the editor always starts here, regardless
 * of what is already sitting in the IndexedDB working copy (TASK-047). New/Open run through the same
 * command registry as their toolbar counterparts, so the dirty guard (`WorkspaceSwitchDialog`) applies
 * identically here and from inside a running editor.
 */
export function StartupScreen() {
  const bootstrapping = useEditorStore((state) => state.bootstrapping);
  const manifest = useEditorStore((state) => state.manifest);
  const folderName = useEditorStore((state) => state.folderName);
  const dirty = useEditorStore((state) => state.dirty);
  const projectName = useEditorStore((state) => state.document.project.name);
  const continueProject = useEditorStore((state) => state.continueProject);

  const hasWorkingCopy = !bootstrapping && manifest !== undefined;
  const openSupported = isFileSystemAccessSupported();

  return (
    <main className="startup-screen">
      <section className="startup-screen-card">
        <h1>Pixi UI Editor</h1>
        <div className="startup-screen-actions">
          <button
            type="button"
            className="startup-screen-button"
            title={editorCommandRegistry.getTitle(EDITOR_COMMAND_IDS.projectNew)}
            onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.projectNew)}
          >
            New Project
          </button>
          <button
            type="button"
            className="startup-screen-button"
            disabled={!openSupported}
            title={openSupported ? editorCommandRegistry.getTitle(EDITOR_COMMAND_IDS.projectOpen) : "Opening a folder requires Chrome or Edge (File System Access API)."}
            onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.projectOpen)}
          >
            Open Project
          </button>
          {hasWorkingCopy && (
            <button type="button" className="startup-screen-button startup-screen-button-primary" onClick={continueProject}>
              <span>Continue — {manifest?.name ?? projectName}</span>
              {dirty && <span className="toolbar-dirty-marker" aria-label="Unsaved changes">•</span>}
              <span className="startup-screen-folder">{folderName === null ? "Not saved to a folder" : folderName}</span>
            </button>
          )}
        </div>
        {bootstrapping && <p className="startup-screen-status">Checking for a working copy…</p>}
      </section>
    </main>
  );
}
