import type { FreeToolSlug } from "@/lib/free-tools/tool-pages";

/**
 * Spend controls for the free tools. These live away from the marketing
 * registry on purpose: a copy edit to a tool's name or blurb must not be able
 * to move a spend ceiling.
 *
 * Every number below counts BILLABLE DATAFORSEO CALLS PER DAY, not tool runs —
 * one traffic check is three calls, one competitor analysis with your own
 * domain is five. `null` means the tool makes no paid call at all.
 *
 * The SEO report is the exception: it counts REPORTS. One report makes many
 * provider calls and pays a model too, so it reserves its whole ceiling once,
 * as a single unit, before it starts.
 *
 * Reservations are atomic in a Durable Object per UTC day. Reserve before
 * contacting the provider, including attempts that subsequently fail.
 */
/** New SEO reports the whole site starts in a day. */
export const SEO_REPORTS_PER_DAY = 25;

/**
 * The most one SEO report's model calls may cost. A run adds up OpenRouter's
 * own figure for each call and stops, with no report, before a call that
 * could take it past this at the model's list price.
 */
export const SEO_REPORT_MODEL_USD = 1;

/** One model's list price at OpenRouter, in dollars per million tokens. */
export type ModelPrice = {
  /**
   * An input token that isn't read from the cache. It is written to the
   * cache as it is read, so this is the cache-write price, a quarter more
   * than the plain input price. A test call on 2026-11-18 was charged it.
   */
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  /** From this many prompt tokens up, the whole call is charged at the long rates. */
  longPromptTokens: number;
  longInputUsd: number;
  longCachedInputUsd: number;
  longOutputUsd: number;
};

/**
 * The models an SEO report can be written with, each with its prices, looked
 * up 2026-11-18 at openrouter.ai/api/v1/models. A report counts its own
 * spend from them and stops at SEO_REPORT_MODEL_USD, so SEO_REPORT_MODEL in
 * wrangler.jsonc must name a model listed here: one with no prices doesn't
 * start. To use another model, add its row first.
 */
export const SEO_REPORT_MODEL_PRICES: Record<string, ModelPrice> = {
  "openai/gpt-6.2-sol": {
    inputUsd: 2.5,
    cachedInputUsd: 0.1,
    outputUsd: 10,
    longPromptTokens: 272_000,
    longInputUsd: 5,
    longCachedInputUsd: 0.2,
    longOutputUsd: 15,
  },
  "openai/gpt-6-luna": {
    inputUsd: 0.125,
    cachedInputUsd: 0.01,
    outputUsd: 0.5,
    longPromptTokens: 272_000,
    longInputUsd: 0.25,
    longCachedInputUsd: 0.02,
    longOutputUsd: 0.75,
  },
};

export const dataforseoCallsPerDay = {
  "backlink-checker": 1000,
  "competitor-keyword-finder": 2000,
  "keyword-generator": 2000,
  "website-traffic-checker": 3000,
  "competitor-analysis": 2500,
  "spam-score-checker": 600,
  "domain-age-checker": null,
  "serp-simulator": null,
  "seo-report": SEO_REPORTS_PER_DAY,
} satisfies Record<FreeToolSlug, number | null>;

/** Ceiling across every paid tool combined, below the sum of the per-tool caps. */
export const ALL_TOOLS_CALLS_PER_DAY = 6000;

/** Ceiling for one visitor across every paid tool, on top of the 5/min limit. */
export const PER_IP_CALLS_PER_DAY = 40;

/** Conservative USD ceilings in millionths, at the routes' fixed result limits.
 * Revisit when provider pricing, endpoints, row limits, or SERP depth change.
 * No refunds: failed or partially completed upstream requests remain reserved.
 */
export const reservedMicroDollarsPerCall = {
  "backlink-checker": 25_000,
  "competitor-keyword-finder": 15_000,
  "keyword-generator": 15_000,
  "website-traffic-checker": 15_000,
  "competitor-analysis": 15_000,
  "spam-score-checker": 25_000,
  // One whole report: $1 of model, which a run can't pass (it stops before a
  // call that could, SEO_REPORT_MODEL_USD), and $0.27 of search data at the
  // call counts and sizes in seo-report/tools.ts. The rest is room for a
  // change in DataForSEO's prices. A test recomputes the sum.
  "seo-report": 1_500_000,
} as const;
