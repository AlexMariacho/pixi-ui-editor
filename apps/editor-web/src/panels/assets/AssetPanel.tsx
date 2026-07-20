import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { Asset, AssetFile } from "@pixi-ui-editor/schema";
import { Application } from "pixi.js";
import { collectNodeAssetIds, createSpineView, loadSpineAsset, type SkeletonData } from "@pixi-ui-editor/runtime-pixi";
import { clearEditorSpineCache, getCachedAtlasJson, loadEditorAtlasJson, resolveAssetUrl, resolveFileUrl } from "../../shared/assets.js";
import { useEditorStore, type AtlasAsset } from "../../store/index.js";
import { useUiPrefsStore } from "../../shared/uiPrefs.js";
import { FloatingWindow } from "../../shared/FloatingWindow.js";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_ATLAS_TEXTURE_SIZE_BYTES = 16 * 1024 * 1024;
const MAX_SOUND_SIZE_BYTES = 10 * 1024 * 1024;
const SOUND_EXTENSIONS: Record<string, string> = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".aac": "audio/aac", ".m4a": "audio/mp4" };
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ACCEPTED_FONT_TYPES = new Set(["font/woff2", "font/woff", "font/ttf", "font/otf", "application/font-woff", "application/x-font-ttf", "application/x-font-opentype"]);
const fontExtension = /\.(woff2?|ttf|otf)$/i;
const fontMediaType = (file: File) => file.type || (file.name.toLowerCase().endsWith(".woff2") ? "font/woff2" : file.name.toLowerCase().endsWith(".woff") ? "font/woff" : file.name.toLowerCase().endsWith(".ttf") ? "font/ttf" : "font/otf");
const imageExtension = /\.(png|jpe?g|webp)$/i;
const extension = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();
const isSound = (file: File) => file.type.startsWith("audio/") || extension(file.name) in SOUND_EXTENSIONS;
const soundMediaType = (file: File) => file.type || SOUND_EXTENSIONS[extension(file.name)] || "application/octet-stream";
const assetNameFromFile = (name: string) => name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
const readFile = (file: File): Promise<AssetFile> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener("load", () => typeof reader.result === "string" ? resolve({ name: file.name, uri: reader.result, mediaType: file.type || "application/octet-stream" }) : reject(new Error(`'${file.name}' could not be read.`)));
  reader.addEventListener("error", () => reject(new Error(`'${file.name}' could not be read.`)));
  reader.readAsDataURL(file);
});

function AssetPreview({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false);
  if (asset.type === "sound") return <div className="asset-preview asset-preview-fallback asset-preview-sound" />;
  const url = resolveAssetUrl(asset);
  return <div className={`asset-preview${failed || url === undefined ? " asset-preview-fallback" : ""}`}>{url !== undefined && !failed && <img src={url} alt="" onError={() => setFailed(true)} />}</div>;
}

function SoundPreview({ asset }: { asset: Extract<Asset, { type: "sound" }> }) {
  const url = resolveAssetUrl(asset);
  return <section className="sound-preview">{url !== undefined && <audio controls src={url} key={asset.id + (asset.source.version ?? "")} aria-label={`Playback of ${asset.name}`} />}</section>;
}

function ImagePreview({ asset }: { asset: Extract<Asset, { type: "image" }> }) {
  const [failed, setFailed] = useState(false);
  const url = resolveAssetUrl(asset);
  return <section className="image-preview"><div className={`image-preview-frame${failed || url === undefined ? " asset-preview-fallback" : ""}`}>{url !== undefined && !failed && <img src={url} alt={`Preview of ${asset.name}`} onError={() => setFailed(true)} />}</div></section>;
}

