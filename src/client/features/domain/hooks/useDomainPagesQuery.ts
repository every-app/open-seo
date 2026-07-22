import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDomainPagesPage } from "@/serverFunctions/domain";
import { debugDomain } from "@/client/features/domain/domainDebug";
import { toPageSortMode } from "@/client/features/domain/utils";
import type {
  DomainSortMode,
  PagesFilterValues,
  SortOrder,
} from "@/client/features/domain/types";

type DomainPagesQueryInput = {
  projectId: string;
  domain: string;
  includeSubdomains: boolean;
  locationCode: number | undefined;
  page: number;
  pageSize: number;
  sortMode: DomainSortMode;
  sortOrder: SortOrder;
  appliedFilters: PagesFilterValues;
  enabled: boolean;
};

export function useDomainPagesQuery(input: DomainPagesQueryInput) {
  const pageSortMode = toPageSortMode(input.sortMode);
  const queryKey = useMemo(
    () => [
      "domain-pages",
      input.projectId,
      input.domain,
      input.includeSubdomains,
      input.locationCode,
      input.page,
      input.pageSize,
      pageSortMode,
      input.sortOrder,
      input.appliedFilters,
    ],
    [
      input.appliedFilters,
      input.domain,
      input.includeSubdomains,
      input.locationCode,
      input.page,
      input.pageSize,
      input.projectId,
      input.sortOrder,
      pageSortMode,
    ],
  );

  useEffect(() => {
    debugDomain("useDomainPagesQuery:key", {
      queryKey,
      enabled: input.enabled && Boolean(input.domain),
    });
  }, [input.domain, input.enabled, queryKey]);

  const query = useQuery({
    enabled: input.enabled && Boolean(input.domain),
    queryKey,
    queryFn: () =>
      getDomainPagesPage({
        data: {
          projectId: input.projectId,
          domain: input.domain,
          includeSubdomains: input.includeSubdomains,
          locationCode: input.locationCode,
          page: input.page,
          pageSize: input.pageSize,
          sortMode: pageSortMode,
          sortOrder: input.sortOrder,
          filters: input.appliedFilters,
        },
      }),
    staleTime: 60_000,
  });
  useEffect(() => {
    debugDomain("useDomainPagesQuery:state", {
      status: query.status,
      fetchStatus: query.fetchStatus,
      isFetching: query.isFetching,
      rows: query.data?.pages.length ?? 0,
    });
  }, [
    query.data?.pages.length,
    query.fetchStatus,
    query.isFetching,
    query.status,
  ]);
  return query;
}
