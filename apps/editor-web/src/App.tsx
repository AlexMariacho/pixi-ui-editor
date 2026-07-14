import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { buildSceneView } from "@pixi-ui-editor/runtime-pixi";
import type { LayoutProfileId, ProjectDocument, UINode } from "@pixi-ui-editor/schema";
import { Application, Container, Graphics, type FederatedPointerEvent } from "pixi.js";
import { useEditorStore } from "./store.js";
import { Inspector } from "./Inspector.js";
import { loadEditorSceneTextures } from "./assets.js";

const CANVAS_BACKGROUND = 0x181818;
const ARTBOARD_FILL = 0x1e1e2e;
const ARTBOARD_BORDER = 0x3c3c50;
const SELECTION_COLOR = 0x4c9aff;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

type ScreenPreset = { label: string; width: number; height: number };

const SCREEN_PRESET_GROUPS: readonly { label: string; presets: readonly ScreenPreset[] }[] = [
  {
    label: "Mobile",
    presets: [
      { label: "640 × 1136 (iPhone SE 1st Gen)", width: 640, height: 1136 },
      { label: "750 × 1334 (iPhone 6, 7, 8, SE 2nd/3rd Gen)", width: 750, height: 1334 },
      { label: "828 × 1792 (iPhone XR, 11)", width: 828, height: 1792 },
      { label: "1080 × 1920 (Pixel 2, Galaxy S5-S7)", width: 1080, height: 1920 },
      { label: "1170 × 2532 (iPhone 12, 13, 14, 15)", width: 1170, height: 2532 },
      { label: "1284 × 2778 (iPhone 12/13/14/15 Pro Max)", width: 1284, height: 2778 },
      { label: "1440 × 3200 (Galaxy S22 Ultra, OnePlus 8 Pro)", width: 1440, height: 3200 },
    ],
  },
  {
    label: "Desktop",
    presets: [
      { label: "1024 × 768 (Older CRT, legacy monitors)", width: 1024, height: 768 },
      { label: "1366 × 768 (Common budget laptops)", width: 1366, height: 768 },
      { label: "1920 × 1080 (Standard 1080p monitors)", width: 1920, height: 1080 },
      { label: "2560 × 1440 (2K monitors, gaming displays)", width: 2560, height: 1440 },
      { label: "3024 × 1964 (MacBook Pro 14” 2021+)", width: 3024, height: 1964 },
      { label: "3840 × 2160 (4K UHD monitors)", width: 3840, height: 2160 },
      { label: "6016 × 3384 (6K Apple Pro Display XDR)", width: 6016, height: 3384 },
    ],
  },
  {
    label: "Tablet",
    presets: [
      { label: "768 × 1024 (iPad Mini 1st-5th Gen, iPad 1st-9th Gen)", width: 768, height: 1024 },
      { label: "810 × 1080 (iPad Mini 6th Gen)", width: 810, height: 1080 },
      { label: "834 × 1194 (iPad Air 3rd-5th Gen)", width: 834, height: 1194 },
      { label: "1024 × 1366 (iPad Pro 12.9”)", width: 1024, height: 1366 },
      { label: "1200 × 1920 (Galaxy Tab A7, Fire HD 10)", width: 1200, height: 1920 },
      { label: "1600 × 2560 (Galaxy Tab S7/S8/S9)", width: 1600, height: 2560 },
    ],
  },
] as const;

const SCREEN_PRESETS = SCREEN_PRESET_GROUPS.flatMap((group) => group.presets);

function toActiveViewport(preset: ScreenPreset, profile: LayoutProfileId) {
  const shortSide = Math.min(preset.width, preset.height);
  const longSide = Math.max(preset.width, preset.height);
  return profile === "desktop" ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide };
}

function getPresetLabel(preset: ScreenPreset, profile: LayoutProfileId) {
  const viewport = toActiveViewport(preset, profile);
  return preset.label.replace(/^\d+ × \d+/, `${viewport.width} × ${viewport.height}`);
}

function isCurrentPreset(preset: ScreenPreset, viewport: { width: number; height: number }, profile: LayoutProfileId) {
  const expectedViewport = toActiveViewport(preset, profile);
  return viewport.width === expectedViewport.width && viewport.height === expectedViewport.height;
}

function ScreenNumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  const applyValue = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChange(parsed);
  };

  return <label className="toolbar-screen-number"><span>{label}</span><input type="number" value={text} step={1} onChange={applyValue} /></label>;
}

