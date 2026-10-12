import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import { leanWorkerBundle } from "./vite-plugin-lean-worker-bundle";

export default defineConfig(({ mode, command }) => {
  // Vitest sets mode to "test". Return a config without the Cloudflare and
  // TanStack Start plugins so unit tests never boot workerd or the SSR dev
  // server; only the tsconfig path alias is needed.
  if (mode === "test") {
    return {
      plugins: [tsConfigPaths()],
      test: {
        environment: "node",
        include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        restoreMocks: true,
        clearMocks: true,
        server: {
          deps: {
            // Processed by vitest (instead of loaded natively by node) so the
            // oauth-refresh e2e test's cloudflare:workers mock reaches the real
            // provider module.
            inline: ["@cloudflare/workers-oauth-provider"],
          },
        },
      },
    };
  }

  const env = loadEnv(mode, process.cwd(), "");
  const port = process.env.PORT
    ? Number(process.env.PORT)
    : env.PORT
      ? Number(env.PORT)
      : 3001;
  const showDevtools = env.VITE_SHOW_DEVTOOLS !== "false";
  const allowedHosts = [
    env.ALLOWED_HOST,
    env.BETTER_AUTH_URL ? new URL(env.BETTER_AUTH_URL).hostname : undefined,
  ].filter((host): host is string => Boolean(host));
  const emitSourcemaps = env.POSTHOG_SOURCEMAPS === "true";

  return {
    // Static files (favicons, manifest) live beside the app code instead of at
    // the repo root.
    publicDir: "src/public",
    envPrefix: [
      "VITE_",
      "AUTH_MODE",
      "BYPASS_EMAIL_VERIFICATION",
      "POSTHOG_PUBLIC_KEY",
      "POSTHOG_HOST",
      "TURNSTILE_SITE_KEY",
    ],
    server: {
      allowedHosts,
      port,
    },
    preview: {
      allowedHosts,
      port,
    },
    build: {
      sourcemap: emitSourcemaps,
      outDir: emitSourcemaps ? "dist-sourcemaps" : "dist",
    },
    plugins: [
      leanWorkerBundle(),
      showDevtools
        ? devtools({
            consolePiping: {
              enabled: true,
              levels: ["log", "warn", "error", "info", "debug"],
            },
          })
        : null,
      cloudflare({
        inspectorPort: false,
        viteEnvironment: { name: "ssr" },
        // The site-audit aux worker builds to dist/open_seo_audit/ and runs
        // beside the main worker in dev and preview, with the app's
        // cross-script SITE_AUDIT_WORKFLOW / AUDIT_SCRATCHPAD bindings
        // resolved against it.
        // AUDIT_BROWSER_RENDERING=true attaches a remote Browser Run binding
        // to it in dev, for rendered audits without a Context key.
        auxiliaryWorkers: [
          {
            configPath: "./wrangler.audit.jsonc",
            config:
              command === "serve" && env.AUDIT_BROWSER_RENDERING === "true"
                ? { browser: { binding: "BROWSER", remote: true } }
                : {},
          },
        ],
      }),
      tsConfigPaths(),
      tanstackStart(),
      viteReact(),
      tailwindcss(),
    ],
  };
});
