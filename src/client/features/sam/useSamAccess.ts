import { useQuery } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getSamAccessSetupStatus } from "@/serverFunctions/samAccess";

// Fails closed: the chat only renders once the check confirms the OpenRouter
// key is set. A failed check is an error with retry, not the key-missing gate.
type SamAccess =
  | { status: "ready" }
  | { status: "checking" }
  | {
      status: "error";
      error: unknown;
      isRetrying: boolean;
      onRetry: () => void;
    }
  | {
      status: "setup";
      errorMessage: string | null;
      isRefetching: boolean;
      onRetry: () => void;
    };

export function useSamAccess(projectId: string): SamAccess {
  // Hosted deployments always have OPENROUTER_API_KEY provisioned (the server
  // function short-circuits to enabled), so skip the round-trip entirely.
  const isHosted = isHostedClientAuthMode();

  const { data, error, isFetching, isRefetching, refetch } = useQuery({
    queryKey: ["samAccessStatus", projectId],
    queryFn: () => getSamAccessSetupStatus({ data: { projectId } }),
    enabled: !isHosted,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });

  const onRetry = () => void refetch();

  if (isHosted) return { status: "ready" };
  if (data === undefined) {
    return error
      ? { status: "error", error, isRetrying: isFetching, onRetry }
      : { status: "checking" };
  }
  if (data.enabled) return { status: "ready" };
  return {
    status: "setup",
    errorMessage:
      data.errorMessage ??
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
