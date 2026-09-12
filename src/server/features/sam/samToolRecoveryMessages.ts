import type { ToolAttemptState, ToolFailureClass } from "./samToolRecovery";

// Model-facing wording for the tool-recovery policy, split out of
// samToolRecovery.ts to keep both files within lint budgets. Every message is
// compact, names the tool and the failure class, and points at fallback
// sources — never raw provider text, stacks, or arguments.

const GENERIC_FALLBACK_HINT =
  "Use fallback sources instead: Search Console data, saved keywords, cached snapshots, or crawler/page analysis.";

const FALLBACK_HINTS: Record<string, string> = {
  research_keywords:
    "Use fallback sources instead: Search Console queries, saved keywords, cached keyword data, or SERP analysis.",
  get_keyword_metrics:
    "Use fallback sources instead: Search Console impressions/clicks, saved keywords, or cached metrics.",
  get_serp_results:
    "Use fallback sources instead: cached snapshots, Search Console data, or crawler/page analysis.",
  find_serp_competitors:
    "Use fallback sources instead: cached competitor snapshots, Search Console data, SERPs, or crawler/page analysis.",
  get_ranked_keywords:
    "Use fallback sources instead: cached snapshots, Search Console data, or SERP analysis.",
  get_domain_overview:
    "Use fallback sources instead: internal snapshots, cached overviews, Search Console data, or audit/crawler data.",
  get_domain_keyword_suggestions:
    "Use fallback sources instead: cached snapshots, Search Console data, or SERP analysis.",
  get_backlinks_overview:
    "Use fallback sources instead: cached backlink snapshots, Search Console links, or crawler data.",
  get_backlinks_profile:
    "Use fallback sources instead: cached backlink snapshots, Search Console links, or crawler data.",
};

export function fallbackHintFor(toolName: string): string {
  return FALLBACK_HINTS[toolName] ?? GENERIC_FALLBACK_HINT;
}

export function buildToolFailureMessage(
  toolName: string,
  failureClass: ToolFailureClass,
): string {
  const hint = fallbackHintFor(toolName);
  switch (failureClass) {
    case "CREDITS_UNAVAILABLE":
      return (
        `Tool "${toolName}" failed: credits unavailable — it is now unavailable ` +
        `for this turn. Do not retry it in this turn. ${hint}`
      );
    case "DATAFORSEO_ACCESS_PAUSED":
      return (
        `Tool "${toolName}" failed: DataForSEO temporarily paused API access ` +
        `due to unusual activity — it is now unavailable for this turn. Do not ` +
        `retry it in this turn. ${hint}`
      );
    case "PERMANENT_UNAVAILABLE":
      return (
        `Tool "${toolName}" is unavailable (configuration or capability error) — ` +
        `do not retry it in this turn. ${hint}`
      );
    case "RATE_LIMITED":
      return (
        `Tool "${toolName}" was rate-limited. One automatic retry is allowed; ` +
        `if it fails, do not retry again in this turn. ${hint}`
      );
    case "TRANSIENT_UPSTREAM":
      return (
        `Tool "${toolName}" hit a temporary error. One automatic retry is allowed; ` +
        `if it fails, do not retry again in this turn. ${hint}`
      );
    case "TOOL_INPUT_INVALID":
      // Phase V owns the detailed wording (curated validation detail is
      // composed at the failure site); this is the fallback when only the
      // class is known.
      return (
        `Invalid tool arguments for ${toolName}. ` +
        `The request was not executed and no provider call was made. ` +
        `Correct the arguments before retrying.`
      );
  }
}

/** Model-facing signal for a retry the state machine blocked before execute. */
export function buildToolBlockedMessage(
  toolName: string,
  state: ToolAttemptState,
): string {
  const hint = fallbackHintFor(toolName);
  const failureClass = state.lastFailureClass ?? "TRANSIENT_UPSTREAM";
  if (failureClass === "CREDITS_UNAVAILABLE") {
    return (
      `Tool "${toolName}" is unavailable for this turn because the previous ` +
      `attempt failed with CREDITS_UNAVAILABLE. Do not retry this tool in this ` +
      `turn. ${hint}`
    );
  }
  if (failureClass === "DATAFORSEO_ACCESS_PAUSED") {
    return (
      `Tool "${toolName}" is unavailable for this turn because the previous ` +
      `attempt failed with DATAFORSEO_ACCESS_PAUSED. Do not retry this tool ` +
      `in this turn. ${hint}`
    );
  }
  if (failureClass === "RATE_LIMITED") {
    return (
      `Tool "${toolName}" was rate-limited. One retry was already attempted ` +
      "and failed. Do not retry again in this turn. " +
      hint
    );
  }
  if (failureClass === "TOOL_INPUT_INVALID") {
    return (
      `Tool "${toolName}" already failed input validation twice in this turn. ` +
      `Do not retry it in this turn. ${hint}`
    );
  }
  return (
    `Tool "${toolName}" is unavailable for this turn after repeated failures ` +
    `(${failureClass}). Do not retry it in this turn. ${hint}`
  );
}
