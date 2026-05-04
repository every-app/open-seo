import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getDomainPagesPage } from "@/serverFunctions/domain";
import { toPageSortMode } from "@/client/features/domain/utils";
import type { DomainSortMode, SortOrder } from "@/client/features/domain/types";

type DomainPagesQueryInput = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
  locationCode: number;
  languageCode: string;
  page: number;
  pageSize: number;
  sortMode: DomainSortMode;
  sortOrder: SortOrder;
  searchTerm: string;
  enabled: boolean;
};

export function useDomainPagesQuery(input: DomainPagesQueryInput) {
  const trimmedSearch = input.searchTerm.trim();
  const pageSortMode = toPageSortMode(input.sortMode);

  return useQuery({
    enabled: input.enabled && Boolean(input.domain),
    queryKey: [
      "domain-pages",
      input.projectId,
      input.domain,
      input.includeSubdomains,
      input.locationCode,
      input.languageCode,
      input.page,
      input.pageSize,
      pageSortMode,
      input.sortOrder,
      trimmedSearch || undefined,
    ],
    queryFn: () =>
      getDomainPagesPage({
        data: {
          projectId: input.projectId,
          domain: input.domain,
          includeSubdomains: input.includeSubdomains,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          page: input.page,
          pageSize: input.pageSize,
          sortMode: pageSortMode,
          sortOrder: input.sortOrder,
          search: trimmedSearch || undefined,
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
