import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { Asset, AssetFile } from "@pixi-ui-editor/schema";
import { Application, Container } from "pixi.js";
import { createSpineView, loadSpineAsset, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import { clearEditorSpineCache, resolveAssetUrl, resolveFileUrl } from "./assets.js";
import { useEditorStore } from "./store.js";
import { useUiPrefsStore } from "./uiPrefs.js";
import { FloatingWindow } from "./FloatingWindow.js";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const imageExtension = /\.(png|jpe?g|webp)$/i;
const extension = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();
const assetNameFromFile = (name: string) => name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
const readFile = (file: File): Promise<AssetFile> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener("load", () => typeof reader.result === "string" ? resolve({ name: file.name, uri: reader.result, mediaType: file.type || "application/octet-stream" }) : reject(new Error(`'${file.name}' could not be read.`)));
  reader.addEventListener("error", () => reject(new Error(`'${file.name}' could not be read.`)));
  reader.readAsDataURL(file);
});

function AssetPreview({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false);
  const url = resolveAssetUrl(asset);
  return <div className={`asset-preview${failed || url === undefined ? " asset-preview-fallback" : ""}`}>{url !== undefined && !failed && <img src={url} alt="" onError={() => setFailed(true)} />}</div>;
}

function SpinePreview({ asset }: { asset: Extract<Asset, { type: "spine" }> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SkeletonData>();
  const [animation, setAnimation] = useState("");
  const [loop, setLoop] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playbackTime, setPlaybackTime] = useState({ current: 0, duration: 0 });
  const frameRate = data?.fps && data.fps > 0 ? data.fps : 60;
  const totalFrames = Math.max(1, Math.round(playbackTime.duration * frameRate));
  const currentFrame = Math.min(totalFrames - 1, Math.floor(playbackTime.current * frameRate)) + 1;
  useEffect(() => { let cancelled = false; void loadSpineAsset(asset, resolveFileUrl).then((loaded) => { if (!cancelled) { setData(loaded); setAnimation((current) => current || loaded.animations[0]?.name || ""); } }).catch((error) => console.warn(`Unable to preview Spine asset '${asset.id}'.`, error)); return () => { cancelled = true; }; }, [asset]);
  useEffect(() => {
    if (hostRef.current === null || data === undefined) return;
    const app = new Application(); let cancelled = false;
    void app.init({ width: 220, height: 180, backgroundAlpha: 0 }).then(() => {
      if (cancelled) return app.destroy(true);
      hostRef.current?.appendChild(app.canvas);
      const spine = createSpineView(data);
      const selectedAnimation = animation ? data.findAnimation(animation) : null;
      const duration = selectedAnimation?.duration ?? 0;
      setPlaybackTime({ current: 0, duration });
      const track = selectedAnimation === null ? null : spine.state.setAnimation(0, selectedAnimation, loop);
      const bounds = spine.getLocalBounds();
      const scale = Math.min(200 / Math.max(bounds.width, 1), 160 / Math.max(bounds.height, 1));
      spine.scale.set(scale); spine.position.set(110 - (bounds.x + bounds.width / 2) * scale, 90 - (bounds.y + bounds.height / 2) * scale);
      app.stage.addChild(new Container({ children: [spine] }));
      let lastReportedProgress = -1;
      app.ticker.add(() => {
        if (track === null || duration <= 0) return;
        const time = loop ? track.trackTime % duration : Math.min(track.trackTime, duration);
        const nextProgress = Math.round((time / duration) * 100);
        if (nextProgress !== lastReportedProgress) {
          lastReportedProgress = nextProgress;
          setProgress(nextProgress);
          setPlaybackTime({ current: time, duration });
        }
      });
    });
    return () => { cancelled = true; app.destroy(true); };
  }, [animation, data, loop]);
  return <section className="spine-preview"><label>Preview animation <select value={animation} disabled={data === undefined} onChange={(event) => { setProgress(0); setPlaybackTime({ current: 0, duration: 0 }); setAnimation(event.target.value); }}>{data?.animations.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label className="spine-preview-loop"><input type="checkbox" checked={loop} onChange={(event) => { setProgress(0); setPlaybackTime({ current: 0, duration: playbackTime.duration }); setLoop(event.target.checked); }} /> Loop</label><div ref={hostRef} className="spine-preview-canvas" /><div className="spine-preview-progress-row"><progress className="spine-preview-progress" value={progress} max={100} aria-label="Animation progress" /><output>{playbackTime.current.toFixed(2)} / {playbackTime.duration.toFixed(2)}</output></div><output className="spine-preview-frames">Frames: {currentFrame} / {totalFrames}</output></section>;
}

export function AssetPanel({ viewMode }: { viewMode: "list" | "compact" | "grid" }) {
  const assets = useEditorStore((state) => state.document.assets); const scenes = useEditorStore((state) => state.document.scenes); const prefabs = useEditorStore((state) => state.document.prefabs);
  const addImageAsset = useEditorStore((state) => state.addImageAsset); const addSpineAsset = useEditorStore((state) => state.addSpineAsset); const replaceAssetSource = useEditorStore((state) => state.replaceAssetSource); const replaceSpineAssetFiles = useEditorStore((state) => state.replaceSpineAssetFiles); const deleteAsset = useEditorStore((state) => state.deleteAsset);
  const inputRef = useRef<HTMLInputElement>(null); const dragDepthRef = useRef(0); const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null); const [isDragActive, setIsDragActive] = useState(false); const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const importFiles = async (files: File[], assetIdToReplace: string | null) => {
    const spineMode = files.some((file) => extension(file.name) === ".atlas");
    if (spineMode) {
      const json = files.filter((file) => extension(file.name) === ".json"), atlas = files.filter((file) => extension(file.name) === ".atlas"), textures = files.filter((file) => imageExtension.test(file.name));
      const target = assetIdToReplace === null ? undefined : assets.find((asset) => asset.id === assetIdToReplace);
      if (json.length !== 1 || atlas.length !== 1 || textures.length < 1 || (target !== undefined && target.type !== "spine")) { window.alert("Spine import needs exactly one .json, exactly one .atlas, and at least one PNG or WebP texture."); return; }
      try { const [skeleton, atlasFile, ...textureFiles] = await Promise.all([json[0]!, atlas[0]!, ...textures].map(readFile)); const bundle = { skeleton, atlas: atlasFile, textures: textureFiles }; if (target === undefined) addSpineAsset(assetNameFromFile(json[0]!.name), bundle); else { clearEditorSpineCache(target.files.skeleton.uri); replaceSpineAssetFiles(target.id, bundle); } } catch (error) { console.warn("Unable to import Spine files.", error); window.alert("The Spine files could not be read."); }
      setReplaceAssetId(null); return;
    }
    if (assetIdToReplace !== null && files.length !== 1) { window.alert("Image replacement requires exactly one image file."); return; }
    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) { window.alert(`'${file.name}' is not a supported image up to 2 MB.`); continue; }
      try { const source = await readFile(file); if (assetIdToReplace === null) addImageAsset(assetNameFromFile(file.name), { uri: source.uri, mediaType: source.mediaType }); else replaceAssetSource(assetIdToReplace, { uri: source.uri, mediaType: source.mediaType }); } catch (error) { console.warn(`Unable to import '${file.name}'.`, error); }
    }
    setReplaceAssetId(null);
  };
  const upload = (event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void importFiles(files, replaceAssetId); };
  const hasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes("Files");
  const drop = (event: DragEvent<HTMLElement>) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepthRef.current = 0; setIsDragActive(false); void importFiles([...event.dataTransfer.files], null); };
  const selected = assets.find((asset) => asset.id === selectedAssetId);
  return <section className={`asset-panel${isDragActive ? " asset-panel-drop-active" : ""}`} aria-label="Assets" onDragEnter={(event) => { if (hasFiles(event)) { dragDepthRef.current += 1; setIsDragActive(true); } }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (hasFiles(event) && --dragDepthRef.current <= 0) { dragDepthRef.current = 0; setIsDragActive(false); } }} onDrop={drop}>
    <input ref={inputRef} type="file" multiple accept=".json,.atlas,image/png,image/jpeg,image/webp" onChange={upload} /><p className="asset-panel-drop-hint">Drop images or a Spine JSON + atlas + textures bundle here</p>
    <ul className={`asset-list asset-list-${viewMode}`}>{assets.map((asset) => { const usage = [...scenes, ...prefabs].flatMap((owner) => owner.nodes).filter((node) => (node.type === "image" || node.type === "spine") && node.assetId === asset.id).length; return <li key={asset.id} draggable className={`${viewMode === "grid" ? "asset-grid-tile" : viewMode === "compact" ? "asset-compact-row" : "asset-row"}${selectedAssetId === asset.id ? " asset-selected" : ""}`} onDragStart={(event) => { event.dataTransfer.setData("application/x-pixi-ui-editor-asset", asset.id); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => setSelectedAssetId(asset.id)}>{viewMode !== "compact" && <AssetPreview asset={asset} />}<div className="asset-details"><span className="asset-name" title={asset.name}>{asset.name}{viewMode === "list" ? ` (${usage})` : ""}</span><span className="asset-type">{asset.type}</span></div>{viewMode === "grid" && <span className="asset-usage">Used by {usage} node{usage === 1 ? "" : "s"}</span>}<div className="asset-actions"><button type="button" onClick={(event) => { event.stopPropagation(); setReplaceAssetId(asset.id); inputRef.current?.click(); }}>Replace</button><button type="button" disabled={usage > 0} title={usage ? `Used by ${usage} node(s)` : undefined} onClick={(event) => { event.stopPropagation(); deleteAsset(asset.id); }}>Delete</button></div></li>; })}</ul>
    {selected?.type === "spine" && <SpinePreview asset={selected} />}
  </section>;
}

