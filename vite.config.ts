import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";

export default defineConfig(({ mode }) => {
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
    resolve: {
      alias: {
        // TODO: Remove this workaround once fixed upstream — either turndown
        // drops the bare require from its ESM build, or @cloudflare/think
        // stops eagerly importing just-bash/turndown at module init
        // (https://github.com/cloudflare/agents/issues/1673).
        //
        // turndown's ESM build (pulled in via just-bash's html-to-markdown
        // command) contains a bare CommonJS `require("@mixmark-io/domino")`
        // that the Cloudflare Workers runtime rejects at deploy time (error
        // 10021). Its CJS build goes through Vite's CommonJS transform, which
        // rewrites that require into a bundled import.
        turndown: "turndown/lib/turndown.cjs.js",
      },
    },
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
      showDevtools
        ? devtools({
            consolePiping: {
              enabled: true,
              levels: ["log", "warn", "error", "info", "debug"],
            },
          })
        : null,
      cloudflare({ inspectorPort: false, viteEnvironment: { name: "ssr" } }),
      tsConfigPaths(),
      tanstackStart(),
      viteReact(),
      tailwindcss(),
    ],
  };
});
