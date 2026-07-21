import {
  ButtonNodeView,
  buildSceneView,
  createSceneAudioPlayback,
  InputNodeView,
  ParticleEmitterNodeView,
  loadSceneFonts,
  loadSceneSounds,
  loadSceneSpines,
  loadSceneTextures,
  parseProjectDocumentJson,
  ProgressBarNodeView,
  resolveProfileForViewport,
  SliderNodeView,
  updateParticleEmitters,
  type SkeletonData,
  type Sound,
} from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument, Scene } from "@pixi-ui-editor/schema";
import { Application, Container, type Spritesheet, type Texture } from "pixi.js";
import "./styles.css";

const PACKAGE_ROOT = "./package/";
const resolvePackageFileUrl = (uri: string) => uri.startsWith("data:") ? uri : `${PACKAGE_ROOT}${uri}`;
const CONTROL_IDS = {
  reset: "10000000-0000-4000-8000-000000000021",
  input: "10000000-0000-4000-8000-000000000031",
  slider: "10000000-0000-4000-8000-000000000032",
  progress: "10000000-0000-4000-8000-000000000033",
  celebration: "10000000-0000-4000-8000-000000000063",
} as const;

function showHint(lines: string[]): void {
  const overlay = document.createElement("div");
  overlay.className = "package-hint";
  const article = document.createElement("article");
  for (const line of lines) {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = line;
    article.appendChild(paragraph);
  }
  overlay.appendChild(article);
  document.body.appendChild(overlay);
}

const MISSING_PACKAGE_HINT = [
  "<strong>No exported package found.</strong>",
  "Click <code>Export</code> in the Pixi UI Editor to download <code>&lt;projectName&gt;.zip</code>.",
  "Unpack the zip into <code>examples/pixi-app/public/package/</code> so that <code>public/package/project.json</code> exists.",
  "Reload this page. Pick a window with <code>?window=&lt;name or id&gt;</code>.",
];

