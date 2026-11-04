export type CreditFeature =
  | "keyword_research"
  | "domain_overview"
  | "backlinks"
  | "site_audit"
  | "rank_tracking"
  | "ai_citations"
  | "ai_prompt_responses"
  | "local_seo"
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
  // The onboarding chat is gone, but historical usage events still carry this
  // key — keep the label so old billing breakdowns don't render "Other".
  onboarding: "Onboarding",
  agent: "SAM Agent",
};

export function creditFeatureLabel(key: string) {
  return CREDIT_FEATURE_LABELS[key] ?? "Other";
}
