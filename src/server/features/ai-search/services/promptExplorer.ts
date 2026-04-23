import { waitUntil } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import type { LlmResponseResult } from "@/server/lib/dataforseoLlmSchemas";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { safeHostname, safeHttpUrl } from "@/server/features/ai-search/safeUrl";
import {
  promptExplorerModelResultSchema,
  type PromptExplorerCitation,
  type PromptExplorerInput,
  type PromptExplorerModel,
  type PromptExplorerModelResult,
  type PromptExplorerResult,
} from "@/types/schemas/ai-search";

/**
 * Prompt Explorer asks one prompt across one-to-four LLM models and renders
 * the answers side by side. Each (prompt, model) tuple is cached in R2 for 7
 * days because LLM responses are expensive and reasonably stable over short
 * windows.
 *
 * Per-model errors are isolated: a Claude API failure must not prevent
 * ChatGPT/Gemini/Perplexity results from rendering. We use Promise.allSettled
 * to enforce that.
 */

/** LLM responses are stable enough for a 7-day cache. */
const PROMPT_RESPONSE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Hard cap on response length to keep payloads sane. */
const PROMPT_RESPONSE_MAX_TOKENS = 1024;

type DataforseoClient = ReturnType<typeof createDataforseoClient>;

export async function explorePrompt(
  input: PromptExplorerInput,
  billingCustomer: BillingCustomerContext,
): Promise<PromptExplorerResult> {
  const dataforseo = createDataforseoClient(billingCustomer);
  const highlightBrand = input.highlightBrand?.trim() || null;

  // Dedupe models so a request like ["claude","claude"] doesn't fan out to two
  // paid upstream calls for the same answer.
  const uniqueModels = Array.from(new Set(input.models));

  const settled = await Promise.allSettled(
    uniqueModels.map((model) =>
      runModel({
        model,
        input,
        highlightBrand,
        billingCustomer,
        dataforseo,
      }),
    ),
  );

  const results: PromptExplorerModelResult[] = settled.map(
    (settledResult, index) => {
      const model = uniqueModels[index];
      if (settledResult.status === "fulfilled") return settledResult.value;
      return mapErrorToResult(model, settledResult.reason);
    },
  );

  return {
    prompt: input.prompt,
    highlightBrand,
    fetchedAt: new Date().toISOString(),
    results,
  };
}

type RunModelArgs = {
  model: PromptExplorerModel;
  input: PromptExplorerInput;
  highlightBrand: string | null;
  billingCustomer: BillingCustomerContext;
  dataforseo: DataforseoClient;
};

async function runModel(
  args: RunModelArgs,
): Promise<PromptExplorerModelResult> {
  const cacheKey = await buildCacheKey("ai-search:prompt-response", {
    organizationId: args.billingCustomer.organizationId,
    projectId: args.input.projectId,
    model: args.model,
    // Collapse only whitespace differences. Casing is deliberately preserved:
    // prompts like "Compare Go vs go" or case-sensitive code snippets must
    // not collide with their lowercase twins.
    prompt: normalizePromptForCache(args.input.prompt),
    webSearch: args.input.webSearch,
    webSearchCountryCode: args.input.webSearchCountryCode ?? null,
    // Bumped when prompt/payload shape changes — busts stale cache entries.
    systemPromptV: 4,
  });

  const cached = promptExplorerModelResultSchema.safeParse(
    await getCached(cacheKey),
  );
  if (cached.success && cached.data.status === "success") {
    // highlightBrand is not part of the cache key — re-apply it so the same
    // cached response can power different brand highlights for free.
    return reapplyHighlightBrand(cached.data, args.highlightBrand);
  }

  const rawResponse = await fetchModelResponse(args);
  const shaped = shapeSuccess(args.model, rawResponse);

  waitUntil(
    setCached(cacheKey, shaped, PROMPT_RESPONSE_TTL_SECONDS).catch((err) => {
      console.error("ai-search.prompt-response.cache-write failed:", err);
    }),
  );

  return reapplyHighlightBrand(shaped, args.highlightBrand);
}

// DataForSEO's Claude catalog caps at the 4.0 family (no Sonnet 4.5+ yet).
const MODEL_NAMES: Record<PromptExplorerModel, string> = {
  chat_gpt: "gpt-5",
  claude: "claude-sonnet-4-0",
  gemini: "gemini-2.5-pro",
  perplexity: "sonar-reasoning-pro",
};

function fetchModelResponse(args: RunModelArgs): Promise<LlmResponseResult> {
  return args.dataforseo.aiSearch.llmResponse({
    modelSlug: args.model,
    modelName: MODEL_NAMES[args.model],
    userPrompt: args.input.prompt,
    webSearch: args.input.webSearch,
    webSearchCountryCode: args.input.webSearchCountryCode,
    maxOutputTokens: PROMPT_RESPONSE_MAX_TOKENS,
  });
}

