import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Quote,
  TrendingUp,
} from "lucide-react";
import { lookupBrand } from "@/serverFunctions/ai-search";
import {
  HostedPlanGate,
  type HostedPlanGateState,
} from "@/client/features/billing/HostedPlanGate";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { BrandLookupResults } from "@/client/features/ai-search/components/BrandLookupResults";
import { BrandLookupSearchCard } from "@/client/features/ai-search/components/BrandLookupSearchCard";
import { BrandLookupHistorySection } from "@/client/features/ai-search/components/BrandLookupHistorySection";
import { AiSearchLoadingState } from "@/client/features/ai-search/components/AiSearchLoadingState";
import { AiSearchPaidPlanGate } from "@/client/features/ai-search/components/AiSearchPaidPlanGate";
import { useBrandLookupSearchHistory } from "@/client/hooks/useBrandLookupSearchHistory";
import {
  BRAND_LOOKUP_MAX_INPUT_LENGTH,
  parseCompetitorList,
} from "@/types/schemas/ai-search";
import { detectTarget } from "@/shared/targetDetection";

type Props = {
  projectId: string;
  initialQuery: string;
  initialCompetitors: string[];
  onSearchChange: (nextQuery: string, nextCompetitors: string[]) => void;
};

const BRAND_LOOKUP_BULLETS = [
  {
    icon: TrendingUp,
    title: "Track AI visibility",
    body: "See estimated counts for ChatGPT and Google AI Overview answers that cite your brand, and watch the trend month over month.",
  },
  {
    icon: Quote,
    title: "See the prompts",
    body: "View sample user questions where LLMs reference your brand or domain.",
  },
  {
    icon: BarChart3,
    title: "Map the competition",
    body: "Spot the pages LLMs cite alongside you so you know who's competing for attention in AI answers.",
  },
];

export function BrandLookupPage(props: Props) {
  return (
    <HostedPlanGate>
      {(planGate) => <BrandLookupPageInner {...props} planGate={planGate} />}
    </HostedPlanGate>
  );
}

