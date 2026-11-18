import { useQuery } from "@tanstack/react-query";
import { getErrorCode } from "@/client/lib/error-messages";
import { getDomainOverview } from "@/serverFunctions/domain";
import type { ResearchScope } from "@/shared/researchScope";

type Input = {
  projectId: string;
  domain: string;
  scope: ResearchScope;
  locationCode: number | undefined;
};

export function useDomainOverviewQuery(input: Input) {
  const trimmedDomain = input.domain.trim();

  return useQuery({
    enabled: trimmedDomain !== "",
    queryKey: [
      "domain-overview",
      input.projectId,
      trimmedDomain,
      input.scope,
      input.locationCode,
    ],
    queryFn: () =>
      getDomainOverview({
        data: {
          projectId: input.projectId,
          domain: trimmedDomain,
          scope: input.scope,
          locationCode: input.locationCode,
        },
      }),
    staleTime: 5 * 60_000,
    // Out of credits, a retry cannot succeed, so show the get-credits card now.
    retry: (failureCount, error) =>
      failureCount < 3 && getErrorCode(error) !== "INSUFFICIENT_CREDITS",
  });
}
