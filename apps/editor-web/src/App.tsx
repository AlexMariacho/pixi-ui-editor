import { useEffect, useMemo, useRef } from "react";
import type { ProjectDocument } from "@pixi-ui-editor/schema";
import { getSceneRoot, useEditorStore } from "./store/index.js";
import { Inspector } from "./panels/inspector/Inspector.js";
import { resolveFileUrl } from "./shared/assets.js";
import { downloadProjectPackage } from "./shared/exportPackage.js";
import { AssetsWindow } from "./panels/assets/AssetPanel.js";
import { PresetsWindow } from "./panels/presets/PresetsPanel.js";
import { useUiPrefsStore } from "./shared/uiPrefs.js";
import { EDITOR_COMMAND_IDS, dispatchEditorKeyboardEvent, editorCommandRegistry } from "./shared/editorCommands.js";
import { openRuntimePreview, updateRuntimePreviews, type PreviewPayload } from "./panels/preview/RuntimePreview.js";
import { SceneCanvas } from "./canvas/SceneCanvas.js";
import { HierarchyTree } from "./panels/hierarchy/HierarchyTree.js";
import { ScreenResolutionsMenu } from "./panels/toolbar/ScreenResolutionsMenu.js";
import { WindowsSection } from "./panels/toolbar/WindowsSection.js";
import { commandTitle } from "./panels/toolbar/ToolPanel.js";
import { StartupScreen } from "./panels/startup/StartupScreen.js";
import { WorkspaceSwitchDialog } from "./panels/startup/WorkspaceSwitchDialog.js";
export function App() {
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const projectOpen = useEditorStore((state) => state.projectOpen);
  const manifest = useEditorStore((state) => state.manifest);
  const folderName = useEditorStore((state) => state.folderName);
  const dirty = useEditorStore((state) => state.dirty);
  const folderBusy = useEditorStore((state) => state.folderBusy);
  const activeTool = useEditorStore((state) => state.activeTool);
  const viewMode = useEditorStore((state) => state.viewMode);
  const setActiveProfile = useEditorStore((state) => state.setActiveProfile);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const spineFrameRequest = useEditorStore((state) => selectedNodeId === null ? undefined : state.spineFrameRequests[selectedNodeId]);
  const buttonPreviewState = useEditorStore((state) => selectedNodeId === null ? undefined : state.buttonPreviewStates[selectedNodeId]);
  const sliderPreviewValue = useEditorStore((state) => selectedNodeId === null ? undefined : state.sliderPreviewValues[selectedNodeId]);
  const progressBarPreviewValue = useEditorStore((state) => selectedNodeId === null ? undefined : state.progressBarPreviewValues[selectedNodeId]);
  const spineAutoplay = useEditorStore((state) => selectedNodeId === null ? true : state.spineAutoplay[selectedNodeId] ?? true);
  const addNode = useEditorStore((state) => state.addNode);
  const addNodeFromAsset = useEditorStore((state) => state.addNodeFromAsset);
  const addPrefabInstance = useEditorStore((state) => state.addPrefabInstance);
  const updateReferenceViewport = useEditorStore((state) => state.updateReferenceViewport);
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);
  const setEditingPrefabId = useEditorStore((state) => state.setEditingPrefabId);
  const previewPayloadRef = useRef<PreviewPayload>({ document, sceneId, profile: activeProfile });
  previewPayloadRef.current = { document, sceneId, profile: activeProfile };

  useEffect(() => {
    updateRuntimePreviews(previewPayloadRef.current);
  }, [activeProfile, sceneId]);

  useEffect(() => {
    // Capture before Pixi/canvas handlers: they must not prevent document commands from reaching the registry.
    window.addEventListener("keydown", dispatchEditorKeyboardEvent, true);
    return () => window.removeEventListener("keydown", dispatchEditorKeyboardEvent, true);
  }, []);

  useEffect(() => {
    // The working copy always lives in IndexedDB regardless of this prompt; it only warns about unsaved
    // changes to the bound project folder (or "not yet saved to a folder" if none is bound).
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!useEditorStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  const editingPrefab = document.prefabs.find((candidate) => candidate.id === editingPrefabId);

  // В режиме редактирования canvas рендерит содержимое пресета как синтетическую сцену того же документа.
  const renderDocument = useMemo<ProjectDocument | undefined>(() => {
    if (scene === undefined) return undefined;
    if (editingPrefab === undefined) return document;
    return {
      ...document,
      scenes: [{ id: editingPrefab.id, name: editingPrefab.name, rootNodeIds: editingPrefab.rootNodeIds, nodes: editingPrefab.nodes, layout: scene.layout }],
    };
  }, [document, editingPrefab, scene]);

  const assetsWindowOpen = useUiPrefsStore((state) => state.assetsWindowOpen);
  const setAssetsWindowOpen = useUiPrefsStore((state) => state.setAssetsWindowOpen);
  const presetsWindowOpen = useUiPrefsStore((state) => state.presetsWindowOpen);
  const setPresetsWindowOpen = useUiPrefsStore((state) => state.setPresetsWindowOpen);

  if (!projectOpen) return <><StartupScreen /><WorkspaceSwitchDialog /></>;

  if (scene === undefined || renderDocument === undefined) return <main className="load-error">Selected scene does not exist in the project document.</main>;

  const owner = editingPrefab ?? scene;
  const implicitRootNodeId = editingPrefab === undefined ? getSceneRoot(scene)?.id : undefined;
  const selectedSceneNode = owner.nodes.find((node) => node.id === selectedNodeId);
  const selectedPrefabNode = editingPrefab === undefined && selectedSceneNode === undefined
    ? document.prefabs.flatMap((prefab) => prefab.nodes).find((node) => node.id === selectedNodeId)
    : undefined;
  const selectedNode = selectedSceneNode ?? selectedPrefabNode;
  const selectedNodeIsPresetContent = selectedPrefabNode !== undefined;
  const deleteDisabled = !editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.deleteNode);
  const viewport = scene.layout.referenceViewports[activeProfile];

  return (
    <>
    <main className="editor-shell">
      <header className="toolbar">
        <strong>Pixi UI Editor</strong>
        <ScreenResolutionsMenu activeProfile={activeProfile} viewport={viewport} setActiveProfile={setActiveProfile} updateReferenceViewport={updateReferenceViewport} />
        <span className="toolbar-project-name" title={dirty ? "Unsaved changes" : "Saved"}>
          {manifest?.name ?? document.project.name}
          {dirty && <span className="toolbar-dirty-marker" aria-label="Unsaved changes">•</span>}
        </span>
        <span className="toolbar-folder-binding">{folderName === null ? "Not saved to a folder" : folderName}</span>
        <div className="toolbar-actions">
          <button
            type="button"
            title={commandTitle(EDITOR_COMMAND_IDS.projectNew)}
            disabled={folderBusy || !editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.projectNew)}
            onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.projectNew)}
          >New</button>
          <button
            type="button"
            title={commandTitle(EDITOR_COMMAND_IDS.projectOpen)}
            disabled={folderBusy || !editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.projectOpen)}
            onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.projectOpen)}
          >Open</button>
          <button
            type="button"
            title={commandTitle(EDITOR_COMMAND_IDS.projectSaveAs)}
            disabled={folderBusy || !editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.projectSaveAs)}
            onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.projectSaveAs)}
          >Save As</button>
          <button
            type="button"
            title={commandTitle(EDITOR_COMMAND_IDS.projectSave)}
            disabled={folderBusy || !editorCommandRegistry.isEnabled(EDITOR_COMMAND_IDS.projectSave)}
            onClick={() => editorCommandRegistry.execute(EDITOR_COMMAND_IDS.projectSave)}
          >{folderBusy ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => {
            if (!openRuntimePreview({ document, sceneId, profile: activeProfile }, viewport)) {
              window.alert("Preview window was blocked by the browser. Allow popups for this site and try again.");
            }
          }}>Preview</button>
          <button type="button" onClick={() => { void downloadProjectPackage(document, resolveFileUrl); }}>Export</button>
        </div>
      </header>
      <aside className="panel hierarchy-panel">
        <h1>Hierarchy</h1>
        <WindowsSection document={document} sceneId={editingPrefab === undefined ? sceneId : null} editingPrefab={editingPrefab !== undefined} />
        <HierarchyTree owner={owner} prefabs={document.prefabs} selectedNodeIds={selectedNodeIds} implicitRootNodeId={implicitRootNodeId} />
        <div className="hierarchy-assets-action">
          <button type="button" className={`assets-window-trigger${assetsWindowOpen ? " screen-resolutions-trigger-open" : ""}`} aria-pressed={assetsWindowOpen} onClick={() => setAssetsWindowOpen(!assetsWindowOpen)}>Assets</button>
          <button type="button" className={`assets-window-trigger${presetsWindowOpen ? " screen-resolutions-trigger-open" : ""}`} aria-pressed={presetsWindowOpen} onClick={() => setPresetsWindowOpen(!presetsWindowOpen)}>Presets</button>
        </div>
      </aside>
      <section className="canvas-panel"><SceneCanvas document={renderDocument} sceneId={editingPrefab?.id ?? sceneId} activeProfile={activeProfile} activeTool={activeTool} viewMode={viewMode} selectedNodeIds={selectedNodeIds} selectedNodeId={selectedNodeId} editingPrefabName={editingPrefab?.name ?? null} spineFrameRequest={spineFrameRequest} spineAutoplay={spineAutoplay} buttonPreviewState={buttonPreviewState} sliderPreviewValue={sliderPreviewValue} progressBarPreviewValue={progressBarPreviewValue} deleteDisabled={deleteDisabled} setActiveProfile={setActiveProfile} addNode={addNode} addNodeFromAsset={addNodeFromAsset} addPrefabInstance={addPrefabInstance} finishEditingPrefab={() => setEditingPrefabId(null)} />{assetsWindowOpen && <AssetsWindow />}{presetsWindowOpen && <PresetsWindow />}</section>
      <aside className="panel inspector-panel"><h1>Inspector</h1><Inspector selectedNode={selectedNode} readOnly={selectedNodeIsPresetContent} /></aside>
    </main>
    <WorkspaceSwitchDialog />
    </>
  );
}
