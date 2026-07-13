import { loadProjectDocument } from "@pixi-ui-editor/runtime-pixi";
import type { ProjectDocument } from "@pixi-ui-editor/schema";
import { create } from "zustand";
import sampleJson from "../../../examples/sample-project/project.json";

export type EditorState = {
  document: ProjectDocument;
  sceneId: string;
  selectedNodeId: string | null;
  selectNode(id: string | null): void;
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
}));
