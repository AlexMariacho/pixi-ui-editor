import { useEffect, useRef, useState } from "react";
import { buildSceneView, createSceneAudioPlayback, loadProjectSounds, loadSceneFonts, loadSceneSpines, loadSceneTextures, updateParticleEmitters, type SkeletonData, type Sound } from "@pixi-ui-editor/runtime-pixi";
import type { LayoutProfileId, ProjectDocument } from "@pixi-ui-editor/schema";
import { Application, Container, type Spritesheet, type Texture } from "pixi.js";
import { resolveFileUrl } from "../../shared/assets.js";

const PREVIEW_ROUTE = "runtime";
const PREVIEW_READY = "pixi-ui-editor:preview-ready";
const PREVIEW_DOCUMENT = "pixi-ui-editor:preview-document";

export type PreviewPayload = {
  document: ProjectDocument;
  sceneId: string;
  profile: LayoutProfileId;
};

type PreviewReadyMessage = { type: typeof PREVIEW_READY; token: string };
type PreviewDocumentMessage = { type: typeof PREVIEW_DOCUMENT; token: string; payload: PreviewPayload };
type PreviewSession = { token: string; window: Window; payload: PreviewPayload };

const previewSessions = new Map<string, PreviewSession>();

export function isRuntimePreviewRoute(): boolean {
  return new URLSearchParams(window.location.search).get("preview") === PREVIEW_ROUTE;
}

export function getPreviewWindowFeatures(viewport: { width: number; height: number }): string {
  return `popup=yes,width=${Math.max(1, Math.round(viewport.width / 2))},height=${Math.max(1, Math.round(viewport.height / 2))},resizable=yes`;
}

export function openRuntimePreview(payload: PreviewPayload, viewport: { width: number; height: number }): boolean {
  const token = crypto.randomUUID();
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("preview", PREVIEW_ROUTE);
  url.searchParams.set("token", token);

  const previewWindow = window.open(url, `pixi-ui-preview-${token}`, getPreviewWindowFeatures(viewport));
  if (previewWindow === null) return false;
  const session: PreviewSession = { token, window: previewWindow, payload };
  previewSessions.set(token, session);

  const sendDocument = (event: MessageEvent) => {
    const message = event.data as Partial<PreviewReadyMessage> | null;
    if (event.origin !== window.location.origin || event.source !== previewWindow || message?.type !== PREVIEW_READY || message.token !== token) return;
    const response: PreviewDocumentMessage = { type: PREVIEW_DOCUMENT, token, payload: session.payload };
    previewWindow.postMessage(response, window.location.origin);
  };
  const closedWindowTimer = window.setInterval(() => {
    if (!previewWindow.closed) return;
    window.removeEventListener("message", sendDocument);
    window.clearInterval(closedWindowTimer);
    previewSessions.delete(token);
  }, 500);
  window.addEventListener("message", sendDocument);
  return true;
}

/** Rebuilds open previews only for explicit editor navigation/profile changes, never for browser resize. */
export function updateRuntimePreviews(payload: PreviewPayload): void {
  for (const [token, session] of previewSessions) {
    if (session.window.closed) {
      previewSessions.delete(token);
      continue;
    }
    session.payload = payload;
    const message: PreviewDocumentMessage = { type: PREVIEW_DOCUMENT, token, payload };
    session.window.postMessage(message, window.location.origin);
  }
}