/** Draws one atlas frame cropped out of the full texture, scaled to fit the canvas like `object-fit: contain`. */
function AtlasFrameCanvas({ atlas, frameName, width, height, className }: { atlas: AtlasAsset; frameName: string; width: number; height: number; className: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState(() => getCachedAtlasJson(atlas));
  const [image, setImage] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadEditorAtlasJson(atlas).then((loaded) => { if (!cancelled) setData(loaded); }).catch((error) => { console.warn(`Unable to load atlas JSON for '${atlas.id}'.`, error); if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [atlas]);

  useEffect(() => {
    const url = resolveAssetUrl(atlas);
    if (url === undefined) { setFailed(true); return; }
    const img = new Image();
    let cancelled = false;
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = url;
    return () => { cancelled = true; };
  }, [atlas]);

  const frame = data?.frames[frameName]?.frame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === undefined || frame === undefined) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / frame.w, canvas.height / frame.h);
    const drawWidth = frame.w * scale, drawHeight = frame.h * scale;
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  }, [image, frame]);

  const notReady = failed || image === undefined || frame === undefined;
  return <div className={`${className}${notReady ? " asset-preview-fallback" : ""}`}>{!notReady && <canvas ref={canvasRef} width={width} height={height} />}</div>;
}

function FramePreview({ atlas, frameName }: { atlas: AtlasAsset; frameName: string }) {
  return <section className="image-preview"><AtlasFrameCanvas atlas={atlas} frameName={frameName} width={220} height={180} className="image-preview-frame" /></section>;
}

