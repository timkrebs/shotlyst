/**
 * main.tsx — browser entry point. Mounts the app; everything else
 * (routing, data, theme) is wired in App so it can be rendered in tests.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
