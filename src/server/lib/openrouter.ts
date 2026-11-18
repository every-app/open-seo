import { ConfigurationError, createGatewayFetch } from "@every-app/sdk/server";
import {
  createOpenRouter,
  type LanguageModelV3,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel } from "ai";
import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { gatewayCallFor } from "@/server/lib/gateway-attribution";
import { getEnvValueSync, getWorkersEnv } from "@/server/lib/runtime-env";

/**
 * How a deployment reaches OpenRouter: with its own key, or behind an Every
 * App gateway (AUTH_MODE=everyapp) through the gateway's AI proxy, which
 * holds the key. The proxy's host is a placeholder the binding never
 * resolves.
 */
export type OpenRouterAccess =
  | { apiKey: string; baseURL?: string }
  | { gatewayFetch: typeof fetch };

const GATEWAY_BASE_URL =
  "https://every-app-gateway.invalid/api/ai/openrouter/api/v1";

function isBehindEveryAppGateway(env: object): boolean {
  return isEveryAppAuthMode(getEnvValueSync(env, "AUTH_MODE"));
}

/** The gateway's AI proxy fetch (whose call it is: gateway-attribution.ts). */
function gatewayOpenRouterFetch(env: object): typeof fetch {
  return createGatewayFetch({
    env,
    for: gatewayCallFor(),
  });
}

/**
 * This deployment's OpenRouter access, or null without one. Sync for
 * samAccess.
 */
export function getOpenRouterAccess(env: object): OpenRouterAccess | null {
  if (isBehindEveryAppGateway(env)) {
    try {
      return { gatewayFetch: gatewayOpenRouterFetch(env) };
    } catch (error) {
      // No gateway binding (and no local key in dev). A call that says
      // nobody's (AttributionError) is a bug, so it is thrown.
      if (error instanceof ConfigurationError) return null;
      throw error;
    }
  }
  const apiKey = getEnvValueSync(env, "OPENROUTER_API_KEY");
  // Any OpenAI-compatible endpoint that speaks OpenRouter's chat API; unset
  // means OpenRouter itself.
  const baseURL = getEnvValueSync(env, "OPENROUTER_BASE_URL");
  return apiKey ? { apiKey, baseURL } : null;
}

/** SAM's model, from its Durable Object env. Sync: Think's getModel() is. */
export function buildSamChatModel(
  env: object,
  reasoningEffort: "max" | "low",
): LanguageModelV3 {
  const access = getOpenRouterAccess(env);
  if (!access) {
    throw new Error("OPENROUTER_API_KEY is required for the SAM agent");
  }
  return buildChatAgentModel(
    access,
    getEnvValueSync(env, "OPENROUTER_MODEL"),
    reasoningEffort,
  );
}

/** For server code: the access, or the error a missing key always threw. */
export async function requireOpenRouterAccess(): Promise<OpenRouterAccess> {
  const access = getOpenRouterAccess((await getWorkersEnv()) ?? {});
  if (!access) {
    throw new Error(
      "Missing required environment variable: OPENROUTER_API_KEY",
    );
  }
  return access;
}

// OpenRouter model slug used for the SAM in-app chat agent. Override with
// OPENROUTER_MODEL to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "openai/gpt-5.6-luna";

// Previous default; kept reachable via OPENROUTER_MODEL for rollback, and the
// fallback where OpenAI is blocked. Its routing needs the ZDR/provider tuning
// below.
const MINIMAX_M3 = "minimax/minimax-m3";

// OpenRouter rejects OpenAI models for requests from these countries ("This
// model is not available in your region"). Workflows and Durable Objects run
// near the user, outside prod's US placement.
const OPENAI_BLOCKED_COUNTRIES = [
  "CN",
  "HK",
  "MO",
  "RU",
  "BY",
  "IR",
  "KP",
  "SY",
  "CU",
];

// The country this isolate's requests leave from. An isolate stays in one
// location, so one lookup serves its lifetime. Caches the value, not the
// promise: Workers can't share a pending fetch across requests. Fails open: a
// slow or failed lookup leaves the country unknown, and calls stay on OpenAI.
let egressCountry: string | undefined;
async function openAiBlockedHere(): Promise<boolean> {
  egressCountry ??= await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
    signal: AbortSignal.timeout(2000),
  })
    .then((response) => response.text())
    .then((trace) => /^loc=(\w+)$/m.exec(trace)?.[1] ?? "")
    .catch(() => "");
  return OPENAI_BLOCKED_COUNTRIES.includes(egressCountry);
}

/**
 * Returns the AI SDK LanguageModel for the chat agent. `usage: { include: true }`
 * turns on OpenRouter usage accounting so each response carries its real USD
 * cost (providerMetadata.openrouter.usage.cost) — which we meter against the
 * shared usage-credit pool.
 *
 * Default model: GPT-5.6 Luna at `reasoning.effort: "max"` — "max" is valid at
 * the OpenRouter API for GPT-5.x but missing from the SDK's effort union, so
 * the reasoning config rides in `extraBody`. Reasoning tokens stream on the
 * separate reasoning channel and are billed as output tokens, which the usage
 * accounting above captures.
 *
 * Sync on purpose: Think's `getModel()` hook is sync and runs on every turn,
 * so the SAM agent reads its access/model from its DO env and builds here.
 */
export function buildChatAgentModel(
  access: OpenRouterAccess,
  modelId?: string,
  reasoningEffort: "max" | "low" = "max",
): LanguageModelV3 {
  const model = modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  const openrouter =
    "apiKey" in access
      ? createOpenRouter({ apiKey: access.apiKey, baseURL: access.baseURL })
      : createOpenRouter({
          apiKey: "gateway-managed",
          baseURL: GATEWAY_BASE_URL,
          fetch: access.gatewayFetch,
        });
  const primary = openRouterModel(openrouter, model, reasoningEffort);
  // The MiniMax fallback is an OpenRouter slug; another provider may not have it.
  if (!model.startsWith("openai/") || ("apiKey" in access && access.baseURL)) {
    return primary;
  }
  // Where OpenRouter would reject OpenAI, pick MiniMax M3 before the request.
  // The country lookup is async and getModel() is sync, so it runs per call.
  const fallback = openRouterModel(openrouter, MINIMAX_M3, reasoningEffort);
  const pick = async () => ((await openAiBlockedHere()) ? fallback : primary);
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ params }) => (await pick()).doGenerate(params),
      wrapStream: async ({ params }) => (await pick()).doStream(params),
    },
  });
}

function openRouterModel(
  openrouter: OpenRouterProvider,
  model: string,
  reasoningEffort: "max" | "low",
): LanguageModelV3 {
  // MiniMax M3 (env override or OpenAI fallback): `provider.order` prefers
  // Together, then Atlas Cloud (fp8); `zdr: true` restricts routing to Zero-Data-
  // Retention endpoints, which excludes MiniMax first-party — the account's
  // "Non-frontier requires ZDR" data policy enforces the same, this flag is
  // belt-and-braces. Fallbacks stay on within the ZDR set because pinning
  // providers caused a prod outage (Jul 2026: Together upstream-rate-limited
  // m3 and every chat turn 429'd). The explicit reasoning channel keeps m3's
  // `<think>` trace out of the visible answer text.
  if (model === MINIMAX_M3) {
    return openrouter(model, {
      usage: { include: true },
      reasoning: { effort: reasoningEffort === "low" ? "low" : "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    });
  }

  return openrouter(model, {
    usage: { include: true },
    extraBody: { reasoning: { effort: reasoningEffort } },
  });
}
