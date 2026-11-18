import { defineConfig } from "vite";

// The report widget bundle: the one script the report sandbox lets run. Built
// separately from the app so it ships as a plain, versioned file under
// src/public/report-widgets/ that the viewer injects into every report with a
// per-response nonce (see src/shared/report-sandbox.ts). Leaflet and its
// stylesheet are bundled in, so a report never loads anything else.
export default defineConfig({
  // The bundle lands inside src/public/; copying that into itself is not wanted.
  publicDir: false,
  build: {
    lib: {
      entry: "src/report-widgets/rank-grid.ts",
      name: "OpenSeoReportWidgets",
      formats: ["iife"],
      fileName: () => "v1.js",
    },
    outDir: "src/public/report-widgets",
    emptyOutDir: true,
    sourcemap: false,
    // Leaflet's control icons are a few hundred bytes each; inline them so the
    // stylesheet has no external references left.
    assetsInlineLimit: 16384,
  },
});
