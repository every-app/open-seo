import type {
  KeywordsFilterValues,
  PageFilterKey,
  PagesFilterValues,
} from "@/client/features/domain/types";
import type { DomainSearchParams } from "@/types/schemas/domain";

export const KEYWORD_FILTER_FIELDS = [
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
] as const satisfies ReadonlyArray<keyof KeywordsFilterValues>;

export const PAGE_FILTER_FIELDS = [
  "include",
  "exclude",
  "minTraffic",
  "maxTraffic",
  "minVol",
  "maxVol",
] as const satisfies ReadonlyArray<keyof PagesFilterValues>;

export const PAGE_SEARCH_PARAM_BY_FIELD = {
  include: "pInclude",
  exclude: "pExclude",
  minTraffic: "pMinTraffic",
  maxTraffic: "pMaxTraffic",
  minVol: "pMinVol",
  maxVol: "pMaxVol",
} as const satisfies Record<PageFilterKey, keyof DomainSearchParams>;

type SearchUpdate = Partial<DomainSearchParams>;
type FilterValues = Record<string, string>;
type FilterKey<TValues extends FilterValues> = Extract<keyof TValues, string>;

export function countKeywordFilterConditions(
  values: KeywordsFilterValues,
): number {
  return countFilterConditions(values, KEYWORD_FILTER_FIELDS);
}

export function countPageFilterConditions(values: PagesFilterValues): number {
  return countFilterConditions(values, PAGE_FILTER_FIELDS);
}

export function buildKeywordsSearchUpdate(
  values: KeywordsFilterValues,
): SearchUpdate {
  return buildFilterSearchUpdate<KeywordsFilterValues>(
    values,
    KEYWORD_FILTER_FIELDS,
    (key) => key,
  );
}

export function buildPagesSearchUpdate(
  values: PagesFilterValues,
): SearchUpdate {
  return buildFilterSearchUpdate<PagesFilterValues>(
    values,
    PAGE_FILTER_FIELDS,
    (key) => PAGE_SEARCH_PARAM_BY_FIELD[key],
  );
}

export function buildPagesClearSearchUpdate(): SearchUpdate {
  return buildFilterClearSearchUpdate<PagesFilterValues>(
    PAGE_FILTER_FIELDS,
    (key) => PAGE_SEARCH_PARAM_BY_FIELD[key],
  );
}

export function buildDomainFiltersClearSearchUpdate(): SearchUpdate {
  const update = buildFilterClearSearchUpdate<KeywordsFilterValues>(
    KEYWORD_FILTER_FIELDS,
    (key) => key,
  );
  Object.assign(
    update,
    buildFilterClearSearchUpdate<PagesFilterValues>(
      PAGE_FILTER_FIELDS,
      (key) => PAGE_SEARCH_PARAM_BY_FIELD[key],
    ),
  );
  return update;
}

function countFilterConditions<TValues extends Record<string, string>>(
  values: TValues,
  fields: ReadonlyArray<FilterKey<TValues>>,
): number {
  let n = 0;
  for (const term of values.include.split(/[,+]/)) if (term.trim()) n += 1;
  for (const term of values.exclude.split(/[,+]/)) if (term.trim()) n += 1;
  for (const key of fields) {
    if (key === "include" || key === "exclude") continue;
    if (values[key].trim() !== "") n += 1;
  }
  return n;
}

function buildFilterSearchUpdate<TValues extends FilterValues>(
  values: TValues,
  fields: ReadonlyArray<FilterKey<TValues>>,
  getParam: (key: FilterKey<TValues>) => keyof DomainSearchParams,
): SearchUpdate {
  const update: SearchUpdate = { page: undefined };
  for (const key of fields) {
    const param = getParam(key);
    const raw = values[key].trim();
    if (raw === "") {
      Object.assign(update, { [param]: undefined });
      continue;
    }
    if (key === "include" || key === "exclude") {
      Object.assign(update, { [param]: raw });
      continue;
    }
    const parsed = Number(raw);
    Object.assign(update, {
      [param]: Number.isFinite(parsed) ? parsed : undefined,
    });
  }
  return update;
}

function buildFilterClearSearchUpdate<TValues extends FilterValues>(
  fields: ReadonlyArray<FilterKey<TValues>>,
  getParam: (key: FilterKey<TValues>) => keyof DomainSearchParams,
): SearchUpdate {
  const update: SearchUpdate = { page: undefined };
  for (const key of fields)
    Object.assign(update, { [getParam(key)]: undefined });
  return update;
}
