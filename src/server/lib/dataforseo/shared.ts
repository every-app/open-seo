// SDK-free constants and target builders shared between eager server code
// (features, workflows, MCP tools) and the lazily loaded section fetchers.
// Keep this module free of dataforseo-client and section-file imports —
// anything imported from here must be safe to evaluate in the eager isolate
// startup graph.

// ChatGPT mention/response data is only available for US/en per DataForSEO docs.
export const CHATGPT_LOCATION_CODE = 2840;
export const CHATGPT_LANGUAGE_CODE = "en";

export type LlmPlatform = "chat_gpt" | "google";

/** Max tasks DataForSEO accepts in a single task_post request. */
export const MAX_TASKS_PER_POST = 100;

// DataForSEO's LLM-mentions `target` array accepts domain OR keyword entries.
// We always pass exactly one target per call.
export type LlmTarget =
  | {
      domain: string;
      include_subdomains?: boolean;
      search_filter?: "include" | "exclude";
      search_scope?: string[];
    }
  | {
      keyword: string;
      search_filter?: "include" | "exclude";
      search_scope?: string[];
      match_type?: "word_match" | "partial_match";
    };

export function buildLlmTarget(input: {
  type: "domain" | "keyword";
  value: string;
}): LlmTarget {
  if (input.type === "domain") {
    return {
      domain: input.value,
      include_subdomains: true,
      search_filter: "include",
      search_scope: ["any"],
    };
  }
  return {
    keyword: input.value,
    search_filter: "include",
    search_scope: ["any", "brand_entities"],
    match_type: "word_match",
  };
}
