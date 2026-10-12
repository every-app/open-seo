import { waitUntil } from "cloudflare:workers";
import { sortBy } from "remeda";
import { getDomain } from "tldts";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { assertPaidAiSearchPlan } from "@/server/features/ai-search/services/access";
import {
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
  createDataforseoClient,
} from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { normalizeAiSuggestion } from "@/shared/ai-prompt-suggestions";
import {
  AI_DEFAULT_TOPIC,
  type AiPromptResearchResult,
  type AiResearchedPrompt,
} from "@/shared/ai-visibility";
import type { ResearchAiPromptsInput } from "@/types/schemas/aiPromptResearch";
import { aiPromptIsBranded, ownedAiDomain } from "./aiVisibilityMatching";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { getTracker } from "./aiVisibilityState";

/** The provider refreshes prompt data monthly; one paid call per day is enough. */
const RESEARCH_TTL_SECONDS = 24 * 60 * 60;
const RESEARCH_LIMIT = 100;
// Results for niche keywords shift between calls; at 20 the on-topic sites
// left after generic ones could swing from a dozen to none. 50 holds steady.
const RESEARCH_SERP_DEPTH = 50;
// Sites that rank and get cited for almost any topic say nothing about which
// meaning of a keyword a prompt is about.
const GENERIC_DOMAINS = new Set([
  "amazon.com",
  "dev.to",
  "facebook.com",
  "github.com",
  "google.com",
  "instagram.com",
  "linkedin.com",
  "medium.com",
  "pinterest.com",
  "producthunt.com",
  "quora.com",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "wikipedia.org",
  "x.com",
  "ycombinator.com",
  "youtube.com",
]);

// Only the fields research reads. Brand and tracked flags are derived on every
// request, so one cached provider response serves every project in the org.
// The provider's AI search volume is only used to order prompts: it is
// estimated from Google "People also ask" data, not counted from AI usage.
const cachedPromptSchema = z.object({
  question: z.string(),
  answer: z.string(),
  volume: z.number(),
  sources: z.array(
    z.object({
      domain: z.string(),
      url: z.string(),
      title: z.string().nullable(),
    }),
  ),
  // Registrable domains the answer cited or its web search returned.
  domains: z.array(z.string()),
});
type CachedPrompt = z.infer<typeof cachedPromptSchema>;
const cachedResearchSchema = z.object({
  prompts: z.array(cachedPromptSchema),
  // Registrable domains ranking on Google for the keyword: its common meaning.
  serpDomains: z.array(z.string()),
});
type CachedResearch = z.infer<typeof cachedResearchSchema>;

/** Website setup keywords first, then tracker topics the user added. */
export async function listAiResearchKeywords(input: {
  projectId: string;
}): Promise<{ keywords: string[] }> {
  const [state, researchKeywords] = await Promise.all([
    getTracker({ projectId: input.projectId }),
    repo.listResearchKeywords(input.projectId),
  ]);
  const keywords = [
    ...researchKeywords,
    // The default topic is a catch-all, not a keyword.
    ...state.topics.filter((topic) => topic !== AI_DEFAULT_TOPIC),
  ].map(normalizeAiSuggestion);
  return { keywords: [...new Set(keywords)] };
}

export async function researchAiPrompts(
  input: ResearchAiPromptsInput,
  customer: BillingCustomerContext,
): Promise<AiPromptResearchResult> {
  await assertPaidAiSearchPlan(customer.organizationId, "Prompt Research");
  const state = await getTracker({ projectId: input.projectId });
  const keyword = normalizeAiSuggestion(input.keyword);
  // DataForSEO has ChatGPT prompt data only in US English.
  const loaded = await loadPrompts(
    {
      topic: keyword,
      platform: "chat_gpt",
      locationCode: CHATGPT_LOCATION_CODE,
      languageCode: CHATGPT_LANGUAGE_CODE,
    },
    customer,
  );
  const ownBrand = state.brands.find((brand) => brand.own);
  const tracked = new Set(
    state.prompts
      .filter((prompt) => !prompt.archived)
      .map((prompt) => normalizeAiSuggestion(prompt.text)),
  );
  // Keyword words also appear in unrelated questions ("ups tracking issue" for
  // "issue tracking"). Keep a prompt when it asks the keyword as a phrase, or
  // its answer leans on sites that rank for the keyword or belong to the project.
  const onTopic = new Set([
    ...loaded.serpDomains,
    ...state.brands.flatMap((brand) => registrableDomain(brand.domain) ?? []),
  ]);
  const prompts = mergeNearDuplicates(
    loaded.prompts.filter(
      (item) =>
        asksPhrase(item.question, keyword) ||
        item.domains.some((domain) => onTopic.has(domain)),
    ),
  ).map((group): AiResearchedPrompt => {
    const [top] = group;
    const sources = uniqueSources(group).map((source) => ({
      ...source,
      own: !!ownBrand && ownedAiDomain(source.domain, ownBrand.domain),
    }));
    return {
      text: capitalize(top.question),
      variants: group.slice(1).map((item) => capitalize(item.question)),
      sources,
      ownDomainCited: sources.some((source) => source.own),
      brandMentioned:
        !!ownBrand &&
        group.some((item) => aiPromptIsBranded(item.answer, ownBrand)),
      tracked: group.some((item) =>
        tracked.has(normalizeAiSuggestion(item.question)),
      ),
    };
  });
  return { keyword: input.keyword, prompts };
}

