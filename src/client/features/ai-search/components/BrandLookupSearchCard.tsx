import type { FormEvent } from "react";
import { Search } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  onSubmit: (event: FormEvent) => void;
  isLoading: boolean;
  validationError: string | null;
};

/**
 * One brand lookup = 6 DataForSEO calls (3 endpoints × 2 platforms). Measured
 * live at ~$0.634 raw via `pnpm billing:brand-lookup`; rounded up to leave
 * headroom for per-query variance.
 */
const BRAND_LOOKUP_RAW_COST_USD = 0.65;

// Hosted customers are billed the marked-up USD; self-hosted users pay
// DataForSEO directly at the raw rate.
const BRAND_LOOKUP_DISPLAYED_COST_USD = isHostedClientAuthMode()
  ? applyBillingMarkupUsd(BRAND_LOOKUP_RAW_COST_USD)
  : BRAND_LOOKUP_RAW_COST_USD;

export function BrandLookupSearchCard({
  query,
  onQueryChange,
  onSubmit,
  isLoading,
  validationError,
}: Props) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
        >
          <label
            className={`input input-bordered flex flex-1 items-center gap-2 ${
              validationError ? "input-error" : ""
            }`}
          >
            <Search className="size-4 text-base-content/60" />
            <input
              type="text"
              placeholder="Enter a brand name or domain"
              value={query}
              maxLength={BRAND_LOOKUP_MAX_INPUT_LENGTH}
              onChange={(event) => onQueryChange(event.target.value)}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={
                validationError ? "brand-lookup-input-error" : undefined
              }
              autoComplete="off"
              spellCheck={false}
              className="grow"
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary px-6"
            disabled={isLoading}
          >
            {isLoading ? "Looking up..." : "Look up"}
          </button>
        </form>

        {validationError ? (
          <p id="brand-lookup-input-error" className="text-sm text-error">
            {validationError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60">
          <p className="tabular-nums">
            Est.{" "}
            <span className="font-medium text-base-content/80">
              ${BRAND_LOOKUP_DISPLAYED_COST_USD.toFixed(2)}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
