/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy third-party libs out of the main app bundle. React Flow
        // alone is ~150 kB gzipped; isolating it keeps the app code chunk
        // smaller and lets the browser cache vendor code separately when our
        // own code changes.
        manualChunks: {
          react: ["react", "react-dom"],
          reactflow: ["reactflow"],
          dagre: ["dagre"],
          zod: ["zod"],
          zustand: ["zustand", "zundo"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
