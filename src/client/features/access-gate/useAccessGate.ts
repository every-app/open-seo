import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type AccessGateStatus = {
  enabled: boolean;
  errorMessage: string | null;
};

export type UseAccessGateResult = {
  enabled: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  errorMessage: string | null;
  statusErrorMessage: string | null;
  onRetry: () => void;
};

export function useAccessGate(config: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<AccessGateStatus>;
  statusErrorFallback: string;
}): UseAccessGateResult {
  const { data, error, isPending, isRefetching, refetch } = useQuery({
    queryKey: config.queryKey,
    queryFn: config.queryFn,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });

  const statusErrorMessage = error
    ? getStandardErrorMessage(error, config.statusErrorFallback)
    : null;
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    enabled: data?.enabled ?? false,
    isLoading: isPending,
    isRefetching,
    errorMessage: data?.errorMessage ?? null,
    statusErrorMessage,
    onRetry,
  };
}
