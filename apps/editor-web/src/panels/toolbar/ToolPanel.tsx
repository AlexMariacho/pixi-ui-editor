import type { ReactNode } from "react";
import type { EditorTool, ViewMode } from "../../store/index.js";
import { EDITOR_COMMAND_IDS, editorCommandRegistry, type EditorCommandId } from "../../shared/editorCommands.js";
export function ToolPanel({ activeTool, viewMode }: { activeTool: EditorTool; viewMode: ViewMode }) {
  const tools: readonly { tool: EditorTool; commandId: EditorCommandId; icon: ReactNode }[] = [
    { tool: "pan", commandId: EDITOR_COMMAND_IDS.panTool, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5M7 7l5-4 5 4M7 17l5 4 5-4" /></svg> },
    { tool: "select", commandId: EDITOR_COMMAND_IDS.selectTool, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l13 8-6 2-2 6L5 3Z" /></svg> },
    { tool: "resize", commandId: EDITOR_COMMAND_IDS.resizeTool, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4M8 8h8v8H8z" /></svg> },
  ];

  return (
    <div className="canvas-tool-mode-group" role="group" aria-label="Viewport tools">
      <button
        type="button"
        className="tool-panel-button"
        title={commandTitle(EDITOR_COMMAND_IDS.undo)}
        aria-label={commandTitle(EDITOR_COMMAND_IDS.undo)}
        disabled={!editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.undo)}
        onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.undo)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h9a5 5 0 0 1 0 10h-2" /></svg>
      </button>
      <button
        type="button"
        className="tool-panel-button"
        title={commandTitle(EDITOR_COMMAND_IDS.redo)}
        aria-label={commandTitle(EDITOR_COMMAND_IDS.redo)}
        disabled={!editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.redo)}
        onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.redo)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5m4-5h-9a5 5 0 0 0 0 10h2" /></svg>
      </button>
      {tools.map(({ tool, commandId, icon }) => (
        <button
          key={tool}
          type="button"
          className={`tool-panel-button${activeTool === tool ? " tool-panel-button-active" : ""}`}
          title={commandTitle(commandId)}
          aria-label={commandTitle(commandId)}
          aria-pressed={activeTool === tool}
          disabled={!editorCommandRegistry.isEnabled(commandId)}
          onClick={() => editorCommandRegistry.execute(commandId)}
        >
          {icon}
        </button>
      ))}
      <button
        type="button"
        className={`tool-panel-button${viewMode === "map" ? " tool-panel-button-active" : ""}`}
        title={commandTitle(EDITOR_COMMAND_IDS.toggleMap)}
        aria-label={commandTitle(EDITOR_COMMAND_IDS.toggleMap)}
        aria-pressed={viewMode === "map"}
        onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.toggleMap)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7v6H3zM14 5h7v9h-7zM3 14h7v5H3zM14 17h7v2h-7z" /></svg>
      </button>
    </div>
  );
}

export function commandTitle(commandId: EditorCommandId): string {
  const title = editorCommandRegistry.getTitle(commandId);
  const shortcut = editorCommandRegistry.getShortcutLabel(commandId);
  return shortcut === undefined ? title : `${title} (${shortcut})`;
}
