import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import App from "./App";
import "./styles.css";
import "./structure-workflow.css";
import "./graph-interactions.css";
import "./inference-results.css";
import "./workbench-design.css";
import "./workbench-states.css";
import "./data-dropzone.css";
import "./red-theme.css";
import "./readability.css";
import "./conversation-mode.css";
import "./conversation-mode-fixes.css";
import "./conversation-user-alignment.css";
import "./conversation-graph-preview.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
