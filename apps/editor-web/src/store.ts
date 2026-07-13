import { loadProjectDocument } from "@pixi-ui-editor/runtime-pixi";
import { validateProjectDocument, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { create } from "zustand";
import sampleJson from "../../../examples/sample-project/project.json";

export type EditorState = {
  document: ProjectDocument;
  sceneId: string;
  selectedNodeId: string | null;
  selectNode(id: string | null): void;
  updateNode(nodeId: string, patch: Partial<Pick<UINode, "name" | "visible" | "transform">> & { text?: string }): void;
};

const document = loadProjectDocument(sampleJson);
const firstScene = document.scenes[0];

if (firstScene === undefined) {
  throw new Error("The sample project must contain at least one scene.");
}

export const useEditorStore = create<EditorState>((set) => ({
  document,
  sceneId: firstScene.id,
  selectedNodeId: null,
  selectNode: (id) => set({ selectedNodeId: id }),
  updateNode: (nodeId, patch) => set((state) => {
    const candidate = structuredClone(state.document);
    const scene = candidate.scenes.find((candidateScene) => candidateScene.id === state.sceneId);
    const node = scene?.nodes.find((candidateNode) => candidateNode.id === nodeId);

    if (node === undefined) {
      console.warn(`Cannot update node '${nodeId}': it does not exist in the selected scene.`);
      return state;
    }

    if (patch.name !== undefined) node.name = patch.name;
    if (patch.visible !== undefined) node.visible = patch.visible;
    if (patch.transform !== undefined) node.transform = patch.transform;
    if (patch.text !== undefined && node.type === "text") node.text = patch.text;

    const validation = validateProjectDocument(candidate);
    if (!validation.valid) {
      console.warn("Node update was rejected because it makes the project document invalid.", validation.issues);
      return state;
    }

    return { document: candidate };
  }),
}));
