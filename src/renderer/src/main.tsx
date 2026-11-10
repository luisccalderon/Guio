import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { call } from "./api";
import { initTheme } from "./theme";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}

void initTheme(() => call("getSettings", {})).finally(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
