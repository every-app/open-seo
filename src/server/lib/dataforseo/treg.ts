import { AppError } from "@/server/lib/errors";

// treg (https://treg.to) resells DataForSEO per call from a prepaid balance,
// so a self-hoster can run OpenSEO without a DataForSEO account. It relays
// DataForSEO's request and response bodies unchanged, but addresses each
// endpoint by a catalog id instead of its URL path, so this module maps the
// DataForSEO URL OpenSEO built onto the treg call for it.

const TREG_BASE = "https://treg.to";
const DATAFORSEO_HOST = "api.dataforseo.com";

/**
 * The DataForSEO paths OpenSEO calls that treg's catalog serves, with their
 * treg endpoint ids. A `{name}` segment is a path parameter, which treg takes
 * as a query parameter of that name. Anything not listed (the SERP task
 * queue behind rank tracking, LLM mentions, the LLM models list) still
 * needs a DataForSEO key.
 */
const TREG_ENDPOINTS: Record<string, string> = {
  "/v3/appendix/user_data": "dataforseo.account.usage",
  "/v3/backlinks/backlinks/live": "dataforseo.web.backlinks.list",
  "/v3/backlinks/domain_pages_summary/live":
    "dataforseo.x.backlinks-domain-pages-summary-live",
  "/v3/backlinks/history/live": "dataforseo.x.backlinks-history-live",
  "/v3/backlinks/referring_domains/live": "dataforseo.web.linking_domains.list",
  "/v3/backlinks/summary/live": "dataforseo.web.backlinks.summary",
  "/v3/business_data/business_listings/search/live":
    "dataforseo.x.business-data-business-listings-search-live",
  "/v3/business_data/google/extended_reviews/task_post":
    "dataforseo.x.business-data-google-extended-reviews-task-post",
  "/v3/business_data/google/extended_reviews/task_get/{id}":
    "dataforseo.x.business-data-google-extended-reviews-task-get",
  "/v3/business_data/google/my_business_info/live":
    "dataforseo.x.business-data-google-my-business-info-live",
  "/v3/business_data/google/my_business_updates/task_post":
    "dataforseo.x.business-data-google-my-business-updates-task-post",
  "/v3/business_data/google/my_business_updates/task_get/{id}":
    "dataforseo.x.business-data-google-my-business-updates-task-get",
  "/v3/business_data/google/questions_and_answers/live":
    "dataforseo.x.business-data-google-questions-and-answers-live",
  "/v3/business_data/google/reviews/task_post":
    "dataforseo.x.business-data-google-reviews-task-post",
  "/v3/business_data/google/reviews/task_get/{id}":
    "dataforseo.x.business-data-google-reviews-task-get",
  "/v3/dataforseo_labs/google/domain_rank_overview/live":
    "dataforseo.x.dataforseo-labs-google-domain-rank-overview-live",
  "/v3/dataforseo_labs/google/keyword_ideas/live":
    "dataforseo.x.dataforseo-labs-google-keyword-ideas-live",
  "/v3/dataforseo_labs/google/keyword_overview/live":
    "dataforseo.x.dataforseo-labs-google-keyword-overview-live",
  "/v3/dataforseo_labs/google/keyword_suggestions/live":
    "dataforseo.x.dataforseo-labs-google-keyword-suggestions-live",
  "/v3/dataforseo_labs/google/ranked_keywords/live":
    "dataforseo.google.domain.ranked_keywords",
  "/v3/dataforseo_labs/google/related_keywords/live":
    "dataforseo.google.keywords.ideas",
  "/v3/dataforseo_labs/google/relevant_pages/live":
    "dataforseo.x.dataforseo-labs-google-relevant-pages-live",
  "/v3/dataforseo_labs/google/serp_competitors/live":
    "dataforseo.x.dataforseo-labs-google-serp-competitors-live",
  "/v3/keywords_data/google_ads/keywords_for_keywords/live":
    "dataforseo.x.keywords-data-google-ads-keywords-for-keywords-live",
  "/v3/keywords_data/google_ads/search_volume/live":
    "dataforseo.google.keywords.volume",
  "/v3/on_page/lighthouse/live/json":
    "dataforseo.x.on-page-lighthouse-live-json",
  "/v3/serp/google/ai_mode/live/advanced":
    "dataforseo.x.serp-google-ai-mode-live-advanced",
  "/v3/serp/google/local_finder/live/advanced":
    "dataforseo.x.serp-google-local-finder-live-advanced",
  "/v3/serp/google/locations/{country}":
    "dataforseo.x.serp-google-locations-country",
  "/v3/serp/google/maps/live/advanced":
    "dataforseo.x.serp-google-maps-live-advanced",
  "/v3/serp/google/organic/live/advanced":
    "dataforseo.x.serp-google-organic-live-advanced",
  "/v3/ai_optimization/chat_gpt/llm_responses/live":
    "dataforseo.x.ai-optimization-chat-gpt-llm-responses-live",
  "/v3/ai_optimization/claude/llm_responses/live":
    "dataforseo.x.ai-optimization-claude-llm-responses-live",
  "/v3/ai_optimization/gemini/llm_responses/live":
    "dataforseo.x.ai-optimization-gemini-llm-responses-live",
  "/v3/ai_optimization/perplexity/llm_responses/live":
    "dataforseo.x.ai-optimization-perplexity-llm-responses-live",
  "/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced":
    "dataforseo.x.ai-optimization-chat-gpt-llm-scraper-live-advanced",
  "/v3/ai_optimization/gemini/llm_scraper/live/advanced":
    "dataforseo.x.ai-optimization-gemini-llm-scraper-live-advanced",
};