function SpinePreview({ asset }: { asset: Extract<Asset, { type: "spine" }> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SkeletonData>();
  const [animation, setAnimation] = useState("");
  const [loop, setLoop] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playbackTime, setPlaybackTime] = useState({ current: 0, duration: 0 });
  const previewRef = useRef<{ app: Application; spine: ReturnType<typeof createSpineView>; attached: boolean; duration: number } | undefined>(undefined);
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const frameRate = data?.fps && data.fps > 0 ? data.fps : 60;
  const totalFrames = Math.max(1, Math.round(playbackTime.duration * frameRate));
  const currentFrame = Math.min(totalFrames - 1, Math.floor(playbackTime.current * frameRate)) + 1;
  useEffect(() => { let cancelled = false; void loadSpineAsset(asset, resolveFileUrl).then((loaded) => { if (!cancelled) { setData(loaded); setAnimation(loaded.animations[0]?.name || ""); } }).catch((error) => console.warn(`Unable to preview Spine asset '${asset.id}'.`, error)); return () => { cancelled = true; }; }, [asset]);
  useEffect(() => {
    if (hostRef.current === null || data === undefined) return;
    const app = new Application(); let cancelled = false; let initialized = false; let destroyed = false; let spine: ReturnType<typeof createSpineView> | undefined; let reportPlayback: (() => void) | undefined;
    const destroyApp = () => {
      if (destroyed) return;
      destroyed = true;
      if (reportPlayback !== undefined) app.ticker.remove(reportPlayback);
      if (spine !== undefined) {
        spine.removeFromParent();
        spine.destroy({ children: true, texture: false, textureSource: false });
        spine = undefined;
      }
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
    };
    void app.init({ width: 220, height: 180, backgroundAlpha: 0 }).then(() => {
      initialized = true;
      if (cancelled) return destroyApp();
      hostRef.current?.appendChild(app.canvas);
      const previewSpine = createSpineView(data, undefined, { autoUpdate: false, ticker: app.ticker });
      spine = previewSpine;
      previewRef.current = { app, spine: previewSpine, attached: false, duration: 0 };
      let lastReportedProgress = -1;
      reportPlayback = () => {
        const track = previewSpine.state.tracks[0]; const duration = previewRef.current?.duration ?? 0;
        if (track === null || track === undefined || duration <= 0) return;
        const time = track.loop ? track.trackTime % duration : Math.min(track.trackTime, duration);
        const nextProgress = Math.round((time / duration) * 100);
        if (nextProgress !== lastReportedProgress) {
          lastReportedProgress = nextProgress;
          setProgress(nextProgress);
          setPlaybackTime({ current: time, duration });
        }
      };
      app.ticker.add(reportPlayback);
      setPreviewGeneration((generation) => generation + 1);
    });
    return () => { cancelled = true; if (previewRef.current?.app === app) previewRef.current = undefined; if (initialized) destroyApp(); };
  }, [data]);
  useEffect(() => {
    const preview = previewRef.current; const selectedAnimation = animation ? data?.findAnimation(animation) : null;
    if (preview === undefined || selectedAnimation === null || selectedAnimation === undefined) return;
    preview.spine.state.setAnimation(0, selectedAnimation, loop);
    if (!preview.attached) {
      const bounds = preview.spine.getLocalBounds();
      const scale = Math.min(200 / Math.max(bounds.width, 1), 160 / Math.max(bounds.height, 1));
      preview.spine.scale.set(scale); preview.spine.position.set(110 - (bounds.x + bounds.width / 2) * scale, 90 - (bounds.y + bounds.height / 2) * scale);
      preview.app.stage.addChild(preview.spine); preview.attached = true; preview.spine.autoUpdate = true;
    }
    preview.duration = selectedAnimation.duration;
    setProgress(0); setPlaybackTime({ current: 0, duration: selectedAnimation.duration });
  }, [animation, data, loop, previewGeneration]);
  return <section className="spine-preview"><label>Preview animation <select value={animation} disabled={data === undefined} onChange={(event) => { setProgress(0); setPlaybackTime({ current: 0, duration: 0 }); setAnimation(event.target.value); }}>{data?.animations.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label className="spine-preview-loop"><input type="checkbox" checked={loop} onChange={(event) => { setProgress(0); setPlaybackTime({ current: 0, duration: playbackTime.duration }); setLoop(event.target.checked); }} /> Loop</label><div ref={hostRef} className="spine-preview-canvas" /><div className="spine-preview-progress-row"><progress className="spine-preview-progress" value={progress} max={100} aria-label="Animation progress" /><output>{playbackTime.current.toFixed(2)} / {playbackTime.duration.toFixed(2)}</output></div><output className="spine-preview-frames">Frames: {currentFrame} / {totalFrames}</output></section>;
}

type AssetRow = { kind: "asset"; asset: Asset } | { kind: "frame"; atlas: AtlasAsset; frameName: string; frameId: string };

/** Content of the first `.json` file whose shape matches a spritesheet (has `frames` and `meta`). */
async function findAtlasJsonFile(jsonFiles: File[]): Promise<{ file: File; frameNames: string[] } | undefined> {
  for (const file of jsonFiles) {
    try {
      const parsed = JSON.parse(await file.text()) as { frames?: Record<string, unknown>; meta?: unknown };
      if (parsed.frames !== undefined && typeof parsed.frames === "object" && parsed.meta !== undefined) return { file, frameNames: Object.keys(parsed.frames) };
    } catch {
      // Not JSON, or not shaped like a spritesheet: fall through to the image/font path.
    }
  }
  return undefined;
}

export function AssetPanel({ viewMode }: { viewMode: "list" | "compact" | "grid" }) {
  const assets = useEditorStore((state) => state.document.assets); const scenes = useEditorStore((state) => state.document.scenes); const prefabs = useEditorStore((state) => state.document.prefabs);
  const addImageAsset = useEditorStore((state) => state.addImageAsset); const addFontAsset = useEditorStore((state) => state.addFontAsset); const addSpineAsset = useEditorStore((state) => state.addSpineAsset); const addAtlasAsset = useEditorStore((state) => state.addAtlasAsset); const addSoundAsset = useEditorStore((state) => state.addSoundAsset); const replaceAssetSource = useEditorStore((state) => state.replaceAssetSource); const replaceSpineAssetFiles = useEditorStore((state) => state.replaceSpineAssetFiles); const deleteAsset = useEditorStore((state) => state.deleteAsset);
  const inputRef = useRef<HTMLInputElement>(null); const dragDepthRef = useRef(0); const [replaceAssetId, setReplaceAssetId] = useState<string | null>(null); const [isDragActive, setIsDragActive] = useState(false); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedAtlasIds, setExpandedAtlasIds] = useState<Set<string>>(() => new Set());
  const toggleAtlasExpanded = (atlasId: string) => setExpandedAtlasIds((current) => { const next = new Set(current); if (next.has(atlasId)) next.delete(atlasId); else next.add(atlasId); return next; });

  const importFiles = async (files: File[], assetIdToReplace: string | null) => {
    const spineMode = files.some((file) => extension(file.name) === ".atlas");
    if (spineMode) {
      const json = files.filter((file) => extension(file.name) === ".json"), atlas = files.filter((file) => extension(file.name) === ".atlas"), textures = files.filter((file) => imageExtension.test(file.name));
      const target = assetIdToReplace === null ? undefined : assets.find((asset) => asset.id === assetIdToReplace);
      if (json.length !== 1 || atlas.length !== 1 || textures.length < 1 || (target !== undefined && target.type !== "spine")) { window.alert("Spine import needs exactly one .json, exactly one .atlas, and at least one PNG or WebP texture."); return; }
      try { const [skeleton, atlasFile, ...textureFiles] = await Promise.all([json[0]!, atlas[0]!, ...textures].map(readFile)); const bundle = { skeleton, atlas: atlasFile, textures: textureFiles }; if (target === undefined) addSpineAsset(assetNameFromFile(json[0]!.name), bundle); else { clearEditorSpineCache(target.files.skeleton.uri); replaceSpineAssetFiles(target.id, bundle); } } catch (error) { console.warn("Unable to import Spine files.", error); window.alert("The Spine files could not be read."); }
      setReplaceAssetId(null); return;
    }

    const jsonFiles = files.filter((file) => extension(file.name) === ".json");
    const atlasJsonFile = jsonFiles.length > 0 ? await findAtlasJsonFile(jsonFiles) : undefined;
    if (atlasJsonFile !== undefined) {
      const textures = files.filter((file) => imageExtension.test(file.name));
      if (assetIdToReplace !== null) { window.alert("Atlas replace comes in a later task."); setReplaceAssetId(null); return; }
      if (textures.length !== 1) { window.alert("Atlas import needs exactly one spritesheet .json and exactly one PNG, WebP, or JPG texture."); return; }
      if (textures[0]!.size > MAX_ATLAS_TEXTURE_SIZE_BYTES) { window.alert(`'${textures[0]!.name}' exceeds the 16 MB atlas texture limit.`); return; }
      try {
        const [json, texture] = await Promise.all([readFile(atlasJsonFile.file), readFile(textures[0]!)]);
        addAtlasAsset(assetNameFromFile(atlasJsonFile.file.name), { json, texture }, atlasJsonFile.frameNames);
      } catch (error) { console.warn("Unable to import atlas files.", error); window.alert("The atlas files could not be read."); }
      return;
    }

    if (assetIdToReplace !== null && files.length !== 1) { window.alert("Image replacement requires exactly one image file."); return; }
    for (const file of files) {
      if (isSound(file)) {
        if (assetIdToReplace !== null && assets.find((asset) => asset.id === assetIdToReplace)?.type !== "sound") { window.alert("A sound can only replace a sound asset."); continue; }
        const mediaType = soundMediaType(file);
        if (mediaType === "application/octet-stream") { window.alert(`'${file.name}' is not a supported audio format.`); continue; }
        if (file.size > MAX_SOUND_SIZE_BYTES) { window.alert(`'${file.name}' exceeds the 10 MB sound limit.`); continue; }
        try { const source = await readFile(file); if (assetIdToReplace === null) addSoundAsset(assetNameFromFile(file.name), { uri: source.uri, mediaType }); else replaceAssetSource(assetIdToReplace, { uri: source.uri, mediaType }); } catch (error) { console.warn(`Unable to import '${file.name}'.`, error); }
        continue;
      }
      const isFont = ACCEPTED_FONT_TYPES.has(file.type) || fontExtension.test(file.name);
      if (isFont) {
        if (assetIdToReplace !== null && assets.find((asset) => asset.id === assetIdToReplace)?.type !== "font") { window.alert("A font can only replace a font asset."); continue; }
        try { const source = await readFile(file); const mediaType = fontMediaType(file); if (assetIdToReplace === null) addFontAsset(assetNameFromFile(file.name), assetNameFromFile(file.name), "normal", "normal", { uri: source.uri, mediaType }); else replaceAssetSource(assetIdToReplace, { uri: source.uri, mediaType }); } catch (error) { console.warn(`Unable to import '${file.name}'.`, error); }
        continue;
      }
      if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) { window.alert(`'${file.name}' is not a supported image up to 2 MB.`); continue; }
      if (assetIdToReplace !== null && assets.find((asset) => asset.id === assetIdToReplace)?.type !== "image") { window.alert("An image can only replace an image asset."); continue; }
      try { const source = await readFile(file); if (assetIdToReplace === null) addImageAsset(assetNameFromFile(file.name), { uri: source.uri, mediaType: source.mediaType }); else replaceAssetSource(assetIdToReplace, { uri: source.uri, mediaType: source.mediaType }); } catch (error) { console.warn(`Unable to import '${file.name}'.`, error); }
    }
    setReplaceAssetId(null);
  };
  const upload = (event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void importFiles(files, replaceAssetId); };
  const hasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes("Files");
  const drop = (event: DragEvent<HTMLElement>) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepthRef.current = 0; setIsDragActive(false); void importFiles([...event.dataTransfer.files], null); };

  // Sum of usage counts per assetId/frameId, computed once: an atlas's own usage is the sum over its frames.
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const owner of [...scenes, ...prefabs]) for (const node of owner.nodes) for (const id of collectNodeAssetIds(node)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [scenes, prefabs]);
  const usageOf = (id: string) => usageCounts.get(id) ?? 0;
  const atlasUsage = (atlas: AtlasAsset) => Object.values(atlas.frames).reduce((total, frameId) => total + usageOf(frameId), 0);

  const rows = useMemo(() => {
    const result: AssetRow[] = [];
    for (const asset of assets) {
      result.push({ kind: "asset", asset });
      if (asset.type === "atlas" && expandedAtlasIds.has(asset.id)) {
        for (const [frameName, frameId] of Object.entries(asset.frames)) result.push({ kind: "frame", atlas: asset, frameName, frameId });
      }
    }
    return result;
  }, [assets, expandedAtlasIds]);

  const selectedAsset = assets.find((asset) => asset.id === selectedId);
  const selectedFrame = selectedAsset === undefined ? rows.find((row): row is Extract<AssetRow, { kind: "frame" }> => row.kind === "frame" && row.frameId === selectedId) : undefined;

  const rowClassName = viewMode === "grid" ? "asset-grid-tile" : viewMode === "compact" ? "asset-compact-row" : "asset-row";
  return <section className={`asset-panel${isDragActive ? " asset-panel-drop-active" : ""}`} aria-label="Assets" onDragEnter={(event) => { if (hasFiles(event)) { dragDepthRef.current += 1; setIsDragActive(true); } }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (hasFiles(event) && --dragDepthRef.current <= 0) { dragDepthRef.current = 0; setIsDragActive(false); } }} onDrop={drop}>
    <input ref={inputRef} type="file" multiple accept=".json,.atlas,image/png,image/jpeg,image/webp,.woff2,.woff,.ttf,.otf,.wav,.mp3,.ogg,.aac,.m4a,audio/*" onChange={upload} /><p className="asset-panel-drop-hint">Drop images, fonts, sounds, a spritesheet JSON + texture, or a Spine bundle here</p>
    <ul className={`asset-list asset-list-${viewMode}`}>{rows.map((row) => {
      if (row.kind === "frame") {
        const usage = usageOf(row.frameId);
        return <li key={row.frameId} draggable className={`${rowClassName} asset-frame-row${selectedId === row.frameId ? " asset-selected" : ""}`} onDragStart={(event) => { event.dataTransfer.setData("application/x-pixi-ui-editor-asset", row.frameId); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => setSelectedId(row.frameId)}>
          {viewMode !== "compact" && <AtlasFrameCanvas atlas={row.atlas} frameName={row.frameName} width={96} height={96} className="asset-preview" />}
          <div className="asset-details"><span className="asset-name" title={row.frameName}>{row.frameName}{viewMode === "list" ? ` (${usage})` : ""}</span><span className="asset-type">frame</span></div>
          {viewMode === "grid" && <span className="asset-usage">Used by {usage} node{usage === 1 ? "" : "s"}</span>}
        </li>;
      }
      const asset = row.asset;
      const isAtlas = asset.type === "atlas";
      const usage = isAtlas ? atlasUsage(asset) : usageOf(asset.id);
      const expanded = isAtlas && expandedAtlasIds.has(asset.id);
      return <li key={asset.id} draggable className={`${rowClassName}${selectedId === asset.id ? " asset-selected" : ""}`} onDragStart={(event) => { event.dataTransfer.setData("application/x-pixi-ui-editor-asset", asset.id); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => setSelectedId(asset.id)}>
        {isAtlas && <button type="button" className="atlas-expand-toggle" aria-label={expanded ? `Collapse ${asset.name}` : `Expand ${asset.name}`} aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); toggleAtlasExpanded(asset.id); }}>{expanded ? "▾" : "▸"}</button>}
        {viewMode !== "compact" && <AssetPreview asset={asset} />}
        <div className="asset-details"><span className="asset-name" title={asset.name}>{asset.name}{viewMode === "list" ? ` (${usage})` : ""}</span><span className="asset-type">{asset.type}{isAtlas ? ` · ${Object.keys(asset.frames).length} frames` : ""}</span></div>
        {viewMode === "grid" && <span className="asset-usage">Used by {usage} node{usage === 1 ? "" : "s"}</span>}
        <div className="asset-actions">
          <button type="button" disabled={isAtlas} title={isAtlas ? "Replace comes in a later task" : undefined} onClick={(event) => { event.stopPropagation(); setReplaceAssetId(asset.id); inputRef.current?.click(); }}>Replace</button>
          <button type="button" disabled={usage > 0} title={usage ? `Used by ${usage} node(s)` : undefined} onClick={(event) => { event.stopPropagation(); deleteAsset(asset.id); }}>Delete</button>
        </div>
      </li>;
    })}</ul>
    {selectedAsset?.type === "image" && <ImagePreview asset={selectedAsset} />}
    {selectedAsset?.type === "sound" && <SoundPreview asset={selectedAsset} />}
    {selectedAsset?.type === "spine" && <SpinePreview key={selectedAsset.id} asset={selectedAsset} />}
    {selectedAsset?.type === "atlas" && <ImagePreview asset={{ id: selectedAsset.id, name: selectedAsset.name, type: "image", source: { uri: selectedAsset.files.texture.uri, mediaType: selectedAsset.files.texture.mediaType } }} />}
    {selectedFrame !== undefined && <FramePreview key={selectedFrame.frameId} atlas={selectedFrame.atlas} frameName={selectedFrame.frameName} />}
  </section>;
}

