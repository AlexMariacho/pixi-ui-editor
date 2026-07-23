import { useEditorStore } from "../../store/index.js";

/**
 * The dirty guard for New/Open (TASK-047): rendered from `App.tsx` regardless of whether the startup
 * screen or the running editor is currently shown, since New/Open are reachable from both. `pendingWorkspaceSwitch`
 * is set by `workspace.slice.ts` only when the working copy is dirty; resolving it with "save" keeps the dialog
 * open if the save was cancelled or failed (the store leaves `dirty` unchanged in that case).
 */
export function WorkspaceSwitchDialog() {
  const pending = useEditorStore((state) => state.pendingWorkspaceSwitch);
  const folderName = useEditorStore((state) => state.folderName);
  const folderBusy = useEditorStore((state) => state.folderBusy);
  const resolvePendingWorkspaceSwitch = useEditorStore((state) => state.resolvePendingWorkspaceSwitch);

  if (pending === null) return null;

  const actionLabel = pending === "new" ? "starting a new project" : "opening another project";
  const saveLabel = folderName === null ? "Save As" : "Save";

  return (
    <div className="modal-overlay" role="presentation">
      <section className="modal-dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved changes">
        <h2>Unsaved changes</h2>
        <p>The current project has unsaved changes. {saveLabel} before {actionLabel}, discard them, or cancel.</p>
        <div className="modal-dialog-actions">
          <button type="button" disabled={folderBusy} onClick={() => { void resolvePendingWorkspaceSwitch("save"); }}>
            {folderBusy ? "Saving…" : saveLabel}
          </button>
          <button type="button" disabled={folderBusy} onClick={() => { void resolvePendingWorkspaceSwitch("discard"); }}>Discard</button>
          <button type="button" disabled={folderBusy} onClick={() => { void resolvePendingWorkspaceSwitch("cancel"); }}>Cancel</button>
        </div>
      </section>
    </div>
  );
}
