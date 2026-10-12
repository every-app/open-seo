import { useQuery } from "@tanstack/react-query";
import { getDomainKeywordsPage } from "@/serverFunctions/domain";
import type { ResearchScope } from "@/shared/researchScope";
import type {
  DomainFilterValues,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";

type DomainKeywordsQueryInput = {
  projectId: string;
  domain: string;
  scope: ResearchScope;
  locationCode: number | undefined;
  page: number;
  pageSize: number;
  sortMode: DomainSortMode;
  sortOrder: SortOrder;
  appliedFilters: DomainFilterValues;
  enabled: boolean;
};

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFiltersPayload(
  filters: DomainFilterValues,
): Record<string, unknown> {
  return {
    include: filters.include || undefined,
    exclude: filters.exclude || undefined,
    minTraffic: toNumberOrUndefined(filters.minTraffic),
    maxTraffic: toNumberOrUndefined(filters.maxTraffic),
    minVol: toNumberOrUndefined(filters.minVol),
    maxVol: toNumberOrUndefined(filters.maxVol),
    minCpc: toNumberOrUndefined(filters.minCpc),
    maxCpc: toNumberOrUndefined(filters.maxCpc),
    minKd: toNumberOrUndefined(filters.minKd),
    maxKd: toNumberOrUndefined(filters.maxKd),
    minRank: toNumberOrUndefined(filters.minRank),
    maxRank: toNumberOrUndefined(filters.maxRank),
  };
}

export function useDomainKeywordsQuery(input: DomainKeywordsQueryInput) {
  const filtersPayload = toFiltersPayload(input.appliedFilters);
  return useQuery({
    enabled: input.enabled && Boolean(input.domain),
    queryKey: [
      "domain-keywords",
      input.projectId,
      input.domain,
      input.scope,
      input.locationCode,
      input.page,
      input.pageSize,
      input.sortMode,
      input.sortOrder,
      filtersPayload,
    ],
    queryFn: () =>
      getDomainKeywordsPage({
        data: {
          projectId: input.projectId,
          domain: input.domain,
          scope: input.scope,
          locationCode: input.locationCode,
          page: input.page,
          pageSize: input.pageSize,
          sortMode: input.sortMode,
          sortOrder: input.sortOrder,
          filters: filtersPayload,
        },
      }),
    staleTime: 60_000,
  });
}
