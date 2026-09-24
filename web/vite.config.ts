import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import {
  defineConfig,
  loadEnv,
  searchForWorkspaceRoot,
  type Plugin,
} from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";

/**
 * The deploy scripts set VITE_REQUIRE_TURNSTILE=1. Without a site key in the
 * bundle the free tools send no Turnstile token, so a worker with
 * TURNSTILE_SECRET_KEY set rejects every request with 403 — invisible until a
 * visitor reports it. Fail the build instead.
 *
 * This has to be a build hook: a throw at module scope is swallowed by the
 * prerenderer, which logs the page and carries on with exit code 0.
 */
function requireTurnstileSiteKey(siteKey: string | undefined): Plugin {
  return {
    name: "seoshark:require-turnstile-site-key",
    apply: "build",
    buildStart() {
      if (process.env.VITE_REQUIRE_TURNSTILE !== "1") return;
      if (siteKey?.trim() && !/^[123]x0+/.test(siteKey.trim())) return;
      throw new Error(
        "VITE_TURNSTILE_SITE_KEY is required for a deployable build: without it the free tools send no Turnstile token and every request is rejected with 403. Set a real production site key in web/.env. Test keys cannot be deployed.",
      );
    },
  };
}

// Vite checks both the file path and its raw-import ID against the allowlist.
const publicPromptFiles = [
  "../.agents/skills/setup-seoshark/SKILL.md",
  "../src/client/features/ai-mcp/agentUpdatePrompt.md",
].flatMap((relativePath) => {
  const file = fileURLToPath(new URL(relativePath, import.meta.url));
  return [file, `${file}?raw`];
});

const mdxPlugin = await mdx(await import("./source.config"));
const transformMdx = mdxPlugin.transform;
if (typeof transformMdx === "function") {
  mdxPlugin.transform = function (code, id, options) {
    // Leave raw prompt files to Vite instead of compiling them as MDX pages.
    if (new URLSearchParams(id.split("?")[1]).has("raw")) return;
    return transformMdx.call(this, code, id, options);
  };
}

export default defineConfig(async ({ mode }) => {
  // Same resolution order Vite uses for import.meta.env, so a key in web/.env
  // counts and the guard doesn't fire on a correctly configured deploy.
  const env = loadEnv(mode, process.cwd(), "");
  const turnstileSiteKey =
    env.VITE_TURNSTILE_SITE_KEY ?? process.env.VITE_TURNSTILE_SITE_KEY;

  return {
    resolve: {
      alias: [
        // The shared agent-setup prompt module lives in the application and
        // reads its identity from `@/shared/brand`. The website mirrors those
        // values in `src/lib/brand.ts`, so point that import there.
        {
          find: /^@\/shared\/brand$/,
          replacement: fileURLToPath(
            new URL("./src/lib/brand.ts", import.meta.url),
          ),
        },
      ],
    },
    server: {
      port: 4322,
      fs: {
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          // Public copyable prompts shared with the application outside web/.
          ...publicPromptFiles,
        ],
      },
    },
    ssr: {
      resolve: {
        conditions: ["worker", "import", "module", "default"],
      },
    },
    plugins: [
      requireTurnstileSiteKey(turnstileSiteKey),
      mdxPlugin,
      tailwindcss(),
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      cloudflare({
        viteEnvironment: { name: "ssr" },
      }),
      tanstackStart({
        prerender: {
          enabled: true,
          filter: ({ path }: { path: string }) =>
            !/\.pdf(?:[?#]|$)/i.test(path),
        },
      }),
      react(),
    ],
  };
});
