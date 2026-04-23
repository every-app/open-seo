import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AutumnProvider, useCustomer } from "autumn-js/react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Quote,
  TrendingUp,
} from "lucide-react";
import { lookupBrand } from "@/serverFunctions/ai-search";
import { useSession } from "@/lib/auth-client";
import { getCustomerPlanStatus } from "@/client/features/billing/plan-detection";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { BrandLookupResults } from "@/client/features/ai-search/components/BrandLookupResults";
import { BrandLookupSearchCard } from "@/client/features/ai-search/components/BrandLookupSearchCard";
import { BrandLookupHistorySection } from "@/client/features/ai-search/components/BrandLookupHistorySection";
import { AiSearchLoadingState } from "@/client/features/ai-search/components/AiSearchLoadingState";
import { AiSearchPaidPlanGate } from "@/client/features/ai-search/components/AiSearchPaidPlanGate";
import { useBrandLookupSearchHistory } from "@/client/hooks/useBrandLookupSearchHistory";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

type Props = {
  projectId: string;
  initialQuery: string;
  onQueryChange: (next: string) => void;
};

const BRAND_LOOKUP_BULLETS = [
  {
    icon: TrendingUp,
    title: "Track AI visibility",
    body: "Count how often ChatGPT and Google AI Overview cite your brand, and watch the trend month over month.",
  },
  {
    icon: Quote,
    title: "See the prompts",
    body: "View the actual user questions where LLMs reference your domain — the real demand driving AI traffic.",
  },
  {
    icon: BarChart3,
    title: "Map the competition",
    body: "Spot the pages LLMs cite alongside you so you know who's competing for attention in AI answers.",
  },
];

export function BrandLookupPage(props: Props) {
  return (
    <AutumnProvider>
      <BrandLookupPageInner {...props} />
    </AutumnProvider>
  );
}

function BrandLookupPageInner({
  projectId,
  initialQuery,
  onQueryChange,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: session } = useSession();
  const customerQuery = useCustomer({
    queryOptions: { enabled: Boolean(session?.user?.id) },
  });
  const planKnown = customerQuery.isSuccess || customerQuery.isError;
  const isFreePlan =
    !!customerQuery.data &&
    getCustomerPlanStatus(customerQuery.data) === "free";

  const trimmedInitialQuery = initialQuery.trim();
  const hasActiveQuery = trimmedInitialQuery.length > 0;

  const lookupQuery = useQuery({
    queryKey: ["brand-lookup", projectId, trimmedInitialQuery],
    queryFn: () =>
      lookupBrand({
        data: {
          projectId,
          query: trimmedInitialQuery,
          locationCode: 2840,
          languageCode: "en",
        },
      }),
    enabled: hasActiveQuery && !isFreePlan,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useBrandLookupSearchHistory(projectId);

  useEffect(() => {
    if (hasActiveQuery && lookupQuery.isSuccess) {
      addSearch({ query: trimmedInitialQuery });
    }
  }, [hasActiveQuery, lookupQuery.isSuccess, trimmedInitialQuery, addSearch]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setValidationError("Enter a brand name or domain");
      return;
    }
    if (trimmed.length > BRAND_LOOKUP_MAX_INPUT_LENGTH) {
      setValidationError(
        `Keep it under ${BRAND_LOOKUP_MAX_INPUT_LENGTH} characters`,
      );
      return;
    }
    setValidationError(null);
    onQueryChange(trimmed);
  };

  const handleSelectHistoryItem = (item: { query: string }) => {
    setQuery(item.query);
    setValidationError(null);
    onQueryChange(item.query);
  };

  const handleShowRecentSearches = () => {
    setQuery("");
    setValidationError(null);
    onQueryChange("");
  };

  const isLoading = hasActiveQuery && lookupQuery.isPending;
  const errorMessage =
    hasActiveQuery && lookupQuery.isError
      ? getStandardErrorMessage(lookupQuery.error)
      : null;
  const resultData = hasActiveQuery ? lookupQuery.data : undefined;

  if (!planKnown) return null;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Brand Lookup</h1>
          <p className="text-sm text-base-content/70">
            See how AI search cites any brand name or domain.
          </p>
        </div>

        {isFreePlan ? (
          <AiSearchPaidPlanGate
            feature="Brand Lookup"
            description="See how ChatGPT and Google AI Overview cite any brand or domain — total mentions, the prompts driving them, and the pages cited alongside yours."
            bullets={BRAND_LOOKUP_BULLETS}
          />
        ) : (
          <>
            <BrandLookupSearchCard
              query={query}
              onQueryChange={(next) => {
                setQuery(next);
                if (validationError) setValidationError(null);
              }}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              validationError={validationError}
            />

            {errorMessage ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {isLoading ? (
              <AiSearchLoadingState />
            ) : resultData ? (
              <>
                <div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
                    onClick={handleShowRecentSearches}
                  >
                    <ArrowLeft className="size-4" />
                    Recent searches
                  </button>
                </div>
                <BrandLookupResults result={resultData} />
              </>
            ) : !errorMessage ? (
              <BrandLookupHistorySection
                history={history}
                historyLoaded={historyLoaded}
                onRemoveHistoryItem={removeHistoryItem}
                onSelectHistoryItem={handleSelectHistoryItem}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
