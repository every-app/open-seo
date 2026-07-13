export type CreditFeature =
  | "keyword_research"
  | "domain_overview"
  | "backlinks"
  | "site_audit"
  | "rank_tracking"
  | "ai_citations"
  | "ai_prompt_responses"
  | "local_seo"
  | "onboarding"
  | "agent";

const CREDIT_FEATURE_LABELS: Record<string, string> = {
  keyword_research: "Keyword Research",
  domain_overview: "Domain Overview",
  backlinks: "Backlinks",
  site_audit: "Site Audit",
  rank_tracking: "Rank Tracking",
  ai_citations: "AI Citations",
  ai_prompt_responses: "AI Prompt Responses",
  ai_search: "AI Search",
  local_seo: "Local SEO",
  onboarding: "Onboarding",
  agent: "SAM Agent",
};

/**
 * Maps a DataForSEO API response path (e.g. ["v3", "dataforseo_labs", "google", "related_keywords", "live"])
 * to a product feature for analytics. path[1] is the API module; for dataforseo_labs,
 * path[3] distinguishes keyword vs domain endpoints.
 */
export function mapDataforseoPathToCreditFeature(
  path: readonly string[],
): CreditFeature {
  const normalizedPath = path[0] === "v3" ? path : ["v3", ...path];
  const module = normalizedPath[1];

  switch (module) {
    case "on_page":
      return "site_audit";
    case "backlinks":
      return "backlinks";
    case "serp":
      return normalizedPath[2] === "google" &&
        ["maps", "local_finder"].includes(normalizedPath[3])
        ? "local_seo"
        : "keyword_research";
    case "ai_optimization":
      // llm_mentions/* are brand-citation lookups; every other ai_optimization
      // endpoint is a provider /llm_responses prompt response (chat_gpt, claude,
      // gemini, perplexity).
      return normalizedPath[2] === "llm_mentions"
        ? "ai_citations"
        : "ai_prompt_responses";
    case "business_data":
      return "local_seo";
    case "keywords_data":
      return "keyword_research";
    case "dataforseo_labs": {
      const endpoint = normalizedPath[3] ?? "";
      if (
        endpoint.startsWith("domain_") ||
        endpoint === "ranked_keywords" ||
        endpoint === "relevant_pages"
      ) {
        return "domain_overview";
      }
      return "keyword_research";
    }
    default:
      return "site_audit";
  }
}

export function creditFeatureLabel(key: string) {
  return CREDIT_FEATURE_LABELS[key] ?? "Other";
}
