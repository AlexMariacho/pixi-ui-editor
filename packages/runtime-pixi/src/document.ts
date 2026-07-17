import { migrateProjectDocument, type ProjectDocument } from "@pixi-ui-editor/schema";

export class ProjectDocumentJsonParseError extends Error {
  readonly code = "INVALID_JSON";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectDocumentJsonParseError";
  }
}

export function loadProjectDocument(input: unknown): ProjectDocument {
  return migrateProjectDocument(input);
}

export function parseProjectDocumentJson(json: string): ProjectDocument {
  try {
    return loadProjectDocument(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ProjectDocumentJsonParseError("Unable to parse ProjectDocument JSON.", { cause: error });
    throw error;
  }
}
