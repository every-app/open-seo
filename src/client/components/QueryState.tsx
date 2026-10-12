import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { ErrorState } from "@/client/components/ErrorState";
import { InsufficientCreditsError } from "@/client/features/billing/InsufficientCreditsError";
import { SkeletonCard } from "./SkeletonPresets";

/**
 * A load failure with a retry button. The message goes through
 * `getStandardErrorMessage`. Out of credits, a retry can't succeed, so it
 * says how to get more credits instead.
 */
export function QueryError({
  error,
  cause,
  fallback,
  onRetry,
  isRetrying = false,
  variant,
  title,
}: {
  /** Omit to always show `fallback`, for errors the page words itself. */
  error?: unknown;
  /**
   * The error behind a `fallback` the page words itself; picks the button.
   * Out of credits, the plan's own copy replaces the fallback.
   */
  cause?: unknown;
  /** Shown when the error has no message of its own. */
  fallback: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  variant?: "inline" | "card" | "page";
  title?: string;
}) {
  if (getErrorCode(error ?? cause) === "INSUFFICIENT_CREDITS") {
    return <InsufficientCreditsError variant={variant} title={title} />;
  }
  return (
    <ErrorState
      variant={variant}
      title={title}
      message={getStandardErrorMessage(error, fallback)}
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  );
}

/**
 * Loading, error with retry, or content for one query. A failed refetch keeps
 * the loaded content on screen, with the error above it.
 */
export function QueryState<TData>({
  query,
  errorFallback,
  loading = <SkeletonCard />,
  children,
}: {
  query: UseQueryResult<TData>;
  errorFallback: string;
  loading?: ReactNode;
  children: (data: TData) => ReactNode;
}) {
  if (query.isPending) return loading;

  const error = query.isError ? (
    <QueryError
      error={query.error}
      fallback={errorFallback}
      onRetry={() => void query.refetch()}
      isRetrying={query.isFetching}
    />
  ) : null;

  if (query.data === undefined) return error;

  return (
    <>
      {error}
      {children(query.data)}
    </>
  );
}
