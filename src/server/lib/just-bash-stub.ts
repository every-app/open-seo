/**
 * Build-time stand-in for `just-bash`, wired up via the leanWorkerBundle
 * plugin's alias (vite-plugin-lean-worker-bundle.ts).
 *
 * `@cloudflare/think` eagerly imports just-bash (~21 MB of source, plus
 * turndown and the 8.6 MB @mixmark-io/domino DOM implementation) at module
 * init, and SamChatAgent is re-exported from src/server.ts, so the whole chain
 * lands in the main worker's startup module graph — raising every isolate's
 * baseline heap toward the 128 MB limit (production OOM bursts on unrelated
 * routes after each deploy). SAM only uses its own MCP toolset and disables
 * Think's workspace bash tool (`workspaceBash = false`), so the real library
 * is unreachable; this stub keeps it out of the bundle entirely.
 *
 * Remove once https://github.com/cloudflare/agents/issues/1673 lands and
 * @cloudflare/think loads just-bash lazily.
 */
const STUBBED_MESSAGE =
  "just-bash is stubbed out of the worker bundle (see " +
  "vite-plugin-lean-worker-bundle.ts); " +
  "the workspace bash tool is disabled for this deployment";

// Covers every named import in the dependency graph: `Bash` (Think's
// workspace bash tool) and `defineCommand` (agents/skills bash scripts).
// Both are only reached when a model invokes bash, which SAM never exposes.
// Must stay a class: call sites construct it with `new Bash({...})`.
// oxlint-disable-next-line typescript-eslint/no-extraneous-class
export class Bash {
  constructor() {
    throw new Error(STUBBED_MESSAGE);
  }
}

export function defineCommand(): never {
  throw new Error(STUBBED_MESSAGE);
}