const ROUTES = Object.entries(TREG_ENDPOINTS).map(([pattern, endpointId]) => ({
  endpointId,
  params: [...pattern.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
  regex: new RegExp(`^${pattern.replace(/\{\w+\}/g, "([^/]+)")}$`),
}));

function notServedByTreg(path: string): AppError {
  return new AppError(
    "DATAFORSEO_AUTH_FAILED",
    `This feature needs DataForSEO's ${path}, which treg doesn't serve yet. Set DATAFORSEO_API_KEY to use it.`,
    { provider: "treg", providerPath: path },
  );
}

/** The treg call URL for a DataForSEO URL; throws when treg can't serve it. */
function tregUrlFor(dataforseoUrl: string): string {
  const url = new URL(dataforseoUrl);
  // The free validation sandbox has no treg twin, and sending its probe to
  // the live endpoint would bill it, so it is refused like any other gap.
  if (url.host !== DATAFORSEO_HOST) throw notServedByTreg(url.href);
  for (const route of ROUTES) {
    const match = route.regex.exec(url.pathname);
    if (!match) continue;
    const query = new URLSearchParams(url.search);
    route.params.forEach((name, index) =>
      query.set(name, decodeURIComponent(match[index + 1])),
    );
    const search = query.size > 0 ? `?${query}` : "";
    return `${TREG_BASE}/call/${route.endpointId}${search}`;
  }
  throw notServedByTreg(url.pathname);
}

/**
 * A fetch that takes DataForSEO URLs and serves them through treg, billed to
 * the treg team that owns `apiKey`. treg's own refusals (empty balance) come
 * back as OpenSEO errors; DataForSEO's answers pass through unchanged.
 */
export function createTregDataforseoFetch(apiKey: string): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const headers = new Headers(init?.headers);
    headers.set("X-Treg-Token", apiKey);
    const response = await fetch(tregUrlFor(rawUrl), { ...init, headers });
    if (response.status === 402) {
      // Out of prepaid balance: nothing was billed, and only a top-up helps.
      console.warn("treg.insufficient-balance", {
        event: "treg.insufficient-balance",
      });
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "Your treg balance is empty. Top up at https://treg.to to keep using SEO data.",
        { provider: "treg", providerStatus: "402" },
      );
    }
    return response;
  };
}