export function AssetsWindow() { const position = useUiPrefsStore((state) => state.assetsWindowPosition); const size = useUiPrefsStore((state) => state.assetsWindowSize); const assetsViewMode = useUiPrefsStore((state) => state.assetsViewMode); const setOpen = useUiPrefsStore((state) => state.setAssetsWindowOpen); const setPosition = useUiPrefsStore((state) => state.setAssetsWindowPosition); const setSize = useUiPrefsStore((state) => state.setAssetsWindowSize); const setView = useUiPrefsStore((state) => state.setAssetsViewMode); return <FloatingWindow ariaLabel="Assets" className="assets-window" title="Assets" titleActions={<div className="assets-view-mode-toggle" role="group" aria-label="Asset view mode">{(["compact", "list", "grid"] as const).map((mode, index) => <button key={mode} type="button" className={assetsViewMode === mode ? "assets-view-mode-active" : ""} aria-pressed={assetsViewMode === mode} onClick={() => setView(mode)}>{["≡", "☷", "▦"][index]}</button>)}</div>} position={position} size={size} minSize={{ width: 240, height: 180 }} onPositionChange={setPosition} onSizeChange={setSize} onClose={() => setOpen(false)}><AssetPanel viewMode={assetsViewMode} /></FloatingWindow>; }
