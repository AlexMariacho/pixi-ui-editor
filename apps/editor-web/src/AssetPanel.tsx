import { useRef, useState, type ChangeEvent } from "react";
import type { Asset } from "@pixi-ui-editor/schema";
import { resolveAssetUrl } from "./assets.js";
import { useEditorStore } from "./store.js";

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

export function AssetPanel() {
  const assets = useEditorStore((state) => state.document.assets);
  const addImageAsset = useEditorStore((state) => state.addImageAsset);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;

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
      addImageAsset(assetNameFromFile(file.name), { uri: reader.result, mediaType: file.type });
    });
    reader.addEventListener("error", () => console.warn(`Cannot upload '${file.name}': the image could not be read.`));
    reader.readAsDataURL(file);
  };

  return (
    <section className="asset-panel" aria-labelledby="assets-heading">
      <div className="asset-panel-heading">
        <h2 id="assets-heading">Assets</h2>
        <button type="button" onClick={() => inputRef.current?.click()}>Upload</button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} />
      </div>
      <ul className="asset-list">
        {assets.map((asset) => (
          <li key={asset.id} className="asset-row">
            <AssetPreview asset={asset} />
            <div className="asset-details">
              <span className="asset-name" title={asset.name}>{asset.name}</span>
              <span className="asset-type">{asset.type}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
