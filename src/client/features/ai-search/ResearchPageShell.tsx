import { useEffect, useRef, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import {
  SkeletonStatGrid,
  SkeletonTableRows,
} from "@/client/components/SkeletonPresets";
import { Card, CardContent } from "@/client/components/ui/card";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  PaidPlanGate,
  type PaidPlanGateCopy,
} from "@/client/features/billing/PaidPlanGate";

/**
 * The frame of Brand Lookup and Prompt Explorer: header, paid-plan gate,
 * search form, error, then the loading skeleton, the results or the recent
 * searches. The URL holds the active search; the page holds the form state.
 */
export function ResearchPageShell<TData>({
  title,
  description,
  contained = false,
  gate,
  form,
  tabs,
  loadingState,
  query,
  hasActiveQuery,
  errorFallback,
  urlKey,
  onUrlChange,
  historyKey,
  onSuccess,
  backLink,
  renderResults,
  history,
}: {
  title: string;
  description: string;
  /** The route already supplies the page padding and scroll container. */
  contained?: boolean;
  gate: PaidPlanGateCopy;
  form: ReactNode;
  /** Search tabs above the results; absent on pages without tabs. */
  tabs?: ReactNode;
  /** A skeleton shaped like this page's results; defaults to a generic one. */
  loadingState?: ReactNode;
  query: UseQueryResult<TData>;
  hasActiveQuery: boolean;
  errorFallback: string;
  /** Changes with the URL search. The page resets its form in `onUrlChange`. */
  urlKey: string;
  onUrlChange: () => void;
  /** Identifies the active search. `onSuccess` runs once per key. */
  historyKey: string;
  onSuccess: () => void;
  backLink: ReactNode;
  renderResults: (data: TData) => ReactNode;
  history: ReactNode;
}) {
  // Browser back/forward and history links change the URL, not the form.
  // Keep the latest callback in a ref so only a URL change resets the form.
  const onUrlChangeRef = useRef(onUrlChange);
  onUrlChangeRef.current = onUrlChange;
  useEffect(() => {
    onUrlChangeRef.current();
  }, [urlKey]);

  // Record each successful search once. Failed searches stay out of history.
  const lastAddedKeyRef = useRef<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  useEffect(() => {
    if (!hasActiveQuery || !query.isSuccess) return;
    if (lastAddedKeyRef.current === historyKey) return;
    lastAddedKeyRef.current = historyKey;
    onSuccessRef.current();
  }, [hasActiveQuery, query.isSuccess, historyKey]);

  const isLoading = hasActiveQuery && query.isPending;
  const errorMessage =
    hasActiveQuery && query.isError
      ? getStandardErrorMessage(query.error, errorFallback)
      : null;
  const resultData = hasActiveQuery ? query.data : undefined;

  return (
    <div
      className={
        contained
          ? undefined
          : "overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8"
      }
    >
      <PaidPlanGate {...gate}>
        <div className="mx-auto max-w-7xl space-y-4">
          <PageHeader
            title={title}
            description={description}
            backLink={hasActiveQuery ? backLink : undefined}
          />

          {form}

          {tabs}

          {errorMessage ? (
            <QueryError
              cause={query.error}
              fallback={
                resultData
                  ? `${errorMessage} Showing earlier results.`
                  : errorMessage
              }
              onRetry={() => void query.refetch()}
              isRetrying={query.isFetching}
            />
          ) : null}

          {isLoading
            ? (loadingState ?? (
                <div className="space-y-4">
                  <SkeletonStatGrid count={3} className="lg:grid-cols-3" />
                  <Card>
                    <CardContent>
                      <SkeletonTableRows rows={6} columns={3} />
                    </CardContent>
                  </Card>
                </div>
              ))
            : resultData
              ? renderResults(resultData)
              : !errorMessage
                ? history
                : null}
        </div>
      </PaidPlanGate>
    </div>
  );
}
