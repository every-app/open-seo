import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Literal `new URL(..., import.meta.url)` per stub (rather than a path
// helper) so knip sees the stub files as used.
const JUST_BASH_STUB = fileURLToPath(
  new URL("./src/server/lib/just-bash-stub.ts", import.meta.url),
);
const WORKERS_AI_PROVIDER_STUB = fileURLToPath(
  new URL("./src/server/lib/workers-ai-provider-stub.ts", import.meta.url),
);
/**
 * Dependencies that must never be reachable from the workers' eager startup
 * module graphs. The 128 MB isolate limit is shared by everything evaluated at
 * startup (production OOM bursts trace back to baseline heap, not leaks), so
 * each of these is either loaded lazily behind a dynamic import or stubbed
 * out. `generateBundle` below fails the build if one sneaks back in via a
 * static import chain.
 */
const EAGER_DENYLIST: Array<{ pattern: RegExp; expected: string }> = [
  {
    pattern: /node_modules\/autumn-js\//,
    expected: "lazy-loaded behind the facade in src/server/billing/autumn.ts",
  },
  {
    pattern:
      /node_modules\/(workers-ai-provider|@ai-sdk\/(openai|anthropic))\//,
    expected:
      "aliased to workers-ai-provider-stub.ts (@cloudflare/think's default " +
      "provider path is dead code — our agents construct OpenRouter models)",
  },
  {
    pattern: /node_modules\/just-bash\//,
    expected:
      "aliased to just-bash-stub.ts (Think's workspace bash tool is disabled)",
  },
  {
    // The barrel (index.*) is allowed — the load hook rewrites its content to
    // re-export English only — as is en.* itself. Every other locale module
    // must stay out; if the load-hook swap ever regresses, the real barrel
    // pulls the individual locale files back in and they match here.
    pattern: /node_modules\/zod\/v4\/locales\/(?!en\.|index\.)/,
    expected:
      "replaced with an en-only barrel via the load hook below (we never " +
      "localize zod errors)",
  },
  {
    // Startup CPU, not memory: every tool's zod input/output schemas and the
    // SDK's protocol schemas are built at module scope, which pushed the main
    // worker toward the 400 ms startup CPU limit.
    pattern:
      /node_modules\/@modelcontextprotocol\/server\/|\/src\/server\/mcp\/(server|transport|tools\/)/,
    expected:
      "lazy-loaded behind the dynamic imports of src/server/mcp/transport.ts " +
      "(server.ts, oauth-provider.ts, api-key-auth.ts) and samChatTools.ts " +
      "(SamChatAgent.beforeTurn)",
  },
  {
    // Pre-existing boundary from the site-audit engine, guarded here too.
    pattern: /node_modules\/cheerio\//,
    expected:
      "lazy-loaded behind the page-analyzer dynamic import " +
      "(site-audit-workflow-helpers.ts)",
  },
];

/**
 * Dependencies that must stay out of the browser's entry chunk. The whole app
 * renders inside <ClientOnly>, so every page waits for that chunk to load.
 */
const CLIENT_ENTRY_DENYLIST: Array<{ pattern: RegExp; expected: string }> = [
  {
    pattern: /node_modules\/recharts\//,
    expected:
      "imported only from route components, which are code-split. Route " +
      "options like loader and validateSearch are not, so they must import " +
      "from chart-free modules",
  },
];

/**
 * Keeps the worker's eager server bundle lean, in three parts:
 *
 * 1. `resolve.alias` stubs for packages that are pure dead weight (dead code
 *    paths in @cloudflare/think).
 * 2. A `load`-hook swap of zod v4's all-languages locales barrel for an
 *    en-only barrel (the barrel is imported via relative specifiers inside
 *    zod itself, and pre-enforced resolvers in this plugin stack win the
 *    resolveId race, so matching the resolved file path in `load` is the
 *    reliable seam).
 * 3. A `generateBundle` assertion that walks the static-import closure of the
 *    worker entry chunk and fails the build if any EAGER_DENYLIST module is
 *    reachable — turning "we verified the chunk by grepping a sourcemap once"
 *    into a permanent regression test. The client build gets the same check
 *    against CLIENT_ENTRY_DENYLIST.
 */
export function leanWorkerBundle(): Plugin {
  return {
    name: "lean-worker-bundle",
    config() {
      return {
        resolve: {
          alias: {
            // Rationale for each stub lives in its docblock. TODO: remove the
            // just-bash workaround once @cloudflare/think stops eagerly
            // importing it (https://github.com/cloudflare/agents/issues/1673).
            "just-bash": JUST_BASH_STUB,
            // Subpaths must precede the bare specifier, which would otherwise
            // prefix-match them.
            "workers-ai-provider/anthropic": WORKERS_AI_PROVIDER_STUB,
            "workers-ai-provider/openai": WORKERS_AI_PROVIDER_STUB,
            "workers-ai-provider": WORKERS_AI_PROVIDER_STUB,
          },
        },
      };
    },
    load(id) {
      // zod v4's core/classic entrypoints re-export the full locales barrel
      // (`export * as locales from "../locales/index.js"`, every language,
      // ~208 kB) into the eager bundle. Zod's default English error map
      // imports `../locales/en.js` directly and bypasses the barrel, so only
      // `z.locales.<lang>` consumers need it — and we never localize zod
      // errors. Serve an en-only barrel in its place so `z.locales.en` keeps
      // working and the other ~40 languages tree-shake away. (`./en.js`
      // resolves relative to the real barrel path, so no stub file needed.)
      const barrel = id.match(
        /node_modules\/zod\/v4\/locales\/index\.(js|cjs)$/,
      );
      if (barrel) {
        return `export { default as en } from "./en.${barrel[1]}";`;
      }
    },
    generateBundle(_options, bundle) {
      // EAGER_DENYLIST only matters for the worker builds' isolate memory; the
      // client bundle never contains these packages (and the zod swap applies
      // everywhere). "ssr" is the main worker; "open_seo_audit" is the
      // site-audit aux worker, which must stay lean for the same reason it
      // exists.
      const environment = this.environment.name;
      let denylist: typeof EAGER_DENYLIST;
      if (environment === "client") {
        denylist = CLIENT_ENTRY_DENYLIST;
      } else if (["ssr", "open_seo_audit"].includes(environment)) {
        denylist = EAGER_DENYLIST;
      } else {
        return;
      }

      // Bundle keys are chunk fileNames already.
      const chunkAt = (fileName: string) => {
        const output = bundle[fileName];
        return output?.type === "chunk" ? output : undefined;
      };

      // Static-import closure from the entry chunks: everything here is
      // evaluated at isolate startup. Dynamic imports are excluded — landing
      // there is the point of the lazy boundaries.
      const eager = new Set<string>();
      const queue = Object.values(bundle)
        .filter((output) => output.type === "chunk" && output.isEntry)
        .map((chunk) => chunk.fileName);
      while (queue.length > 0) {
        const fileName = queue.pop();
        if (fileName === undefined || eager.has(fileName)) continue;
        eager.add(fileName);
        queue.push(...(chunkAt(fileName)?.imports ?? []));
      }

      const violations: string[] = [];
      for (const rule of denylist) {
        for (const fileName of eager) {
          const hits =
            chunkAt(fileName)?.moduleIds.filter((id) =>
              rule.pattern.test(id),
            ) ?? [];
          if (hits.length > 0) {
            violations.push(
              `${hits[0]}${hits.length > 1 ? ` (+${hits.length - 1} more modules)` : ""}\n` +
                `  reached the eager startup graph via chunk ${fileName}\n` +
                `  expected: ${rule.expected}`,
            );
          }
        }
      }

      if (violations.length > 0) {
        this.error(
          `[lean-worker-bundle] denylisted module(s) in the ${environment} ` +
            `build's eager startup graph:\n\n${violations.join("\n\n")}\n\n` +
            `Restore the lazy/stub boundary, or update the denylist in ` +
            `vite-plugin-lean-worker-bundle.ts if this is intentional.`,
        );
      }
    },
  };
}
