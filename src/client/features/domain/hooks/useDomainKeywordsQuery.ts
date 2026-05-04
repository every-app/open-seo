import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getDomainKeywordsPage } from "@/serverFunctions/domain";
import type {
  DomainFilterValues,
  DomainSortMode,
  SortOrder,
} from "@/client/features/domain/types";

type DomainKeywordsQueryInput = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
  languageCode: string;
  page: number;
  pageSize: number;
  sortMode: DomainSortMode;
  sortOrder: SortOrder;
  appliedFilters: DomainFilterValues;
  searchTerm: string;
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
  const trimmedSearch = input.searchTerm.trim();

  return useQuery({
    enabled: input.enabled && Boolean(input.domain),
    queryKey: [
      "domain-keywords",
      input.projectId,
      input.domain,
      input.includeSubdomains,
      input.locationCode,
      input.languageCode,
      input.page,
      input.pageSize,
      input.sortMode,
      input.sortOrder,
      filtersPayload,
      trimmedSearch || undefined,
    ],
    queryFn: () =>
      getDomainKeywordsPage({
        data: {
          projectId: input.projectId,
          domain: input.domain,
          includeSubdomains: input.includeSubdomains,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          page: input.page,
          pageSize: input.pageSize,
          sortMode: input.sortMode,
          sortOrder: input.sortOrder,
          filters: filtersPayload,
          search: trimmedSearch || undefined,
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