async function loadPrompts(
  request: {
    topic: string;
    platform: "chat_gpt";
    locationCode: number;
    languageCode: string;
  },
  customer: BillingCustomerContext,
): Promise<CachedResearch> {
  const cacheKey = await buildCacheKey("ai-visibility:prompt-research", {
    organizationId: customer.organizationId,
    ...request,
  });
  const cached = cachedResearchSchema.safeParse(await getCached(cacheKey));
  if (cached.success) return cached.data;

  const client = createDataforseoClient(customer);
  // Answers often use the category words when the question doesn't. Short
  // keywords match as a phrase; longer ones rarely appear verbatim.
  const [data, serp] = await Promise.all([
    client.aiSearch.mentionsSearch({
      target: {
        keyword: request.topic,
        search_scope: ["question", "answer"],
        match_type:
          words(request.topic).length <= 3 ? "partial_match" : "word_match",
      },
      platform: request.platform,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      limit: RESEARCH_LIMIT,
      orderBy: ["ai_search_volume,desc"],
    }),
    client.serp.live({
      keyword: request.topic,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
      depth: RESEARCH_SERP_DEPTH,
    }),
  ]);
  const prompts = data.flatMap((item): CachedPrompt[] =>
    item.question?.trim()
      ? [
          {
            question: item.question.trim(),
            answer: item.answer ?? "",
            volume: item.ai_search_volume ?? 0,
            sources: (item.sources ?? []).flatMap((source) =>
              source.domain && source.url
                ? [
                    {
                      domain: source.domain,
                      url: source.url,
                      title: source.title ?? null,
                    },
                  ]
                : [],
            ),
            domains: [
              ...new Set(
                [
                  ...(item.sources ?? []),
                  ...(item.search_results ?? []),
                ].flatMap((source) => registrableDomain(source.domain) ?? []),
              ),
            ],
          },
        ]
      : [],
  );
  const research: CachedResearch = {
    prompts,
    serpDomains: [
      ...new Set(
        serp.flatMap((item) =>
          item.type === "organic" ? (registrableDomain(item.domain) ?? []) : [],
        ),
      ),
    ].filter((domain) => !GENERIC_DOMAINS.has(domain)),
  };
  waitUntil(
    setCached(cacheKey, research, RESEARCH_TTL_SECONDS).catch((error) => {
      console.error("ai-visibility.prompt-research.cache-write-failed", error);
    }),
  );
  return research;
}

function registrableDomain(host: string | null | undefined) {
  return host ? (getDomain(host) ?? undefined) : undefined;
}

// "…most accurate?" and "…the most accurate?", or the same question with
// different years, ask the same thing. The highest-volume wording leads.
function mergeKey(question: string) {
  return words(question.replace(/\b(?:in\s+|for\s+)?(?:19|20)\d{2}\b/g, " "))
    .filter((word) => !["a", "an", "any", "the"].includes(word))
    .join(" ");
}

// The provider lowercases questions; tracked prompts read better as sentences.
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lowercase words with a trailing plural "s" removed. */
function words(text: string) {
  return normalizeAiSuggestion(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word,
    );
}

// A one-word keyword is still ambiguous on its own ("sandbox" games, VR, or
// code), so only a phrase of two or more words vouches for a prompt.
function asksPhrase(question: string, keyword: string) {
  const phrase = words(keyword);
  return (
    phrase.length > 1 &&
    ` ${words(question).join(" ")} `.includes(` ${phrase.join(" ")} `)
  );
}

function mergeNearDuplicates(prompts: CachedPrompt[]): CachedPrompt[][] {
  const groups = new Map<string, CachedPrompt[]>();
  for (const prompt of sortBy(prompts, [(item) => item.volume, "desc"])) {
    const key = mergeKey(prompt.question);
    groups.set(key, [...(groups.get(key) ?? []), prompt]);
  }
  return [...groups.values()];
}

function uniqueSources(group: CachedPrompt[]) {
  const byUrl = new Map<string, CachedPrompt["sources"][number]>();
  for (const source of group.flatMap((item) => item.sources))
    if (!byUrl.has(source.url)) byUrl.set(source.url, source);
  return [...byUrl.values()];
}
