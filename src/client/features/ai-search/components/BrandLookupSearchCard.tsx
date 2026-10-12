import type { FormEvent } from "react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { ResearchScopeSelect } from "@/client/components/ResearchScopeSelect";
import { SearchCard, SearchInput } from "@/client/components/SearchCard";
import { Field, FieldDescription } from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import type { ResearchScope } from "@/shared/researchScope";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  scope: ResearchScope;
  onScopeChange: (next: ResearchScope) => void;
  scopeDisabledReason: string | undefined;
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
  scope,
  onScopeChange,
  scopeDisabledReason,
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
    <SearchCard
      onSubmit={onSubmit}
      pending={isLoading}
      error={validationError?.message}
      errorId="brand-lookup-input-error"
      secondRow={
        <>
          <Field>
            <Input
              placeholder="Add competitors (comma-separated)"
              value={competitors}
              onChange={(event) => onCompetitorsChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Competitors"
              aria-invalid={competitorsError || undefined}
              aria-describedby={
                competitorsError ? "brand-lookup-input-error" : undefined
              }
            />
            <FieldDescription>
              Add up to 5 competitor brands or domains to see your Share of
              Voice.
            </FieldDescription>
          </Field>
          <p className="text-xs text-muted-foreground tabular-nums">
            Est.{" "}
            <span className="font-medium text-foreground">
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
        </>
      }
    >
      <SearchInput
        placeholder="Enter a brand name or domain"
        aria-label="Brand name or domain"
        value={query}
        maxLength={BRAND_LOOKUP_MAX_INPUT_LENGTH}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-invalid={queryError || undefined}
        aria-describedby={queryError ? "brand-lookup-input-error" : undefined}
        autoComplete="off"
        spellCheck={false}
      />

      <ResearchScopeSelect
        value={scope}
        className="w-full lg:w-40"
        onChange={onScopeChange}
        disabledReason={scopeDisabledReason}
      />
    </SearchCard>
  );
}
