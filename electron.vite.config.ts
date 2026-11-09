import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { contentSecurityPolicy } from "./src/shared/csp";

function injectContentSecurityPolicy(): Plugin {
  let mode: "development" | "production" = "production";
  return {
    name: "guio-content-security-policy",
    configResolved(config) {
      mode = config.command === "serve" ? "development" : "production";
    },
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy(mode) },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rolldownOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
  },
  preload: {
    build: {
      // A sandboxed preload cannot load ES modules or any file other than "electron".
      externalizeDeps: false,
      rolldownOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [injectContentSecurityPolicy()],
    build: {
      rolldownOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } },
    },
  },
});
