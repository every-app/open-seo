/**
 * Build-time stand-in for `workers-ai-provider` (and its /anthropic and
 * /openai subpaths), wired up via the leanWorkerBundle vite plugin.
 *
 * `@cloudflare/think` eagerly imports all three (~540 kB with the @ai-sdk/
 * openai + @ai-sdk/anthropic providers they pull in) solely to build its lazy
 * default provider in `resolveModel()` — which only runs when `getModel()`
 * returns a bare model-id string. Both our chat agents (SamChatAgent,
 * OnboardingChatAgent) return a constructed OpenRouter LanguageModel instead,
 * so the default provider is dead code; this stub keeps it out of the eager
 * worker bundle. Same pattern as just-bash-stub.ts.
 */
const STUBBED_MESSAGE =
  "workers-ai-provider is stubbed out of the worker bundle to keep it out of " +
  "the eager isolate startup graph (see vite-plugin-lean-worker-bundle.ts); " +
  "SamChatAgent/OnboardingChatAgent override getModel with OpenRouter";

// Covers every named import in the dependency graph: `createWorkersAI` (root),
// `anthropic` (/anthropic) and `openai` (/openai).
export function createWorkersAI(): never {
  throw new Error(STUBBED_MESSAGE);
}

export function anthropic(): never {
  throw new Error(STUBBED_MESSAGE);
}

export function openai(): never {
  throw new Error(STUBBED_MESSAGE);
}
