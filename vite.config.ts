import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, type ViteUserConfig } from "vitest/config";
import { loadEnv } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { leanWorkerBundle } from "./vite-plugin-lean-worker-bundle.ts";
import { mcpWidgets } from "./vite-plugin-mcp-widgets.ts";

const require = createRequire(import.meta.url);
// Better Auth's workerd export selects node:crypto.scrypt, which celld does
// not implement. The standalone build uses the package's portable scrypt
// instead; same parameters, same stored password format.
const portablePassword = join(
  dirname(
    require.resolve("@better-auth/utils/password", {
      paths: [dirname(require.resolve("better-auth"))],
    }),
  ),
  "password.mjs",
);

export default defineConfig(
  async ({ mode, command }): Promise<ViteUserConfig> => {
    // Vitest sets mode to "test". Return a config without the Cloudflare and
    // TanStack Start plugins so unit tests never boot workerd or the SSR dev
    // server; only the tsconfig path alias is needed.
    if (mode === "test") {
      return {
        resolve: { tsconfigPaths: true },
        plugins: [mcpWidgets()],
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
    // The production deploy sets this, tags the chunks it is about to ship, and
    // uploads the maps to PostHog error tracking (see deploy-production.yml).
    const emitSourcemaps = env.POSTHOG_SOURCEMAPS === "true";
    // `vite build --mode standalone` produces the Docker edition: one server
    // module for celld (see deploy/standalone/) instead of the Workers pair.
    const standalone = mode === "standalone";
    // AUTH_MODE=everyapp builds OpenSEO for an Every App gateway, from
    // cloudflare.config.ts rather than wrangler.jsonc (everyapp.config.ts).
    // The client reads the same AUTH_MODE, so both sides agree.
    const everyApp = env.AUTH_MODE === "everyapp";

    return {
      // Static files (favicons, manifest) live beside the app code instead of at
      // the repo root.
      publicDir: "src/public",
      resolve: {
        tsconfigPaths: true,
        alias: standalone
          ? { "@better-auth/utils/password": portablePassword }
          : undefined,
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
        rolldownOptions: {
          output: {
            // Emit every chunk as pure ASCII: Rolldown rewrites each non-ASCII
            // character in string, regex, and identifier tokens as a \uXXXX escape
            // (Vite's default is raw UTF-8). The parser decodes the escape, so
            // "S\u00e3o Paulo" and "São Paulo" are the same string at runtime and
            // nothing changes behaviour.
            //
            // Why: V8 keeps each module's source text alive for the life of the
            // isolate, and a single character outside Latin-1 (a location name, a
            // typographic dash in a tool description) makes it store the whole file
            // at two bytes per character. The 7.8 MB main worker chunk occupied
            // 15.5 MB of the 128 MB heap; escaped, it occupies 7.8 MB.
            //
            // Trade-offs: each escaped character costs six bytes instead of one to
            // three, a few KB across the bundle and well compressed on the client.
            // Built output shows \u2014 where a comment had an em dash, which only
            // matters to someone reading dist/ directly. Rolldown leaves comments
            // verbatim, and one surviving character is enough to lose the whole
            // saving, so vite-plugin-lean-worker-bundle.ts escapes the comment text
            // of the worker chunks after this pass. Nothing fails if either step
            // stops working; the isolate just quietly uses more memory.
            charset: "ascii",
          },
        },
      },
      // celld's no_bundle deployment accepts a single JS module plus sibling
      // WASM files, so the standalone server build inlines its dynamic imports.
      environments: standalone
        ? {
            ssr: {
              build: {
                rolldownOptions: { output: { codeSplitting: false } },
              },
            },
          }
        : undefined,
      plugins: [
        mcpWidgets(),
        leanWorkerBundle(),
        showDevtools
          ? devtools({
              consolePiping: {
                enabled: true,
                levels: ["log", "warn", "error", "info", "debug"],
              },
            })
          : null,
        everyApp
          ? (await import("./vite-plugin-every-app.ts")).everyAppCloudflare({
              mode,
            })
          : cloudflare({
              ...(standalone
                ? { configPath: "./wrangler.standalone.json" }
                : {}),
              inspectorPort: false,
              viteEnvironment: { name: "ssr" },
              // The site-audit aux worker builds to dist/open_seo_audit/ and
              // runs beside the main worker in dev and preview, with the app's
              // cross-script SITE_AUDIT_WORKFLOW / AUDIT_SCRATCHPAD bindings
              // resolved against it.
              // AUDIT_BROWSER_RENDERING=true attaches a remote Browser Run
              // binding to it in dev, for rendered audits without a Context
              // key.
              // The standalone build exports the audit classes from its
              // single module instead (src/standalone-server.ts).
              auxiliaryWorkers: standalone
                ? []
                : [
                    {
                      configPath: "./wrangler.audit.jsonc",
                      config:
                        command === "serve" &&
                        env.AUDIT_BROWSER_RENDERING === "true"
                          ? { browser: { binding: "BROWSER", remote: true } }
                          : {},
                    },
                  ],
            }),
        tanstackStart(),
        viteReact(),
        tailwindcss(),
      ],
    };
  },
);
