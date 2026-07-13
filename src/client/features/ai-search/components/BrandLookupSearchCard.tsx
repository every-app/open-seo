import type { FormEvent } from "react";
import { Search } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  competitors: string;
  onCompetitorsChange: (next: string) => void;
  onSubmit: (event: FormEvent) => void;
  isLoading: boolean;
  validationError: { field: "query" | "competitors"; message: string } | null;
};

/**
 * One brand lookup = 6 DataForSEO calls (aggregated_metrics + top_pages +
 * mentions_search × 2 platforms). Rounded up with headroom because
 * mentions_search is row-priced at the full 100-row sample per platform.
 */
const BRAND_LOOKUP_RAW_COST_USD = 0.85;

/**
 * Adding competitors triggers 2 extra cross_aggregated_metrics calls (one per
 * platform). Measured live (Jun 2026) at $0.101 each — $0.202 total for a
 * 4-group comparison — via `pnpm billing:brand-lookup --competitors=...`. A
 * fixed estimate, marked up once at module load exactly like the base.
 */
const BRAND_LOOKUP_COMPETITOR_RAW_COST_USD = 0.2;

// Hosted customers are billed the marked-up USD; self-hosted users pay
// DataForSEO directly at the raw rate.
const markup = (rawUsd: number) =>
  isHostedClientAuthMode() ? applyBillingMarkupUsd(rawUsd) : rawUsd;

const BRAND_LOOKUP_DISPLAYED_COST_USD = markup(BRAND_LOOKUP_RAW_COST_USD);
const BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD = markup(
  BRAND_LOOKUP_COMPETITOR_RAW_COST_USD,
);

export function BrandLookupSearchCard({
  query,
  onQueryChange,
  competitors,
  onCompetitorsChange,
  onSubmit,
  isLoading,
  validationError,
}: Props) {
  const hasCompetitors = competitors.trim().length > 0;
  const queryError = validationError?.field === "query";
  const competitorsError = validationError?.field === "competitors";

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label
              className={`input input-bordered flex flex-1 items-center gap-2 ${
                queryError ? "input-error" : ""
              }`}
            >
              <Search className="size-4 text-base-content/60" />
              <input
                type="text"
                placeholder="Enter a brand name or domain"
                value={query}
                maxLength={BRAND_LOOKUP_MAX_INPUT_LENGTH}
                onChange={(event) => onQueryChange(event.target.value)}
                aria-invalid={queryError || undefined}
                aria-describedby={
                  queryError ? "brand-lookup-input-error" : undefined
                }
                autoComplete="off"
                spellCheck={false}
                className="grow"
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary shrink-0 px-6"
              disabled={isLoading}
            >
              {isLoading ? "Looking up..." : "Look up"}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="text"
              placeholder="Add competitors (comma-separated)"
              value={competitors}
              onChange={(event) => onCompetitorsChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={`input input-bordered w-full ${
                competitorsError ? "input-error" : ""
              }`}
              aria-label="Competitors"
              aria-invalid={competitorsError || undefined}
              aria-describedby={
                competitorsError ? "brand-lookup-input-error" : undefined
              }
            />
            <p className="text-xs text-base-content/60">
              Add up to 5 competitor brands or domains to see your Share of
              Voice.
            </p>
          </div>
        </form>

        {validationError ? (
          <p id="brand-lookup-input-error" className="text-sm text-error">
            {validationError.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60">
          <p className="tabular-nums">
            Est.{" "}
            <span className="font-medium text-base-content/80">
              ${BRAND_LOOKUP_DISPLAYED_COST_USD.toFixed(2)}
            </span>
            {hasCompetitors ? (
              <span>
                {" "}
                plus ~$
                {BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD.toFixed(2)} to
                compare competitors
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
