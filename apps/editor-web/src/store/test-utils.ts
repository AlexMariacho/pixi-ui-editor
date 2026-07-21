import { afterEach, vi } from "vitest";
import { useEditorStore } from "./index.js";

/** Store commands need a small stable hierarchy; production sample topology is intentionally richer. */
export const imageNodeId = "10000000-0000-4000-8000-000000000051";
export const textNodeId = "10000000-0000-4000-8000-000000000006";
export const initialDocument = (() => {
  const document = structuredClone(useEditorStore.getState().document);
  const scene = document.scenes[0]!;
  const root = scene.nodes.find((node) => node.id === scene.rootNodeIds[0])!;
  const image = scene.nodes.find((node) => node.id === imageNodeId)!;
  const text = scene.nodes.find((node) => node.id === textNodeId)!;
  if (image.type !== "image" || text.type !== "text") throw new Error("Store test fixture nodes must retain their expected types.");
  image.parentId = root.id; image.children = []; image.name = "Logo"; image.assetId = "10000000-0000-4000-8000-000000000005"; image.transform = { x: 240, y: 180, width: 320, height: 160, scaleX: 1, scaleY: 1, rotation: 0 }; delete image.layoutOverrides;
  text.parentId = root.id; text.children = []; text.name = "Text"; text.transform = { x: 120, y: 420, width: 400, height: 120, scaleX: 1, scaleY: 1, rotation: 0 }; delete text.layoutOverrides;
  root.children = [image.id, text.id];
  scene.nodes = [root, image, text];
  document.effects = [];
  return document;
})();

useEditorStore.setState({ document: structuredClone(initialDocument), sceneId: initialDocument.scenes[0]!.id });

afterEach(() => {
  useEditorStore.setState({
    document: structuredClone(initialDocument),
    sceneId: initialDocument.scenes[0]!.id,
    activeProfile: "desktop",
    selectedNodeIds: [],
    selectedNodeId: null,
    editingPrefabId: null,
  });
  vi.unstubAllGlobals();
});
