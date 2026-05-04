import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { UpdateMetaOptions } from "@tanstack/react-form";
import {
  getDefaultSortOrder,
  toSortMode,
  toSortOrder,
} from "@/client/features/domain/utils";
import type {
  DomainActiveTab,
  DomainFilterValues,
  DomainSortMode,
  KeywordRow,
  SortOrder,
} from "@/client/features/domain/types";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";

export type SearchState = {
  domain: string;
  subdomains: boolean;
  sort: DomainSortMode;
  order?: SortOrder;
  tab: DomainActiveTab;
  search: string;
  locationCode: number;
  page: number;
  pageSize: number;
  appliedFilters: DomainFilterValues;
};

type DomainNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

type DomainControlsFormAccess = {
  state: {
    values: {
      domain: string;
      subdomains: boolean;
      sort: DomainSortMode;
      locationCode: number;
    };
  };
  reset: (values: {
    domain: string;
    subdomains: boolean;
    sort: DomainSortMode;
    locationCode: number;
  }) => void;
  setFieldValue: (
    field: "domain" | "subdomains" | "sort" | "locationCode",
    updater: string | boolean | number,
    opts?: UpdateMetaOptions,
  ) => void;
};

type ControlsFormLike = DomainControlsFormAccess;

export function useOverviewDataState({
  pagedKeywords,
  setSelectedKeywords,
  activeFilterCount,
}: {
  pagedKeywords: KeywordRow[];
  setSelectedKeywords: Dispatch<SetStateAction<Set<string>>>;
  activeFilterCount: number;
}) {
  // Keywords are now fetched server-side with filters/sort/pagination applied,
  // so we render whatever the page query returned.
  const filteredKeywords = pagedKeywords;

  const visibleKeywords = useMemo(
    () => filteredKeywords.map((row) => row.keyword),
    [filteredKeywords],
  );

  useEffect(() => {
    const visibleSet = new Set(visibleKeywords);
    setSelectedKeywords((prev) => {
      const next = new Set(
        [...prev].filter((keyword) => visibleSet.has(keyword)),
      );
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [setSelectedKeywords, visibleKeywords]);

  return {
    filteredKeywords,
    visibleKeywords,
    activeFilterCount,
    toggleKeywordSelection: (keyword: string) => {
      setSelectedKeywords((prev) => {
        const next = new Set(prev);
        if (next.has(keyword)) next.delete(keyword);
        else next.add(keyword);
        return next;
      });
    },
    toggleAllVisibleKeywords: () => {
      setSelectedKeywords((prev) => {
        if (
          visibleKeywords.length > 0 &&
          visibleKeywords.every((keyword) => prev.has(keyword))
        ) {
          return new Set();
        }

        return new Set(visibleKeywords);
      });
    },
  };
}

export function useSyncRouteState({
  controlsForm,
  searchState,
  navigate,
}: {
  controlsForm: ControlsFormLike;
  searchState: SearchState;
  navigate: DomainNavigate;
}) {
  useEffect(() => {
    controlsForm.reset({
      domain: searchState.domain,
      subdomains: searchState.subdomains,
      sort: searchState.sort,
      locationCode: searchState.locationCode,
    });
  }, [controlsForm, searchState]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search);
    const rawSort = toSortMode(raw.get("sort"));
    const rawOrder = toSortOrder(raw.get("order"));
    const rawLoc = raw.get("loc");
    const shouldNormalize =
      raw.get("domain") === "" ||
      raw.get("search") === "" ||
      raw.get("subdomains") === "true" ||
      raw.get("sort") === "rank" ||
      (rawOrder != null &&
        rawOrder === getDefaultSortOrder(rawSort ?? "rank")) ||
      raw.get("tab") === "keywords" ||
      rawLoc === String(DEFAULT_LOCATION_CODE);
    if (!shouldNormalize) return;

    navigate({
      search: (prev) => {
        const prevSort =
          typeof prev.sort === "string" ? toSortMode(prev.sort) : undefined;
        return {
          ...prev,
          domain: prev.domain === "" ? undefined : prev.domain,
          search: prev.search === "" ? undefined : prev.search,
          subdomains: prev.subdomains === true ? undefined : prev.subdomains,
          sort: prev.sort === "rank" ? undefined : prev.sort,
          order:
            prev.order != null &&
            prev.order === getDefaultSortOrder(prevSort ?? "rank")
              ? undefined
              : prev.order,
          tab: prev.tab === "keywords" ? undefined : prev.tab,
          loc:
            prev.loc != null && Number(prev.loc) === DEFAULT_LOCATION_CODE
              ? undefined
              : prev.loc,
        };
      },
      replace: true,
    });
  }, [navigate]);
}
