import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const fromRoot = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot("src"),
  envDir: fromRoot("."),
  base: "./",
  build: {
    outDir: fromRoot("dist"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        sidepanel: fromRoot("src/sidepanel.html"),
        background: fromRoot("src/background.ts"),
      },
      output: {
        // Stable names: manifest.json points at background.js and sidepanel.html.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [
    {
      name: "emit-extension-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: readFileSync(fromRoot("manifest.json")),
        });
      },
    },
  ],
});