async function fetchPackageDocument(): Promise<ProjectDocument | undefined> {
  let response: Response;
  try {
    response = await fetch(`${PACKAGE_ROOT}project.json`);
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  const text = await response.text();
  // Vite dev-сервер отвечает index.html вместо 404 на отсутствующий файл.
  if (text.trimStart().startsWith("<")) return undefined;
  return parseProjectDocumentJson(text);
}

function pickScene(projectDocument: ProjectDocument): Scene | undefined {
  const requested = new URLSearchParams(window.location.search).get("window");
  if (requested === null) return projectDocument.scenes[0];
  return projectDocument.scenes.find((scene) => scene.id === requested || scene.name === requested);
}

function createRuntimeStatus(): { element: HTMLElement; show(message: string): void } {
  const element = document.createElement("output");
  element.className = "runtime-status";
  document.body.appendChild(element);
  return {
    element,
    show(message) { element.textContent = message; },
  };
}

function findControl<T extends Container>(scene: Scene, nodeViews: ReadonlyMap<string, Container>, binding: string, stableId: string, expected: new (...args: never[]) => T): T {
  const node = scene.nodes.find((candidate) => candidate.binding === binding) ?? scene.nodes.find((candidate) => candidate.id === stableId);
  const view = node === undefined ? undefined : nodeViews.get(node.id);
  if (!(view instanceof expected)) throw new Error(`The sample package does not expose '${binding}' as ${expected.name}.`);
  return view;
}

async function main(): Promise<void> {
  let projectDocument: ProjectDocument | undefined;
  try {
    projectDocument = await fetchPackageDocument();
  } catch (error) {
    console.error("Unable to load the exported package.", error);
    showHint([
      "<strong>The package document could not be loaded.</strong>",
      "<code>public/package/project.json</code> exists but is not a valid project document. Re-export the package from the editor. See the console for details.",
    ]);
    return;
  }
  if (projectDocument === undefined) {
    showHint(MISSING_PACKAGE_HINT);
    return;
  }
  const packageDocument = projectDocument;

  const scene = pickScene(packageDocument);
  if (scene === undefined) {
    const windows = packageDocument.scenes.map((candidate) => candidate.name).join(", ");
    showHint(["<strong>Window not found.</strong>", `Available windows: ${windows === "" ? "none" : windows}.`]);
    return;
  }

  const app = new Application();
  await app.init({ resizeTo: window, background: 0x101018, antialias: true });
  document.body.appendChild(app.canvas);
  const status = createRuntimeStatus();
  const runtimeState = { name: "Designer", energy: 48 };
  status.show(`${runtimeState.name} · energy ${runtimeState.energy}`);

  let profile = resolveProfileForViewport(packageDocument.settings, window.innerWidth, window.innerHeight);
  let sceneRoot: Container | null = null;
  let particleTicker: ((ticker: { deltaMS: number }) => void) | undefined;
  let celebrationView: ParticleEmitterNodeView | undefined;
  let buildToken = 0;
  const textureCache = new Map<string, Texture>();
  const spineCache = new Map<string, SkeletonData>();
  const spritesheetCache = new Map<string, Spritesheet>();
  const soundCache = new Map<string, Sound>();
  const audioPlayback = createSceneAudioPlayback();

  // Scale-to-fit по меньшей стороне reference viewport активного профиля, с центрированием.
  const layoutSceneRoot = () => {
    if (sceneRoot === null) return;
    const viewport = scene.layout.referenceViewports[profile];
    const scale = Math.min(window.innerWidth, window.innerHeight) / Math.min(viewport.width, viewport.height);
    sceneRoot.scale.set(scale);
    sceneRoot.position.set((window.innerWidth - viewport.width * scale) / 2, (window.innerHeight - viewport.height * scale) / 2);
  };

  const rebuildScene = async () => {
    const token = ++buildToken;
    const [textures, spines, fonts, sounds] = await Promise.all([
      loadSceneTextures(packageDocument, scene.id, (asset) => asset.type === "image" ? resolvePackageFileUrl(asset.source.uri) : undefined, resolvePackageFileUrl, textureCache, spritesheetCache),
      loadSceneSpines(packageDocument, scene.id, resolvePackageFileUrl, spineCache),
      loadSceneFonts(packageDocument, scene.id, resolvePackageFileUrl),
      loadSceneSounds(packageDocument, scene.id, resolvePackageFileUrl, soundCache),
    ]);
    const { root, nodeViews } = buildSceneView(packageDocument, scene.id, profile, { interaction: "runtime", textures, spines, fonts, sounds });
    if (token !== buildToken) {
      root.destroy({ children: true });
      return;
    }
    const reset = findControl(scene, nodeViews, "controls.reset", CONTROL_IDS.reset, ButtonNodeView);
    const input = findControl(scene, nodeViews, "controls.playerName", CONTROL_IDS.input, InputNodeView);
    const slider = findControl(scene, nodeViews, "controls.energy", CONTROL_IDS.slider, SliderNodeView);
    const progress = findControl(scene, nodeViews, "display.energy", CONTROL_IDS.progress, ProgressBarNodeView);
    const celebration = findControl(scene, nodeViews, "effects.celebration", CONTROL_IDS.celebration, ParticleEmitterNodeView);

    input.value = runtimeState.name;
    slider.value = runtimeState.energy;
    progress.progress = runtimeState.energy;
    input.onChange.connect((value) => {
      runtimeState.name = value;
      status.show(`${runtimeState.name || "Anonymous"} · energy ${runtimeState.energy}`);
    });
    input.onEnter.connect((value) => status.show(`Entered: ${value || "Anonymous"} · energy ${runtimeState.energy}`));
    slider.onUpdate.connect((value) => {
      runtimeState.energy = value;
      progress.progress = value;
      status.show(`${runtimeState.name || "Anonymous"} · energy ${value}`);
    });
    reset.onPress.connect(() => {
      runtimeState.name = "Designer";
      runtimeState.energy = 48;
      input.value = runtimeState.name;
      slider.value = runtimeState.energy;
      progress.progress = runtimeState.energy;
      status.show("Runtime values reset · document unchanged");
    });

    reset.onPress.connect(() => celebration.restart());
    celebrationView = celebration;

    if (sceneRoot !== null && particleTicker !== undefined) app.ticker.remove(particleTicker);
    sceneRoot?.destroy({ children: true });
    sceneRoot = root;
    app.stage.addChild(root);
    particleTicker = (ticker) => updateParticleEmitters(root, ticker.deltaMS / 1_000);
    app.ticker.add(particleTicker);
    layoutSceneRoot();
    audioPlayback.update(scene.audio, sounds);
  };

  window.addEventListener("resize", () => {
    const nextProfile = resolveProfileForViewport(packageDocument.settings, window.innerWidth, window.innerHeight);
    if (nextProfile !== profile) {
      profile = nextProfile;
      void rebuildScene();
    } else {
      layoutSceneRoot();
    }
  });

  // Generic demo command: stop() lets already-emitted celebration particles drain instead of an
  // instant clear, distinguishing it visually from restart()'s immediate reset.
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "s" || celebrationView === undefined) return;
    celebrationView.stop();
    status.show(`${runtimeState.name || "Anonymous"} · energy ${runtimeState.energy} · celebration stopping (press Reset to restart)`);
  });

  await rebuildScene();
}

void main();
