import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/App";
import { CollabProvider } from "@/api";
import "./index.css";
import "reactflow/dist/style.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CollabProvider>
      <App />
    </CollabProvider>
  </React.StrictMode>,
);
