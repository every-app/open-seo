import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = env.PORT ? Number(env.PORT) : 3001;
  const showDevtools = env.VITE_SHOW_DEVTOOLS !== "false";
  const allowedHosts = env.ALLOWED_HOST ? [env.ALLOWED_HOST] : undefined;

  return {
    envPrefix: ["VITE_", "AUTH_MODE", "POSTHOG_PUBLIC_KEY", "POSTHOG_HOST"],
    server: {
      port,
    },
    preview: {
      allowedHosts,
      port,
    },
    plugins: [
      showDevtools
        ? devtools({
            consolePiping: {
              enabled: true,
              levels: ["log", "warn", "error", "info", "debug"],
            },
          })
        : null,
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tsConfigPaths(),
      tanstackStart(),
      viteReact(),
      tailwindcss(),
    ],
  };
});
