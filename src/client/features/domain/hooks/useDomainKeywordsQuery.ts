import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDomainKeywordsPage } from "@/serverFunctions/domain";
import { debugDomain } from "@/client/features/domain/domainDebug";
import type {
  DomainFilterValues,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";

type DomainKeywordsQueryInput = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
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
  const filtersPayload = useMemo(
    () => toFiltersPayload(input.appliedFilters),
    [input.appliedFilters],
  );
  const queryKey = useMemo(
    () => [
      "domain-keywords",
      input.projectId,
      input.domain,
      input.includeSubdomains,
      input.locationCode,
      input.page,
      input.pageSize,
      input.sortMode,
      input.sortOrder,
      filtersPayload,
    ],
    [
      filtersPayload,
      input.domain,
      input.includeSubdomains,
      input.locationCode,
      input.page,
      input.pageSize,
      input.projectId,
      input.sortMode,
      input.sortOrder,
    ],
  );

  useEffect(() => {
    debugDomain("useDomainKeywordsQuery:key", {
      queryKey,
      enabled: input.enabled && Boolean(input.domain),
    });
  }, [input.domain, input.enabled, queryKey]);

  const query = useQuery({
    enabled: input.enabled && Boolean(input.domain),
    queryKey,
    queryFn: () =>
      getDomainKeywordsPage({
        data: {
          projectId: input.projectId,
          domain: input.domain,
          includeSubdomains: input.includeSubdomains,
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
  useEffect(() => {
    debugDomain("useDomainKeywordsQuery:state", {
      status: query.status,
      fetchStatus: query.fetchStatus,
      isFetching: query.isFetching,
      rows: query.data?.keywords.length ?? 0,
    });
  }, [
    query.data?.keywords.length,
    query.fetchStatus,
    query.isFetching,
    query.status,
  ]);
  return query;
}