/**
 * Shape a raw LLM response into the brand-agnostic success payload we cache.
 * Brand-specific fields (`matchedBrand`, `brandMentioned`) are computed
 * separately by `reapplyHighlightBrand` on every read so one cache entry can
 * serve requests with different `highlightBrand` values.
 */
function shapeSuccess(
  model: PromptExplorerModel,
  response: LlmResponseResult,
): PromptExplorerModelResult {
  const text = extractText(response);
  const citations = extractCitations(response);
  const fanOutQueries = (response.fan_out_queries ?? []).slice(0, 20);

  return {
    status: "success" as const,
    model,
    modelName: response.model_name ?? null,
    text,
    citations,
    fanOutQueries,
    brandMentioned: null,
    outputTokens:
      response.output_tokens != null
        ? Math.round(response.output_tokens)
        : null,
    webSearch: response.web_search ?? false,
  };
}

function reapplyHighlightBrand(
  result: PromptExplorerModelResult,
  highlightBrand: string | null,
): PromptExplorerModelResult {
  if (result.status !== "success") return result;
  const citations = result.citations.map((citation) => ({
    ...citation,
    matchedBrand: matchesBrand(citation.url, citation.title, highlightBrand),
  }));
  return {
    ...result,
    citations,
    brandMentioned: computeBrandMentioned(
      result.text,
      citations,
      highlightBrand,
    ),
  };
}

function extractText(response: LlmResponseResult): string {
  const textParts: string[] = [];
  for (const item of response.items ?? []) {
    if (item.type !== "message") continue;
    for (const section of item.sections ?? []) {
      if (typeof section.text === "string" && section.text.length > 0) {
        textParts.push(section.text);
      }
    }
  }
  return textParts.join("\n\n").trim();
}

function extractCitations(
  response: LlmResponseResult,
): PromptExplorerCitation[] {
  const seen = new Set<string>();
  const citations: PromptExplorerCitation[] = [];

  for (const item of response.items ?? []) {
    if (item.type !== "message") continue;
    for (const section of item.sections ?? []) {
      for (const annotation of section.annotations ?? []) {
        if (annotation.type !== "citation") continue;
        // Drop non-http(s) URLs — LLMs can be coaxed into emitting
        // `javascript:` payloads as "citations" and we render these as
        // <a href> in the UI.
        const safeUrl = safeHttpUrl(annotation.url);
        if (!safeUrl || seen.has(safeUrl)) continue;
        seen.add(safeUrl);
        citations.push({
          url: safeUrl,
          domain: safeHostname(safeUrl),
          title: annotation.title ?? null,
          matchedBrand: false,
        });
      }
    }
  }

  return citations.slice(0, 25);
}

function computeBrandMentioned(
  text: string,
  citations: PromptExplorerCitation[],
  highlightBrand: string | null,
): boolean | null {
  if (!highlightBrand) return null;
  if (citations.some((c) => c.matchedBrand)) return true;
  return mentionRegex(highlightBrand).test(text);
}

function matchesBrand(
  url: string,
  title: string | null | undefined,
  highlightBrand: string | null,
): boolean {
  if (!highlightBrand) return false;
  const needle = highlightBrand.toLowerCase();
  const haystack = `${url} ${title ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

function mentionRegex(brand: string): RegExp {
  // Case-insensitive match on the brand string with word-boundary guards only
  // on sides that end in a word char — otherwise \b fails for brands like
  // "C++" or "AT&T" where the terminal char is non-word. When a boundary char
  // is non-word we guard with a negative lookaround against that same char so
  // "C++" doesn't match "C+++".
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const firstEscaped = brand[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lastEscaped = brand[brand.length - 1].replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const leading = /^\w/.test(brand) ? "\\b" : `(?<!${firstEscaped})`;
  const trailing = /\w$/.test(brand) ? "\\b" : `(?!${lastEscaped})`;
  return new RegExp(`${leading}${escaped}${trailing}`, "i");
}

function normalizePromptForCache(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function mapErrorToResult(
  model: PromptExplorerModel,
  reason: unknown,
): PromptExplorerModelResult {
  if (reason instanceof AppError && reason.code === "INSUFFICIENT_CREDITS") {
    // Re-throw INSUFFICIENT_CREDITS so the whole request surfaces it instead
    // of silently degrading to "Claude failed" — credits exhaustion is global,
    // not per-model.
    throw reason;
  }

  // Log full upstream detail server-side; surface only a generic message to
  // the client. Upstream error bodies sometimes echo request paths or
  // diagnostic fields we don't want to leak to the browser.
  console.error(`ai-search.prompt-response.${model}.error:`, reason);

  return {
    status: "error" as const,
    model,
    errorCode: "UPSTREAM_ERROR",
    message: "This model is temporarily unavailable. Please try again.",
  };
}
