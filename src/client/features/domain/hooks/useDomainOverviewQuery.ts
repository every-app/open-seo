import { useQuery } from "@tanstack/react-query";
import { getDomainOverview } from "@/serverFunctions/domain";
import { globalTraceStore } from "@/client/features/tracing/globalTraceStore";

type Input = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
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
      input.includeSubdomains,
      input.locationCode,
    ],
    queryFn: async () => {
      const opId = globalTraceStore.startOperation({
        feature: "domain_overview",
        operation: "domain_overview.get",
        source: "Domain Overview page",
        projectId: input.projectId,
        status: "running",
        billing: "Paid",
        metered: true,
        budget: "PASS",
        cache: "HIT",
        provider: "DataForSEO",
        metadata: {
          domain: trimmedDomain,
          includeSubdomains: input.includeSubdomains,
          locationCode: input.locationCode,
        },
      });

      try {
        const result = await getDomainOverview({
          data: {
            projectId: input.projectId,
            domain: trimmedDomain,
            includeSubdomains: input.includeSubdomains,
            locationCode: input.locationCode,
          },
        });

        globalTraceStore.completeOperation(opId, {
          status: "success",
          httpStatus: 200,
          providerCalls: 1,
          providerBreakdown: [{ provider: "DataForSEO", count: 1 }],
          providers: [
            {
              provider: "DataForSEO",
              endpoint: "v3/dataforseo_labs/google/domain_rank_overview/live",
              httpStatus: 200,
              taskStatus: 20000,
              transport: "HTTP",
              billing: "Paid",
              metered: true,
              budgetGuard: "PASS",
            },
          ],
          cache: "HIT",
          cacheType: "R2 / internal snapshot",
        });

        return result;
      } catch (err) {
        globalTraceStore.completeOperation(opId, {
          status: "failed",
          httpStatus: 500,
          errorMessage:
            err instanceof Error ? err.message : "Failed to fetch domain overview",
        });
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}
