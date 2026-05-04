import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import {
  EMPTY_DOMAIN_FILTERS,
  type DomainFilterValues,
} from "@/client/features/domain/types";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";

const FILTER_KEYS: Array<keyof DomainFilterValues> = [
  "include",
  "exclude",
  "minTraffic",
  "maxTraffic",
  "minVol",
  "maxVol",
  "minCpc",
  "maxCpc",
  "minKd",
  "maxKd",
  "minRank",
  "maxRank",
];

function filtersToSearchParams(
  values: DomainFilterValues,
): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {};
  for (const key of FILTER_KEYS) {
    const trimmed = values[key].trim();
    if (trimmed === "") {
      out[key] = undefined;
      continue;
    }
    if (key === "include" || key === "exclude") {
      out[key] = trimmed;
    } else {
      const parsed = Number(trimmed);
      out[key] = Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return out;
}

/**
 * One include/exclude term per comma. Numeric ranges count as one per bound.
 * Mirrors how `buildKeywordFilters` packs the request, plus 2 extra slots
 * reserved for the search-box OR-clause when active.
 */
function countConditions(
  values: DomainFilterValues,
  hasSearch: boolean,
): number {
  let n = 0;
  for (const term of values.include.split(/[,+]/)) if (term.trim()) n += 1;
  for (const term of values.exclude.split(/[,+]/)) if (term.trim()) n += 1;
  for (const k of [
    "minTraffic",
    "maxTraffic",
    "minVol",
    "maxVol",
    "minCpc",
    "maxCpc",
    "minKd",
    "maxKd",
    "minRank",
    "maxRank",
  ] as const) {
    if (values[k].trim() !== "") n += 1;
  }
  if (hasSearch) n += 2;
  return n;
}

export function useDomainFilters({
  appliedValues,
  appliedSearch,
  setSearchParams,
}: {
  appliedValues: DomainFilterValues;
  appliedSearch: string;
  setSearchParams: (
    updates: Record<string, string | number | boolean | undefined>,
  ) => void;
}) {
  const filtersForm = useForm({
    defaultValues: appliedValues,
  });

  const draftValues = useStore(filtersForm.store, (s) => s.values);
  const [searchDraft, setSearchDraft] = useState(appliedSearch);

  // Keep the draft in sync when applied values change from outside the panel
  // (URL navigation, history-select, "back to recent searches"). Without this,
  // the form keeps the previous draft and diverges from the URL.
  const appliedKey = useMemo(
    () => FILTER_KEYS.map((key) => appliedValues[key]).join("|"),
    [appliedValues],
  );
  useEffect(() => {
    filtersForm.reset({ ...appliedValues });
    // appliedKey covers content changes; filtersForm is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  useEffect(() => {
    setSearchDraft(appliedSearch);
  }, [appliedSearch]);

  const applyFilters = useCallback(() => {
    const trimmedSearch = searchDraft.trim();
    setSearchParams({
      ...filtersToSearchParams(draftValues),
      search: trimmedSearch === "" ? undefined : trimmedSearch,
      page: undefined,
    });
  }, [draftValues, searchDraft, setSearchParams]);

  const cancelEdits = useCallback(() => {
    filtersForm.reset({ ...appliedValues }, { keepDefaultValues: true });
    setSearchDraft(appliedSearch);
  }, [appliedValues, appliedSearch, filtersForm]);

  const resetFilters = useCallback(() => {
    filtersForm.reset({ ...EMPTY_DOMAIN_FILTERS }, { keepDefaultValues: true });
    setSearchDraft("");
    setSearchParams({
      ...filtersToSearchParams(EMPTY_DOMAIN_FILTERS),
      search: undefined,
      page: undefined,
    });
  }, [filtersForm, setSearchParams]);

  const activeAppliedCount = useMemo(
    () =>
      FILTER_KEYS.filter((key) => appliedValues[key].trim() !== "").length +
      (appliedSearch.trim() !== "" ? 1 : 0),
    [appliedValues, appliedSearch],
  );
  const dirtyCount = useMemo(() => {
    const filterDirt = FILTER_KEYS.filter(
      (key) => draftValues[key].trim() !== appliedValues[key].trim(),
    ).length;
    const searchDirt = searchDraft.trim() !== appliedSearch.trim() ? 1 : 0;
    return filterDirt + searchDirt;
  }, [draftValues, appliedValues, searchDraft, appliedSearch]);

  const conditionCount = countConditions(
    draftValues,
    searchDraft.trim() !== "",
  );
  const overLimit = conditionCount > MAX_DATAFORSEO_FILTER_CONDITIONS;

  return {
    filtersForm,
    draftValues,
    appliedValues,
    searchDraft,
    setSearchDraft,
    activeAppliedCount,
    dirtyCount,
    conditionCount,
    overLimit,
    applyFilters,
    cancelEdits,
    resetFilters,
  };
}
