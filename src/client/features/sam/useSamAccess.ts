import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getSamAccessSetupStatus } from "@/serverFunctions/samAccess";

type SamAccess = {
  // Only true once the setup check has resolved to "no access". It stays false
  // while the check is in flight, so the chat renders immediately instead of
  // blocking behind a skeleton — the gate only replaces it if we confirm the
  // OpenRouter key is missing.
  showSetupGate: boolean;
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
};

export function useSamAccess(projectId: string): SamAccess {
  // Hosted deployments always have OPENROUTER_API_KEY provisioned (the server
  // function short-circuits to enabled), so skip the round-trip entirely.
  const isHosted = isHostedClientAuthMode();

  const { data, error, isRefetching, refetch } = useQuery({
    queryKey: ["samAccessStatus", projectId],
    queryFn: () => getSamAccessSetupStatus({ data: { projectId } }),
    enabled: !isHosted,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isHosted) {
    return {
      showSetupGate: false,
      errorMessage: null,
      isRefetching: false,
      onRetry,
    };
  }

  // Optimistic: only gate once the check has actually resolved (success or
  // error) and it says the key isn't there.
  const resolved = data !== undefined || error != null;
  return {
    showSetupGate: resolved && !(data?.enabled ?? false),
    errorMessage:
      data?.errorMessage ??
      (error
        ? getStandardErrorMessage(
            error,
            "Could not load AI agent setup status.",
          )
        : null),
    isRefetching,
    onRetry,
  };
}