function ScreenResolutionsMenu({
  activeProfile,
  viewport,
  setActiveProfile,
  updateReferenceViewport,
}: {
  activeProfile: LayoutProfileId;
  viewport: { width: number; height: number };
  setActiveProfile: (profile: LayoutProfileId) => void;
  updateReferenceViewport: (profile: LayoutProfileId, viewport: { width: number; height: number }) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const preferredGroupLabels = activeProfile === "desktop"
    ? ["Desktop", "Tablet", "Mobile"]
    : ["Mobile", "Tablet", "Desktop"];
  const selectedPreset = preferredGroupLabels
    .flatMap((groupLabel) => SCREEN_PRESET_GROUPS.find((group) => group.label === groupLabel)?.presets ?? [])
    .find((preset) => isCurrentPreset(preset, viewport, activeProfile));

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const updateViewportDimension = (dimension: "width" | "height", value: number) => {
    updateReferenceViewport(activeProfile, { ...viewport, [dimension]: value });
  };
  const applyPreset = (preset: ScreenPreset) => {
    updateReferenceViewport(activeProfile, toActiveViewport(preset, activeProfile));
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="screen-resolutions-menu">
      <button
        type="button"
        className={`screen-resolutions-trigger${isOpen ? " screen-resolutions-trigger-open" : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
      >
        Screen Resolutions
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <section className="screen-resolutions-popover" aria-label="Screen Resolutions">
          {SCREEN_PRESET_GROUPS.map((group) => (
            <fieldset key={group.label} className="screen-resolution-group">
              <legend>{group.label}</legend>
              {group.presets.map((preset) => (
                <label key={preset.label} className="screen-resolution-option">
                  <input
                    type="radio"
                    name="screen-resolution"
                    checked={selectedPreset?.label === preset.label}
                    onChange={() => applyPreset(preset)}
                  />
                  <span>{getPresetLabel(preset, activeProfile)}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <fieldset className="screen-resolution-group screen-resolution-custom">
            <legend>Custom</legend>
            <div className="screen-resolution-custom-fields">
              <ScreenNumberField label="W" value={viewport.width} onChange={(value) => updateViewportDimension("width", value)} />
              <ScreenNumberField label="H" value={viewport.height} onChange={(value) => updateViewportDimension("height", value)} />
            </div>
          </fieldset>
          <fieldset className="screen-resolution-group">
            <legend>Orientation</legend>
            <label className="screen-resolution-option">
              <input type="radio" name="orientation" checked={activeProfile === "desktop"} onChange={() => setActiveProfile("desktop")} />
              <span>Horizontal</span>
            </label>
            <label className="screen-resolution-option">
              <input type="radio" name="orientation" checked={activeProfile === "mobile"} onChange={() => setActiveProfile("mobile")} />
              <span>Vertical</span>
            </label>
          </fieldset>
        </section>
      )}
    </div>
  );
}

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
          style={{ paddingInlineStart: `${depth * 16 + 12}px` }}
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

function SceneCanvas({ document, sceneId, activeProfile, selectedNodeId, setActiveProfile, addNode }: {
  document: ProjectDocument;
  sceneId: string;
  activeProfile: LayoutProfileId;
  selectedNodeId: string | null;
  setActiveProfile: (profile: LayoutProfileId) => void;
  addNode: (type: "container" | "image" | "text") => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<Container | null>(null);
  const artboardRef = useRef<Graphics | null>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const nodeViewsRef = useRef<Map<string, Container>>(new Map());
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const viewportRef = useRef<{ width: number; height: number } | null>(null);
  const cameraFittedRef = useRef(false);
  const renderedProfileRef = useRef<LayoutProfileId | null>(null);
  const fitCameraRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const startDragRef = useRef<((nodeId: string, nodeView: Container, event: FederatedPointerEvent) => void) | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [zoom, setZoom] = useState(1);

  const redrawSelectionRef = useRef<() => void>(() => {
    const selectionGraphics = selectionGraphicsRef.current;
    if (selectionGraphics === null) return;

    selectionGraphics.clear();
    const nodeId = useEditorStore.getState().selectedNodeId;
    if (nodeId === null) return;

    const nodeView = nodeViewsRef.current.get(nodeId);
    if (nodeView === undefined || nodeView.destroyed) return;

    const bounds = nodeView.getBounds();
    selectionGraphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke({ width: 1.5, color: SELECTION_COLOR });
  });

  useEffect(() => {
    const application = new Application();
    let cancelled = false;
    let initialized = false;
    let removeDomListeners: (() => void) | null = null;

    void application.init({ background: CANVAS_BACKGROUND, resizeTo: hostRef.current! }).then(() => {
      initialized = true;
      if (cancelled) {
        application.destroy(true);
        return;
      }

      hostRef.current?.appendChild(application.canvas);

      const world = new Container();
      const artboard = new Graphics();
      world.addChild(artboard);
      const overlay = new Container();
      overlay.eventMode = "none";
      const selectionGraphics = new Graphics();
      overlay.addChild(selectionGraphics);
      application.stage.addChild(world, overlay);
      application.stage.eventMode = "static";
      application.stage.hitArea = application.screen;
      application.stage.on("pointerdown", (event) => {
        if (event.button === 0) useEditorStore.getState().selectNode(null);
      });

      const syncCamera = () => {
        setZoom(world.scale.x);
        redrawSelectionRef.current();
      };

      fitCameraRef.current = () => {
        const viewport = viewportRef.current;
        const host = hostRef.current;
        if (viewport === null || host === null) return;

        const scale = Math.min(host.clientWidth / viewport.width, host.clientHeight / viewport.height) * 0.9;
        world.scale.set(scale);
        world.position.set((host.clientWidth - viewport.width * scale) / 2, (host.clientHeight - viewport.height * scale) / 2);
        syncCamera();
      };

      const canvas = application.canvas;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, world.scale.x * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const ratio = scale / world.scale.x;
        world.position.set(pointerX - (pointerX - world.position.x) * ratio, pointerY - (pointerY - world.position.y) * ratio);
        world.scale.set(scale);
        syncCamera();
      };

      let pan: { pointerId: number; lastX: number; lastY: number } | null = null;
      const onMouseDown = (event: MouseEvent) => {
        if (event.button === 1) event.preventDefault();
      };
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 1) return;
        event.preventDefault();
        pan = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
        canvas.style.cursor = "grabbing";
        canvas.setPointerCapture(event.pointerId);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (pan === null || event.pointerId !== pan.pointerId) return;
        world.position.x += event.clientX - pan.lastX;
        world.position.y += event.clientY - pan.lastY;
        pan = { pointerId: pan.pointerId, lastX: event.clientX, lastY: event.clientY };
        redrawSelectionRef.current();
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pan === null || event.pointerId !== pan.pointerId) return;
        pan = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = "";
      };

      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      removeDomListeners = () => {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      };

      const stopDrag = () => {
        dragRef.current = null;
        application.stage.off("pointermove", moveDraggedNode);
        application.stage.off("pointerup", stopDrag);
        application.stage.off("pointerupoutside", stopDrag);
      };
      const moveDraggedNode = (event: FederatedPointerEvent) => {
        const drag = dragRef.current;
        if (drag === null) return;

        // Сцена пересобирается при каждом изменении документа, поэтому view ищем заново.
        const nodeView = nodeViewsRef.current.get(drag.nodeId);
        const parentView = nodeView?.parent;
        if (nodeView === undefined || nodeView.destroyed || parentView === null || parentView === undefined) return;

        const localPosition = parentView.toLocal(event.global);
        useEditorStore.getState().updateNodeProfileTransform(drag.nodeId, {
          x: Math.round((localPosition.x - drag.offsetX) * 100) / 100,
          y: Math.round((localPosition.y - drag.offsetY) * 100) / 100,
        });
      };
      startDragRef.current = (nodeId, nodeView, event) => {
        const parentView = nodeView.parent;
        if (parentView === null) return;

        const localPosition = parentView.toLocal(event.global);
        dragRef.current = {
          nodeId,
          offsetX: localPosition.x - nodeView.position.x,
          offsetY: localPosition.y - nodeView.position.y,
        };
        application.stage.on("pointermove", moveDraggedNode);
        application.stage.on("pointerup", stopDrag);
        application.stage.on("pointerupoutside", stopDrag);
      };

      worldRef.current = world;
      artboardRef.current = artboard;
      selectionGraphicsRef.current = selectionGraphics;
      setApplication(application);
    });

    return () => {
      cancelled = true;
      removeDomListeners?.();
      worldRef.current = null;
      artboardRef.current = null;
      sceneRootRef.current = null;
      nodeViewsRef.current = new Map();
      selectionGraphicsRef.current = null;
      fitCameraRef.current = null;
      cameraFittedRef.current = false;
      if (initialized) application.destroy(true);
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    if (application === null || world === null) return;

    const scene = document.scenes.find((candidate) => candidate.id === sceneId);
    if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);

    const profileChanged = renderedProfileRef.current !== activeProfile;
    renderedProfileRef.current = activeProfile;
    const viewport = scene.layout.referenceViewports[activeProfile];
    const viewportChanged = viewportRef.current?.width !== viewport.width || viewportRef.current?.height !== viewport.height;
    viewportRef.current = { width: viewport.width, height: viewport.height };
    artboardRef.current?.clear().rect(0, 0, viewport.width, viewport.height).fill(ARTBOARD_FILL).stroke({ width: 2, color: ARTBOARD_BORDER });

    let cancelled = false;

    void loadEditorSceneTextures(document, sceneId).then((textures) => {
      if (cancelled) return;

      const { root, nodeViews } = buildSceneView(document, sceneId, activeProfile, textures);
      for (const [nodeId, nodeView] of nodeViews) {
        nodeView.eventMode = "static";
        nodeView.on("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          useEditorStore.getState().selectNode(nodeId);
          startDragRef.current?.(nodeId, nodeView, event);
        });
      }

      sceneRootRef.current?.destroy({ children: true });
      sceneRootRef.current = root;
      nodeViewsRef.current = nodeViews;
      world.addChild(root);

      if (!cameraFittedRef.current || profileChanged || viewportChanged) {
        cameraFittedRef.current = true;
        fitCameraRef.current?.();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeProfile, application, document, sceneId]);

  useEffect(() => {
    redrawSelectionRef.current();
  }, [activeProfile, application, document, sceneId, selectedNodeId]);

  return (
    <div ref={hostRef} className="scene-canvas">
      <div className="canvas-bottom-toolbar" role="toolbar" aria-label="Canvas tools">
        <button
          type="button"
          className="canvas-orientation-button"
          aria-label={`Switch to ${activeProfile === "desktop" ? "Vertical" : "Horizontal"}`}
          title={`Switch to ${activeProfile === "desktop" ? "Vertical" : "Horizontal"}`}
          onClick={() => setActiveProfile(activeProfile === "desktop" ? "mobile" : "desktop")}
        >
          ⟳
        </button>
        <span className="canvas-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={() => addNode("container")}>+ Container</button>
        <button type="button" onClick={() => addNode("image")}>+ Image</button>
        <button type="button" onClick={() => addNode("text")}>+ Text</button>
      </div>
      <div className="canvas-hud">
        <button type="button" onClick={() => fitCameraRef.current?.()}>Fit</button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}

export function App() {
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const setActiveProfile = useEditorStore((state) => state.setActiveProfile);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const addNode = useEditorStore((state) => state.addNode);
  const deleteNode = useEditorStore((state) => state.deleteNode);
  const resetToSample = useEditorStore((state) => state.resetToSample);
  const updateReferenceViewport = useEditorStore((state) => state.updateReferenceViewport);
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);

  if (scene === undefined) return <main className="load-error">Selected scene does not exist in the project document.</main>;

  const selectedNode = scene.nodes.find((node) => node.id === selectedNodeId);
  const deleteDisabled = selectedNode === undefined || (selectedNode.parentId === null && scene.rootNodeIds.length === 1);
  const viewport = scene.layout.referenceViewports[activeProfile];

  return (
    <main className="editor-shell">
      <header className="toolbar">
        <strong>Pixi UI Editor</strong>
        <ScreenResolutionsMenu activeProfile={activeProfile} viewport={viewport} setActiveProfile={setActiveProfile} updateReferenceViewport={updateReferenceViewport} />
        <span>{document.project.name}</span>
        <div className="toolbar-actions">
          <button type="button" className="toolbar-danger" disabled={deleteDisabled} onClick={() => selectedNodeId !== null && deleteNode(selectedNodeId)}>Delete</button>
          <button type="button" onClick={resetToSample}>Reset to sample</button>
        </div>
      </header>
      <aside className="panel hierarchy-panel"><h1>Hierarchy</h1><HierarchyTree scene={scene} selectedNodeId={selectedNodeId} /></aside>
      <section className="canvas-panel"><SceneCanvas document={document} sceneId={sceneId} activeProfile={activeProfile} selectedNodeId={selectedNodeId} setActiveProfile={setActiveProfile} addNode={addNode} /></section>
      <aside className="panel inspector-panel"><h1>Inspector</h1><Inspector selectedNode={selectedNode} /></aside>
    </main>
  );
}