export function AssetsWindow() { const position = useUiPrefsStore((state) => state.assetsWindowPosition); const size = useUiPrefsStore((state) => state.assetsWindowSize); const assetsViewMode = useUiPrefsStore((state) => state.assetsViewMode); const setOpen = useUiPrefsStore((state) => state.setAssetsWindowOpen); const setPosition = useUiPrefsStore((state) => state.setAssetsWindowPosition); const setSize = useUiPrefsStore((state) => state.setAssetsWindowSize); const setView = useUiPrefsStore((state) => state.setAssetsViewMode); return <FloatingWindow ariaLabel="Assets" className="assets-window" title="Assets" titleActions={<div className="assets-view-mode-toggle" role="group" aria-label="Asset view mode">{(["compact", "list", "grid"] as const).map((mode, index) => <button key={mode} type="button" className={assetsViewMode === mode ? "assets-view-mode-active" : ""} aria-pressed={assetsViewMode === mode} onClick={() => setView(mode)}>{["≡", "☷", "▦"][index]}</button>)}</div>} position={position} size={size} minSize={{ width: 240, height: 180 }} onPositionChange={setPosition} onSizeChange={setSize} onClose={() => setOpen(false)}><AssetPanel viewMode={assetsViewMode} /></FloatingWindow>; }
