import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8787,
  },
  ssr: {
    resolve: {
      conditions: ["worker", "import", "module", "default"],
    },
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
  ],
});
