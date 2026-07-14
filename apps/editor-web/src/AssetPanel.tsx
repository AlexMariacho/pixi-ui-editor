import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { Asset } from "@pixi-ui-editor/schema";
import { resolveAssetUrl } from "./assets.js";
import { useEditorStore } from "./store.js";
import { useUiPrefsStore } from "./uiPrefs.js";
import { FloatingWindow } from "./FloatingWindow.js";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function assetNameFromFile(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function AssetPreview({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false);
  const url = resolveAssetUrl(asset);

  return (
    <div className={`asset-preview${failed || url === undefined ? " asset-preview-fallback" : ""}`}>
      {url !== undefined && !failed && <img src={url} alt="" onError={() => setFailed(true)} />}
    </div>
  );
}

export function AssetPanel({ viewMode }: { viewMode: "list" | "compact" | "grid" }) {
  const assets = useEditorStore((state) => state.document.assets);
  const scenes = useEditorStore((state) => state.document.scenes);
  const prefabs = useEditorStore((state) => state.document.prefabs);
  const addImageAsset = useEditorStore((state) => state.addImageAsset);
  const replaceAssetSource = useEditorStore((state) => state.replaceAssetSource);
  const deleteAsset = useEditorStore((state) => state.deleteAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const importImage = (file: File, assetIdToReplace: string | null) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      console.warn(`Cannot upload '${file.name}': unsupported image type '${file.type || "unknown"}'.`);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const message = "Images larger than 2 MB cannot be uploaded because the project is stored in localStorage.";
      console.warn(`Cannot upload '${file.name}': ${message}`);
      window.alert(message);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        console.warn(`Cannot upload '${file.name}': the image could not be read as a data URI.`);
        return;
      }
      const source = { uri: reader.result, mediaType: file.type };
      if (assetIdToReplace === null) addImageAsset(assetNameFromFile(file.name), source);
      else replaceAssetSource(assetIdToReplace, source);
      setReplaceAssetId(null);
    });
    reader.addEventListener("error", () => console.warn(`Cannot upload '${file.name}': the image could not be read.`));
    reader.readAsDataURL(file);
  };

  const uploadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file !== undefined) importImage(file, replaceAssetId);
  };

  const hasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes("Files");

  const startDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) return;
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const leaveDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) return;
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragActive(false);
    }
  };

  const dropImages = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    [...event.dataTransfer.files].forEach((file) => importImage(file, null));
  };

  return (
    <section className={`asset-panel${isDragActive ? " asset-panel-drop-active" : ""}`} aria-label="Assets" onDragEnter={startDrop} onDragOver={(event) => event.preventDefault()} onDragLeave={leaveDrop} onDrop={dropImages}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} />
      <p className="asset-panel-drop-hint">Drop PNG, JPEG or WebP files here</p>
      <ul className={`asset-list asset-list-${viewMode}`}>
        {assets.map((asset) => {
          const usageCount = [...scenes, ...prefabs].flatMap((owner) => owner.nodes)
            .filter((node) => (node.type === "image" || node.type === "spine") && node.assetId === asset.id).length;
          const deleteDisabled = usageCount > 0;

          if (viewMode === "list") return (
            <li key={asset.id} className="asset-row">
              <AssetPreview asset={asset} />
              <div className="asset-details">
                <span className="asset-name" title={asset.name}>{asset.name} ({usageCount})</span>
                <span className="asset-type">{asset.type}</span>
              </div>
              <div className="asset-actions">
                <button type="button" onClick={() => { setReplaceAssetId(asset.id); inputRef.current?.click(); }}>Replace</button>
                <button type="button" disabled={deleteDisabled} title={deleteDisabled ? `Used by ${usageCount} node(s)` : undefined} onClick={() => deleteAsset(asset.id)}>Delete</button>
              </div>
            </li>
          );

          if (viewMode === "compact") return (
            <li key={asset.id} className="asset-compact-row">
              <div className="asset-details">
                <span className="asset-name" title={asset.name}>{asset.name}</span>
                <span className="asset-type">{asset.type}</span>
              </div>
              <div className="asset-actions">
                <button type="button" onClick={() => { setReplaceAssetId(asset.id); inputRef.current?.click(); }}>Replace</button>
                <button type="button" disabled={deleteDisabled} title={deleteDisabled ? `Used by ${usageCount} node(s)` : undefined} onClick={() => deleteAsset(asset.id)}>Delete</button>
              </div>
            </li>
          );

          return (
            <li key={asset.id} className="asset-grid-tile">
              <AssetPreview asset={asset} />
              <span className="asset-name" title={asset.name}>{asset.name}</span>
              <span className="asset-usage">Used by {usageCount} node{usageCount === 1 ? "" : "s"}</span>
              <div className="asset-actions">
                <button type="button" onClick={() => { setReplaceAssetId(asset.id); inputRef.current?.click(); }}>Replace</button>
                <button type="button" disabled={deleteDisabled} title={deleteDisabled ? `Used by ${usageCount} node(s)` : undefined} onClick={() => deleteAsset(asset.id)}>Delete</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AssetsWindow() {
  const position = useUiPrefsStore((state) => state.assetsWindowPosition);
  const size = useUiPrefsStore((state) => state.assetsWindowSize);
  const assetsViewMode = useUiPrefsStore((state) => state.assetsViewMode);
  const setAssetsWindowOpen = useUiPrefsStore((state) => state.setAssetsWindowOpen);
  const setAssetsWindowPosition = useUiPrefsStore((state) => state.setAssetsWindowPosition);
  const setAssetsWindowSize = useUiPrefsStore((state) => state.setAssetsWindowSize);
  const setAssetsViewMode = useUiPrefsStore((state) => state.setAssetsViewMode);

  return (
    <FloatingWindow
      ariaLabel="Assets"
      className="assets-window"
      title="Assets"
      titleActions={
        <div className="assets-view-mode-toggle" role="group" aria-label="Asset view mode">
          <button type="button" className={assetsViewMode === "compact" ? "assets-view-mode-active" : ""} title="Compact list view" aria-label="Compact list view" aria-pressed={assetsViewMode === "compact"} onClick={() => setAssetsViewMode("compact")}>≡</button>
          <button type="button" className={assetsViewMode === "list" ? "assets-view-mode-active" : ""} title="List view" aria-label="List view" aria-pressed={assetsViewMode === "list"} onClick={() => setAssetsViewMode("list")}>☷</button>
          <button type="button" className={assetsViewMode === "grid" ? "assets-view-mode-active" : ""} title="Grid view" aria-label="Grid view" aria-pressed={assetsViewMode === "grid"} onClick={() => setAssetsViewMode("grid")}>▦</button>
        </div>
      }
      position={position}
      size={size}
      minSize={{ width: 240, height: 180 }}
      onPositionChange={setAssetsWindowPosition}
      onSizeChange={setAssetsWindowSize}
      onClose={() => setAssetsWindowOpen(false)}
    >
      <AssetPanel viewMode={assetsViewMode} />
    </FloatingWindow>
  );
}
