import { Sound, type IMediaInstance } from "@pixi/sound";
import type { ProjectDocument, Scene } from "@pixi-ui-editor/schema";
import { collectRenderedNodes } from "../scene.js";
import { collectNodeAssetIds } from "../views/createNodeView.js";
import type { FileUrlResolver } from "./textures.js";

async function loadSound(source: ArrayBuffer): Promise<Sound> {
  return new Promise((resolve, reject) => {
    let created: Sound;
    try {
      created = Sound.from({
        source,
        preload: true,
        // @pixi/sound's runtime uses the Node-style `null` success value although its declaration
        // only mentions Error. Accept both null and undefined or every successful decode is rejected.
        loaded: (error, loaded) => error == null ? resolve(loaded ?? created) : reject(error),
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function loadSoundAssets(
  document: ProjectDocument,
  ids: Iterable<string>,
  resolveFileUrl: FileUrlResolver,
  cache: Map<string, Sound> = new Map(),
): Promise<Map<string, Sound>> {
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const sounds = new Map<string, Sound>();
  for (const assetId of ids) {
    const asset = assetsById.get(assetId);
    if (asset?.type !== "sound") continue;
    try {
      let loaded = cache.get(asset.source.uri);
      if (loaded === undefined) {
        const url = resolveFileUrl(asset.source.uri);
        if (url === undefined) continue;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Unable to fetch '${url}': ${response.status} ${response.statusText}`);
        loaded = await loadSound(await response.arrayBuffer());
        cache.set(asset.source.uri, loaded);
      }
      sounds.set(asset.id, loaded);
    } catch (error) {
      console.warn(`Unable to load sound for asset '${asset.id}'.`, error);
    }
  }
  return sounds;
}

/** Loads every sound asset up front, useful for an editor Preview whose assignments change live. */
export function loadProjectSounds(
  document: ProjectDocument,
  resolveFileUrl: FileUrlResolver,
  cache: Map<string, Sound> = new Map(),
): Promise<Map<string, Sound>> {
  return loadSoundAssets(document, document.assets.filter((asset) => asset.type === "sound").map((asset) => asset.id), resolveFileUrl, cache);
}

/** Loads the background track and button sounds used by one rendered scene. Failed assets stay silent. */
export async function loadSceneSounds(
  document: ProjectDocument,
  sceneId: string,
  resolveFileUrl: FileUrlResolver,
  cache: Map<string, Sound> = new Map(),
): Promise<Map<string, Sound>> {
  const scene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (scene === undefined) throw new Error(`Scene '${sceneId}' does not exist in the project document.`);
  const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const ids = new Set<string>();
  if (scene.audio?.backgroundMusicAssetId !== undefined) ids.add(scene.audio.backgroundMusicAssetId);
  for (const node of collectRenderedNodes(document, scene)) {
    for (const assetId of collectNodeAssetIds(node)) if (assetsById.get(assetId)?.type === "sound") ids.add(assetId);
  }
  return loadSoundAssets(document, ids, resolveFileUrl, cache);
}

export type SceneAudioPlayback = {
  update(audio: Scene["audio"], sounds: ReadonlyMap<string, Sound>): void;
  stop(): void;
};

/** Owns one scene's looping background track and retries browser-blocked autoplay on first input. */
export function createSceneAudioPlayback(): SceneAudioPlayback {
  let assetId: string | undefined;
  let currentSound: Sound | undefined;
  let currentInstance: IMediaInstance | undefined;
  let currentVolume = 1;
  let pendingStart: (() => void) | undefined;

  const removePendingStart = () => {
    if (pendingStart !== undefined && typeof window !== "undefined") window.removeEventListener("pointerdown", pendingStart);
    pendingStart = undefined;
  };
  const stopCurrent = () => {
    removePendingStart();
    currentSound?.stop();
    currentInstance = undefined;
    currentSound = undefined;
    assetId = undefined;
  };
  const audioContextIsSuspended = (sound: Sound) => {
    const context = sound.context as { audioContext?: { state?: string } };
    return context.audioContext?.state === "suspended";
  };
  const scheduleRetry = (start: () => void) => {
    if (typeof window === "undefined" || pendingStart !== undefined) return;
    pendingStart = () => {
      pendingStart = undefined;
      currentInstance?.stop();
      currentInstance = undefined;
      const context = (currentSound?.context as { audioContext?: { resume?: () => Promise<void> } } | undefined)?.audioContext;
      if (context?.resume !== undefined) void context.resume().finally(start);
      else start();
    };
    window.addEventListener("pointerdown", pendingStart, { once: true });
  };

  const playback: SceneAudioPlayback = {
    update(audio, sounds) {
      const nextAssetId = audio?.backgroundMusicAssetId;
      const nextSound = nextAssetId === undefined ? undefined : sounds.get(nextAssetId);
      const volume = audio?.volume ?? 1;
      currentVolume = volume;
      if (nextAssetId === undefined || nextSound === undefined) {
        stopCurrent();
        return;
      }
      if (assetId === nextAssetId && currentSound === nextSound) {
        if (currentInstance !== undefined) currentInstance.volume = currentVolume;
        return;
      }

      stopCurrent();
      assetId = nextAssetId;
      currentSound = nextSound;
      const start = () => {
        if (assetId !== nextAssetId || currentSound !== nextSound) return;
        removePendingStart();
        try {
          const result = nextSound.play({ loop: true, volume: currentVolume });
          if (result instanceof Promise) {
            void result.then((instance) => {
              if (assetId === nextAssetId && currentSound === nextSound) { currentInstance = instance; instance.volume = currentVolume; }
              else instance.stop();
            }).catch(() => scheduleRetry(start));
          } else {
            currentInstance = result;
            if (audioContextIsSuspended(nextSound)) scheduleRetry(start);
          }
        } catch {
          scheduleRetry(start);
        }
      };
      start();
    },
    stop: stopCurrent,
  };
  return playback;
}
