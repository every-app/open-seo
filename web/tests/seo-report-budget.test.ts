import { expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
import {
  dataforseoCallsPerDay,
  reservedMicroDollarsPerCall,
  SEO_REPORT_MODEL_USD,
  SEO_REPORTS_PER_DAY,
} from "../src/lib/free-tools/spend";
import { TOOL_LIMITS } from "../src/lib/seo-report/tools";

// The reservation is what stands between the report tool and the daily
// budget. If a tool's call count or size is raised, or the model's cap, this
// says the reservation has to be looked at again.

// DataForSEO's list prices, in dollars: a Labs task and each row it returns,
// and one live read of a results page.
const LABS_TASK = 0.01;
const LABS_ROW = 0.0001;
const SERP_READ = 0.002;

it("reserves at least what one report can spend at its limits", () => {
  const labs = (rows: number) => LABS_TASK + rows * LABS_ROW;
  const data =
    TOOL_LIMITS.get_domain_overview.calls * labs(1) +
    TOOL_LIMITS.get_domain_keyword_suggestions.calls * labs(100) +
    TOOL_LIMITS.get_keyword_metrics.calls *
      labs(TOOL_LIMITS.get_keyword_metrics.keywords) +
    TOOL_LIMITS.research_keywords.calls *
      TOOL_LIMITS.research_keywords.seeds *
      labs(150) +
    TOOL_LIMITS.get_serp_results.calls *
      TOOL_LIMITS.get_serp_results.keywords *
      3 *
      SERP_READ;
  // The model's dollars are a true ceiling: a run stops before a call that
  // could pass it (seo-report-write.test.ts). Search operators, the one thing
  // a keyword can do to raise DataForSEO's price, never reach it.
  const most = data + SEO_REPORT_MODEL_USD;
  expect(
    reservedMicroDollarsPerCall["seo-report"] / 1_000_000,
  ).toBeGreaterThanOrEqual(most);
  expect(dataforseoCallsPerDay["seo-report"]).toBe(SEO_REPORTS_PER_DAY);
});