export function RuntimePreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token === null || window.opener === null) {
      setError("Open Preview from the Pixi UI Editor.");
      return;
    }

    let disposed = false;
    let initialized = false;
    let payload: PreviewPayload | undefined;
    let sceneRoot: Container | undefined;
    let particleTicker: ((ticker: { deltaMS: number }) => void) | undefined;
    let buildToken = 0;
    let layoutFrame = 0;
    const app = new Application();
    const textureCache = new Map<string, Texture>();
    const spineCache = new Map<string, SkeletonData>();
    const atlasSpritesheetCache = new Map<string, Spritesheet>();
    const soundCache = new Map<string, Sound>();
    const audioPlayback = createSceneAudioPlayback();

    const layoutScene = () => {
      if (payload === undefined || sceneRoot === undefined) return;
      const currentPayload = payload;
      const scene = currentPayload.document.scenes.find((candidate) => candidate.id === currentPayload.sceneId);
      if (scene === undefined) return;
      const viewport = scene.layout.referenceViewports[currentPayload.profile];
      const scale = Math.min(window.innerWidth / viewport.width, window.innerHeight / viewport.height);
      sceneRoot.scale.set(scale);
      sceneRoot.position.set(
        (window.innerWidth - viewport.width * scale) / 2,
        (window.innerHeight - viewport.height * scale) / 2,
      );
    };

    const rebuildScene = async () => {
      if (!initialized || payload === undefined) return;
      const currentPayload = payload;
      const tokenAtStart = ++buildToken;
      try {
        const [textures, spines, fonts, sounds] = await Promise.all([
          loadSceneTextures(currentPayload.document, currentPayload.sceneId, (asset) => asset.type === "image" ? resolveFileUrl(asset.source.uri) : undefined, resolveFileUrl, textureCache, atlasSpritesheetCache),
          loadSceneSpines(currentPayload.document, currentPayload.sceneId, resolveFileUrl, spineCache),
          loadSceneFonts(currentPayload.document, currentPayload.sceneId, resolveFileUrl),
          loadProjectSounds(currentPayload.document, resolveFileUrl, soundCache),
        ]);
        // Preview — не authoring-поверхность: контролы получают настоящие pointer events.
        const { root } = buildSceneView(currentPayload.document, currentPayload.sceneId, currentPayload.profile, { interaction: "runtime", textures, spines, fonts, sounds });
        if (disposed || tokenAtStart !== buildToken) {
          root.destroy({ children: true });
          return;
        }
        if (sceneRoot !== undefined) {
          if (particleTicker !== undefined) app.ticker.remove(particleTicker);
          app.stage.removeChild(sceneRoot);
          sceneRoot.destroy({ children: true });
        }
        sceneRoot = root;
        app.stage.addChild(root);
        particleTicker = (ticker) => updateParticleEmitters(root, ticker.deltaMS / 1_000);
        app.ticker.add(particleTicker);
        layoutScene();
        const scene = currentPayload.document.scenes.find((candidate) => candidate.id === currentPayload.sceneId);
        audioPlayback.update(scene?.audio, sounds);
        setError(undefined);
      } catch (cause) {
        console.error("Unable to render runtime preview.", cause);
        setError("Unable to render runtime preview. See the console for details.");
      }
    };

    const onMessage = (event: MessageEvent) => {
      const message = event.data as Partial<PreviewDocumentMessage> | null;
      if (event.origin !== window.location.origin || event.source !== window.opener || message?.type !== PREVIEW_DOCUMENT || message.token !== token || message.payload === undefined) return;
      payload = message.payload;
      document.title = `${payload.document.project.name} - Runtime Preview`;
      void rebuildScene();
    };

    const onResize = () => {
      if (layoutFrame !== 0) window.cancelAnimationFrame(layoutFrame);
      layoutFrame = window.requestAnimationFrame(() => {
        layoutFrame = 0;
        layoutScene();
      });
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    const readyMessage: PreviewReadyMessage = { type: PREVIEW_READY, token };
    const requestDocument = () => window.opener?.postMessage(readyMessage, window.location.origin);
    const readyTimer = window.setInterval(() => {
      if (payload === undefined) requestDocument();
      else window.clearInterval(readyTimer);
    }, 250);
    requestDocument();

    void app.init({ resizeTo: window, background: 0x101018, antialias: true }).then(() => {
      if (disposed) {
        app.destroy();
        return;
      }
      initialized = true;
      hostRef.current?.appendChild(app.canvas);
      void rebuildScene();
    }).catch((cause) => {
      console.error("Unable to initialize runtime preview.", cause);
      setError("Unable to initialize runtime preview. See the console for details.");
    });

    return () => {
      disposed = true;
      buildToken += 1;
      if (layoutFrame !== 0) window.cancelAnimationFrame(layoutFrame);
      window.clearInterval(readyTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      audioPlayback.stop();
      if (sceneRoot !== undefined) {
        if (particleTicker !== undefined) app.ticker.remove(particleTicker);
        app.stage.removeChild(sceneRoot);
        sceneRoot.destroy({ children: true });
      }
      if (initialized) app.destroy();
    };
  }, []);

  return <main ref={hostRef} className="runtime-preview">{error !== undefined && <p className="runtime-preview-error">{error}</p>}</main>;
}
