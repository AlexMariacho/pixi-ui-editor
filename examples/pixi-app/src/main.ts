import { loadSceneView, parseProjectDocumentJson, resolveProfileForViewport } from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument, Scene } from "@pixi-ui-editor/schema";
import { Application, Container } from "pixi.js";
import "./styles.css";

const PACKAGE_ROOT = "./package/";
const resolvePackageFileUrl = (uri: string) => `${PACKAGE_ROOT}${uri}`;

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

  let profile = resolveProfileForViewport(packageDocument.settings, window.innerWidth, window.innerHeight);
  let sceneRoot: Container | null = null;
  let buildToken = 0;

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
    const { root } = await loadSceneView(packageDocument, scene.id, profile, resolvePackageFileUrl);
    if (token !== buildToken) {
      root.destroy({ children: true });
      return;
    }
    sceneRoot?.destroy({ children: true });
    sceneRoot = root;
    app.stage.addChild(root);
    layoutSceneRoot();
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

  await rebuildScene();
}

void main();