function BrandLookupPageInner({
  projectId,
  initialQuery,
  initialCompetitors,
  onSearchChange,
  planGate,
}: Props & { planGate: HostedPlanGateState }) {
  const [query, setQuery] = useState(initialQuery);
  // Raw comma-separated competitor text; parsed into a deduped array on submit.
  const [competitorsInput, setCompetitorsInput] = useState(
    initialCompetitors.join(", "),
  );
  // Field-tagged so the error styling lands on the input that caused it.
  const [validationError, setValidationError] = useState<{
    field: "query" | "competitors";
    message: string;
  } | null>(null);

  const trimmedInitialQuery = initialQuery.trim();
  const hasActiveQuery = trimmedInitialQuery.length > 0;
  // The URL `c` param is the source of truth for the active lookup; the local
  // `competitorsInput` text only drives the input until the next submit. A
  // stable string key, since `initialCompetitors` is a fresh array each render.
  const competitorKey = initialCompetitors.join(",");

  const lookupQuery = useQuery({
    queryKey: ["brand-lookup", projectId, trimmedInitialQuery, competitorKey],
    queryFn: () =>
      lookupBrand({
        data: {
          projectId,
          query: trimmedInitialQuery,
          competitors: initialCompetitors,
          locationCode: 2840,
          languageCode: "en",
        },
      }),
    // Client-side gate is a UX optimization only; the paywall is enforced
    // server-side (lookupBrand → assertPaidPlan) before any DataForSEO spend,
    // so a stale free-plan window here just yields a rejected request, not cost.
    enabled: hasActiveQuery && !planGate.isFreePlan,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useBrandLookupSearchHistory(projectId);

  // Dedup ref prevents repeat adds — `addSearch` identity is not stable
  // across renders, so we'd otherwise re-write the same item every render.
  // Key on query + competitors so changing competitors records a fresh entry.
  const lastAddedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasActiveQuery || !lookupQuery.isSuccess) return;
    const addedKey = `${trimmedInitialQuery}::${competitorKey}`;
    if (lastAddedKeyRef.current === addedKey) return;
    lastAddedKeyRef.current = addedKey;
    addSearch({
      query: trimmedInitialQuery,
      competitors: competitorKey ? competitorKey.split(",") : [],
    });
  }, [
    hasActiveQuery,
    lookupQuery.isSuccess,
    trimmedInitialQuery,
    competitorKey,
    addSearch,
  ]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setValidationError({
        field: "query",
        message: "Enter a brand name or domain",
      });
      return;
    }
    if (trimmed.length > BRAND_LOOKUP_MAX_INPUT_LENGTH) {
      setValidationError({
        field: "query",
        message: `Keep it under ${BRAND_LOOKUP_MAX_INPUT_LENGTH} characters`,
      });
      return;
    }
    const competitors = parseCompetitorList(competitorsInput);
    // Mirror the server's input schema (per-item max) and its competitor
    // resolution (a competitor that resolves to the target is dropped) so the
    // user gets an inline message instead of a generic server error or a
    // silently missing Share of Voice section.
    const tooLong = competitors.find(
      (competitor) => competitor.length > BRAND_LOOKUP_MAX_INPUT_LENGTH,
    );
    if (tooLong) {
      setValidationError({
        field: "competitors",
        message: `Keep each competitor under ${BRAND_LOOKUP_MAX_INPUT_LENGTH} characters`,
      });
      return;
    }
    const targetValue = detectTarget(trimmed).value.toLowerCase();
    const matchesTarget = competitors.find(
      (competitor) =>
        detectTarget(competitor).value.toLowerCase() === targetValue,
    );
    if (matchesTarget) {
      setValidationError({
        field: "competitors",
        message: `"${matchesTarget}" matches the brand you're looking up — remove it from competitors`,
      });
      return;
    }
    setValidationError(null);
    onSearchChange(trimmed, competitors);
  };

  // The form inputs are reset whenever the URL `q`/`c` changes — including the
  // browser-back path and Cmd+click navigation. This keeps local form state in
  // sync with the URL source-of-truth. Depend on the stable `competitorKey`
  // string (not the fresh-each-render `initialCompetitors` array) so typing in
  // the competitor field isn't clobbered on every render.
  useEffect(() => {
    setQuery(initialQuery);
    setCompetitorsInput(competitorKey.split(",").join(", "));
    setValidationError(null);
  }, [initialQuery, competitorKey]);

  const isLoading = hasActiveQuery && lookupQuery.isPending;
  const errorMessage =
    hasActiveQuery && lookupQuery.isError
      ? getStandardErrorMessage(lookupQuery.error)
      : null;
  const resultData = hasActiveQuery ? lookupQuery.data : undefined;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Brand Lookup</h1>
          <p className="text-sm text-base-content/70">
            See how AI search cites any brand name or domain.
          </p>
        </div>

        {planGate.isFreePlan ? (
          <AiSearchPaidPlanGate
            feature="Brand Lookup"
            description="See how ChatGPT and Google AI Overview cite any brand or domain — total mentions, sample prompts where it appears, and the pages cited alongside it."
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
              competitors={competitorsInput}
              onCompetitorsChange={(next) => {
                setCompetitorsInput(next);
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
                  <Link
                    from="/p/$projectId/brand-lookup"
                    to="/p/$projectId/brand-lookup"
                    params={{ projectId }}
                    search={{ q: undefined, c: undefined }}
                    replace
                    className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
                  >
                    <ArrowLeft className="size-4" />
                    Recent searches
                  </Link>
                </div>
                <BrandLookupResults result={resultData} projectId={projectId} />
              </>
            ) : !errorMessage ? (
              <BrandLookupHistorySection
                projectId={projectId}
                history={history}
                historyLoaded={historyLoaded}
                onRemoveHistoryItem={removeHistoryItem}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
