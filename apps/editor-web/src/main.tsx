import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { isRuntimePreviewRoute, RuntimePreview } from "./panels/preview/RuntimePreview.js";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Editor root element is missing.");
}

createRoot(rootElement).render(isRuntimePreviewRoute()
  ? <RuntimePreview />
  : <StrictMode><App /></StrictMode>);
