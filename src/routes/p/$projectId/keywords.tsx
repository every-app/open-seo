import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { reverse, sortBy } from "remeda";
import {
  researchKeywords,
  saveKeywords,
  getSerpAnalysis,
} from "@/serverFunctions/keywords";
import { useSearchHistory } from "@/client/hooks/useSearchHistory";
import { keywordsSearchSchema } from "@/types/schemas/keywords";
import {
  Search,
  SlidersHorizontal,
  Save,
  FileDown,
  Globe,
  History,
  X,
  Clock,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import type { KeywordResearchRow } from "@/types/keywords";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  LOCATIONS,
  csvEscape,
  getLanguageCode,
  parseTerms,
} from "@/client/features/keywords/utils";
import {
  AreaTrendChart,
  KeywordCard,
  KeywordRow,
  OverviewStats,
  SerpAnalysisCard,
  SortHeader,
  type SortDir,
  type SortField,
} from "@/client/features/keywords/components";

export const Route = createFileRoute("/p/$projectId/keywords")({
  validateSearch: keywordsSearchSchema,
  component: KeywordResearchPage,
});

function shouldNormalizeLegacySearch(raw: URLSearchParams): boolean {
  const defaultValues: Array<[string, string]> = [
    ["q", ""],
    ["loc", "2840"],
    ["kLimit", "150"],
    ["sort", "searchVolume"],
    ["order", "desc"],
    ["minVol", ""],
    ["maxVol", ""],
    ["minCpc", ""],
    ["maxCpc", ""],
    ["minKd", ""],
    ["maxKd", ""],
    ["include", ""],
    ["exclude", ""],
  ];

  return defaultValues.some(([key, value]) => raw.get(key) === value);
}

const RESULT_LIMITS = [150, 300, 500] as const;
type ResultLimit = (typeof RESULT_LIMITS)[number];
type KeywordSource = "related" | "suggestions" | "ideas";

function isResultLimit(value: number): value is ResultLimit {
  return value === 150 || value === 300 || value === 500;
}

type KeywordControlsValues = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
};

function applyKeywordFiltersAndSort(params: {
  rows: KeywordResearchRow[];
  include: string;
  exclude: string;
  minVol: string;
  maxVol: string;
  minCpc: string;
  maxCpc: string;
  minKd: string;
  maxKd: string;
  sortField: SortField;
  sortDir: SortDir;
}): KeywordResearchRow[] {
  const includeTerms = parseTerms(params.include);
  const excludeTerms = parseTerms(params.exclude);

  const filtered = params.rows.filter((row) => {
    const haystack = row.keyword.toLowerCase();
    if (
      includeTerms.length > 0 &&
      !includeTerms.every((term) => haystack.includes(term))
    ) {
      return false;
    }
    if (excludeTerms.some((term) => haystack.includes(term))) {
      return false;
    }

    const vol = row.searchVolume ?? 0;
    const cpc = row.cpc ?? 0;
    const kd = row.keywordDifficulty ?? 0;

    if (params.minVol && vol < Number(params.minVol)) return false;
    if (params.maxVol && vol > Number(params.maxVol)) return false;
    if (params.minCpc && cpc < Number(params.minCpc)) return false;
    if (params.maxCpc && cpc > Number(params.maxCpc)) return false;
    if (params.minKd && kd < Number(params.minKd)) return false;
    if (params.maxKd && kd > Number(params.maxKd)) return false;
    return true;
  });

  if (params.sortField === "keyword") {
    return sortBy(filtered, [(row) => row.keyword, params.sortDir]);
  }
  if (params.sortField === "searchVolume") {
    return sortBy(filtered, [(row) => row.searchVolume ?? -1, params.sortDir]);
  }
  if (params.sortField === "cpc") {
    return sortBy(filtered, [(row) => row.cpc ?? -1, params.sortDir]);
  }
  if (params.sortField === "competition") {
    return sortBy(filtered, [(row) => row.competition ?? -1, params.sortDir]);
  }

  return sortBy(filtered, [
    (row) => row.keywordDifficulty ?? -1,
    params.sortDir,
  ]);
}

function getNextSortParams(
  currentField: SortField,
  currentDirection: SortDir,
  targetField: SortField,
): { sort: SortField; order: SortDir } {
  if (currentField !== targetField) {
    return { sort: targetField, order: "desc" };
  }

  return {
    sort: currentField,
    order: currentDirection === "asc" ? "desc" : "asc",
  };
}

function getNextSelectionSet(
  current: Set<string>,
  allVisibleKeywords: string[],
): Set<string> {
  if (current.size === allVisibleKeywords.length) {
    return new Set();
  }

  return new Set(allVisibleKeywords);
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line complexity, max-lines-per-function
function KeywordResearchPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  // --- URL search params (persisted in query string) ---
  const {
    q: keywordInput = "",
    loc: locationCode = 2840,
    kLimit: resultLimit = 150,
    sort: sortField = "searchVolume",
    order: sortDir = "desc",
    minVol: minVolume = "",
    maxVol: maxVolume = "",
    minCpc = "",
    maxCpc = "",
    minKd: minDifficulty = "",
    maxKd: maxDifficulty = "",
    include: includeText = "",
    exclude: excludeText = "",
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  // --- Local-only UI state ---
  const [showFilters, setShowFilters] = useState(false);
  const [selectedKeyword, setSelectedKeyword] =
    useState<KeywordResearchRow | null>(null);

  const defaultControlValues: KeywordControlsValues = {
    keyword: keywordInput,
    locationCode,
    resultLimit,
  };

  const controlsForm = useForm({
    defaultValues: defaultControlValues,
  });
  const [pendingInclude, setPendingInclude] = useState(includeText);
  const [pendingExclude, setPendingExclude] = useState(excludeText);
  const [pendingMinVol, setPendingMinVol] = useState(minVolume);
  const [pendingMaxVol, setPendingMaxVol] = useState(maxVolume);
  const [pendingMinCpc, setPendingMinCpc] = useState(minCpc);
  const [pendingMaxCpc, setPendingMaxCpc] = useState(maxCpc);
  const [pendingMinKd, setPendingMinKd] = useState(minDifficulty);
  const [pendingMaxKd, setPendingMaxKd] = useState(maxDifficulty);

  // Sync URL params to local pending state when they change (e.g., back/forward nav, history click)
  useEffect(() => {
    controlsForm.setFieldValue("keyword", keywordInput);
    controlsForm.setFieldValue("locationCode", locationCode);
    controlsForm.setFieldValue("resultLimit", resultLimit);
    setPendingInclude(includeText);
    setPendingExclude(excludeText);
    setPendingMinVol(minVolume);
    setPendingMaxVol(maxVolume);
    setPendingMinCpc(minCpc);
    setPendingMaxCpc(maxCpc);
    setPendingMinKd(minDifficulty);
    setPendingMaxKd(maxDifficulty);
  }, [
    controlsForm,
    keywordInput,
    locationCode,
    resultLimit,
    includeText,
    excludeText,
    minVolume,
    maxVolume,
    minCpc,
    maxCpc,
    minDifficulty,
    maxDifficulty,
  ]);

  // One-time URL normalization for old links with empty/default params.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search);
    const shouldNormalize = shouldNormalizeLegacySearch(raw);

    if (!shouldNormalize) return;

    void navigate({
      search: (prev) => ({
        ...prev,
        q: prev.q === "" ? undefined : prev.q,
        loc: prev.loc === 2840 ? undefined : prev.loc,
        kLimit: prev.kLimit === 150 ? undefined : prev.kLimit,
        sort: prev.sort === "searchVolume" ? undefined : prev.sort,
        order: prev.order === "desc" ? undefined : prev.order,
        minVol: prev.minVol === "" ? undefined : prev.minVol,
        maxVol: prev.maxVol === "" ? undefined : prev.maxVol,
        minCpc: prev.minCpc === "" ? undefined : prev.minCpc,
        maxCpc: prev.maxCpc === "" ? undefined : prev.maxCpc,
        minKd: prev.minKd === "" ? undefined : prev.minKd,
        maxKd: prev.maxKd === "" ? undefined : prev.maxKd,
        include: prev.include === "" ? undefined : prev.include,
        exclude: prev.exclude === "" ? undefined : prev.exclude,
      }),
      replace: true,
    });
  }, [navigate]);

  // Search history hook
  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    clearHistory,
    removeHistoryItem,
  } = useSearchHistory(projectId);

  // Results
  const [rows, setRows] = useState<KeywordResearchRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchError, setLastSearchError] = useState(false);
  const [lastResultSource, setLastResultSource] =
    useState<KeywordSource>("related");
  const [lastUsedFallback, setLastUsedFallback] = useState(false);
  const [lastSearchKeyword, setLastSearchKeyword] = useState("");
  const [lastSearchLocationCode, setLastSearchLocationCode] = useState(2840);
  const [searchInputError, setSearchInputError] = useState<string | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  // The seed keyword shown in overview
  const [searchedKeyword, setSearchedKeyword] = useState("");

  // Selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // SERP analysis — the keyword currently being viewed for SERP
  const [serpKeyword, setSerpKeyword] = useState<string | null>(null);
  const [serpPage, setSerpPage] = useState(0);
  const SERP_PAGE_SIZE = 10;

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<"keywords" | "serp">("keywords");

  // --- React Query hooks ---

  // Keyword research (user-triggered)
  const researchMutation = useMutation({
    mutationFn: (data: {
      keywords: string[];
      locationCode: number;
      languageCode: string;
      resultLimit: ResultLimit;
    }) => researchKeywords({ data }),
  });
  const isLoading = researchMutation.isPending;

  // SERP analysis (reactive query keyed by selected keyword)
  const serpQuery = useQuery({
    queryKey: ["serpAnalysis", serpKeyword, locationCode] as const,
    queryFn: () =>
      getSerpAnalysis({
        data: {
          keyword: serpKeyword!,
          locationCode,
          languageCode: getLanguageCode(locationCode),
        },
      }),
    enabled: !!serpKeyword,
  });
  const serpResults = serpQuery.data?.items ?? [];
  const serpLoading = serpQuery.isLoading;
  const serpError = serpQuery.isError
    ? getStandardErrorMessage(serpQuery.error, "Failed to load SERP data.")
    : null;

  // Save keywords mutation
  const saveMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      languageCode: string;
    }) => saveKeywords({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });

  /* ---- derived ---- */
  const filteredRows = useMemo(() => {
    return applyKeywordFiltersAndSort({
      rows,
      include: pendingInclude,
      exclude: pendingExclude,
      minVol: pendingMinVol,
      maxVol: pendingMaxVol,
      minCpc: pendingMinCpc,
      maxCpc: pendingMaxCpc,
      minKd: pendingMinKd,
      maxKd: pendingMaxKd,
      sortField,
      sortDir,
    });
  }, [
    pendingExclude,
    pendingInclude,
    pendingMaxCpc,
    pendingMaxKd,
    pendingMaxVol,
    pendingMinCpc,
    pendingMinKd,
    pendingMinVol,
    rows,
    sortField,
    sortDir,
  ]);

  const activeFilterCount = useMemo(
    () =>
      [
        pendingInclude,
        pendingExclude,
        pendingMinVol,
        pendingMaxVol,
        pendingMinCpc,
        pendingMaxCpc,
        pendingMinKd,
        pendingMaxKd,
      ].filter((value) => value.trim() !== "").length,
    [
      pendingExclude,
      pendingInclude,
      pendingMaxCpc,
      pendingMaxKd,
      pendingMaxVol,
      pendingMinCpc,
      pendingMinKd,
      pendingMinVol,
    ],
  );

  const hasExactMatchInResults = useMemo(() => {
    const normalizedSeed = searchedKeyword.trim().toLowerCase();
    if (!normalizedSeed || rows.length === 0) return false;

    return rows.some(
      (row) => row.keyword.trim().toLowerCase() === normalizedSeed,
    );
  }, [rows, searchedKeyword]);

  const showApproximateMatchNotice =
    hasSearched &&
    !isLoading &&
    !lastSearchError &&
    rows.length > 0 &&
    searchedKeyword.trim() !== "" &&
    !hasExactMatchInResults;

  // The keyword to show in the overview strip (selected or first seed result)
  const overviewKeyword: KeywordResearchRow | null = useMemo(() => {
    if (selectedKeyword) return selectedKeyword;
    // find the seed keyword in results
    if (searchedKeyword && rows.length > 0) {
      const seed = rows.find(
        (r) => r.keyword.toLowerCase() === searchedKeyword.toLowerCase(),
      );
      if (seed) return seed;
    }
    return rows.length > 0 ? rows[0] : null;
  }, [selectedKeyword, searchedKeyword, rows]);

  // Helper to update search params
  const setSearchParams = useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  /* ---- handlers ---- */
  const onSearch = (
    overrides?: Partial<{
      keyword: string;
      locationCode: number;
    }>,
  ) => {
    const values = controlsForm.state.values;
    const input = overrides?.keyword ?? values.keyword;
    const activeLocation = overrides?.locationCode ?? values.locationCode;
    const activeResultLimit = values.resultLimit;
    const languageCode = getLanguageCode(activeLocation);
    const keywords = input
      .split(/[\n,]/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      setSearchInputError("Please enter at least one keyword.");
      return;
    }

    setSearchInputError(null);
    setResearchError(null);

    // Update URL with all pending values before searching (filter out empty values)
    const searchUpdates: Record<string, string | number | boolean | undefined> =
      {
        q: input,
        loc: activeLocation === 2840 ? undefined : activeLocation,
        kLimit: activeResultLimit === 150 ? undefined : activeResultLimit,
      };
    void navigate({
      search: (prev) => ({ ...prev, ...searchUpdates }),
      replace: true,
    });

    setSelectedKeyword(null);
    setSelectedRows(new Set());
    setSearchedKeyword(keywords[0]);
    setSerpKeyword(null);
    setHasSearched(true);
    setLastSearchError(false);
    setLastSearchKeyword(keywords[0]);
    setLastSearchLocationCode(activeLocation);

    researchMutation.mutate(
      {
        keywords,
        locationCode: activeLocation,
        languageCode,
        resultLimit: activeResultLimit,
      },
      {
        onSuccess: (result) => {
          setResearchError(null);
          setRows(result.rows);
          setLastResultSource(result.source);
          setLastUsedFallback(result.usedFallback);

          // Add to search history
          if (keywords.length > 0) {
            addSearch(
              keywords[0],
              activeLocation,
              LOCATIONS[activeLocation] || "Unknown",
            );
          }

          if (result.rows.length === 0) {
            setSerpKeyword(null);
          } else {
            // Kick off SERP fetch for the seed keyword
            setSerpKeyword(keywords[0]);
            setSerpPage(0);
          }
        },
        onError: (error) => {
          setLastSearchError(true);
          setRows([]);
          setResearchError(getStandardErrorMessage(error, "Research failed."));
        },
      },
    );
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  const toggleSort = (field: SortField) => {
    setSearchParams(getNextSortParams(sortField, sortDir, field));
  };

  const toggleRowSelection = (keyword: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const toggleAllRows = () => {
    setSelectedRows(
      getNextSelectionSet(
        selectedRows,
        filteredRows.map((row) => row.keyword),
      ),
    );
  };

  const resetFilters = () => {
    setPendingInclude("");
    setPendingExclude("");
    setPendingMinVol("");
    setPendingMaxVol("");
    setPendingMinCpc("");
    setPendingMaxCpc("");
    setPendingMinKd("");
    setPendingMaxKd("");
    // Clear URL params by setting to undefined (will be removed from URL)
    setSearchParams({
      minVol: undefined,
      maxVol: undefined,
      minCpc: undefined,
      maxCpc: undefined,
      minKd: undefined,
      maxKd: undefined,
      include: undefined,
      exclude: undefined,
    });
  };

  const handleSaveKeywords = () => {
    if (selectedRows.size === 0) {
      toast.error("Select at least one keyword first");
      return;
    }
    setShowSaveDialog(true);
  };

  const confirmSave = () => {
    saveMutation.mutate(
      {
        projectId,
        keywords: [...selectedRows],
        locationCode,
        languageCode: getLanguageCode(locationCode),
      },
      {
        onSuccess: () => {
          toast.success(`Saved ${selectedRows.size} keywords`);
          setShowSaveDialog(false);
        },
        onError: (error) => {
          toast.error(getStandardErrorMessage(error, "Save failed."));
        },
      },
    );
  };

  const exportCsv = () => {
    const source =
      selectedRows.size > 0
        ? filteredRows.filter((r) => selectedRows.has(r.keyword))
        : filteredRows;
    if (source.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = [
      "Keyword",
      "Volume",
      "CPC",
      "Competition",
      "Difficulty",
      "Intent",
    ];
    const csvRows = source.map((r) =>
      [
        csvEscape(r.keyword),
        r.searchVolume ?? "",
        r.cpc?.toFixed(2) ?? "",
        r.competition?.toFixed(2) ?? "",
        r.keywordDifficulty ?? "",
        r.intent,
      ].join(","),
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "keyword-research.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRowClick = (row: KeywordResearchRow) => {
    setSelectedKeyword(row);
    setSerpKeyword(row.keyword);
    setSerpPage(0);
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 1. Search bar */}
      <div className="shrink-0 px-4 md:px-6 pt-4 pb-2 max-w-8xl mx-auto w-full">
        <form
          className="bg-base-100 border border-base-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2"
          onSubmit={handleSearchSubmit}
        >
          {/* Keyword input */}
          <label
            className={`input input-bordered input-sm flex items-center gap-2 flex-1 min-w-0 max-w-md ${searchInputError ? "input-error" : ""}`}
          >
            <Search className="size-3.5 shrink-0 text-base-content/50" />
            <controlsForm.Field name="keyword">
              {(field) => (
                <input
                  className="grow min-w-0"
                  placeholder="Enter Keyword"
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                    if (searchInputError) setSearchInputError(null);
                  }}
                />
              )}
            </controlsForm.Field>
          </label>

          {/* Location */}
          <controlsForm.Field name="locationCode">
            {(field) => (
              <select
                className="select select-bordered select-sm w-auto"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              >
                <option value={2840}>United States</option>
                <option value={2826}>United Kingdom</option>
                <option value={2276}>Germany</option>
                <option value={2250}>France</option>
                <option value={2036}>Australia</option>
                <option value={2124}>Canada</option>
                <option value={2356}>India</option>
                <option value={2076}>Brazil</option>
              </select>
            )}
          </controlsForm.Field>

          <controlsForm.Field name="resultLimit">
            {(field) => (
              <select
                className="select select-bordered select-sm w-auto"
                value={field.state.value}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  field.handleChange(isResultLimit(next) ? next : 150);
                }}
              >
                {RESULT_LIMITS.map((limit) => (
                  <option key={limit} value={limit}>
                    {limit} results
                  </option>
                ))}
              </select>
            )}
          </controlsForm.Field>

          {/* Search button */}
          <button
            type="submit"
            className="btn btn-primary btn-sm px-6 font-semibold"
            disabled={isLoading}
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </form>
        {searchInputError ? (
          <p className="mt-2 text-sm text-error">{searchInputError}</p>
        ) : null}
      </div>

      {/* 2. Content area */}
      {isLoading ? (
        <KeywordResearchLoadingState />
      ) : researchError ? (
        <div className="flex-1 flex items-center justify-center px-4 md:px-6">
          <div className="w-full max-w-xl rounded-xl border border-error/30 bg-error/10 p-5 text-error space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm">{researchError}</p>
            </div>
            <button className="btn btn-sm" onClick={() => onSearch()}>
              Try again
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        /* Empty state: no results or history */
        hasSearched && !isLoading && !lastSearchError ? (
          <div className="flex-1 flex items-center justify-center px-4 md:px-6 py-6">
            <div className="w-full max-w-2xl rounded-2xl border border-base-300 bg-base-100 p-6 md:p-8 text-center space-y-4">
              <Globe className="size-10 mx-auto text-base-content/40" />
              <div className="space-y-2">
                <p className="text-lg font-semibold text-base-content">
                  Not enough keyword data for this query yet
                </p>
                <p className="text-sm text-base-content/70">
                  We could not find keyword opportunities for
                  <span className="font-medium text-base-content">
                    {` "${lastSearchKeyword}" `}
                  </span>
                  in
                  <span className="font-medium text-base-content">
                    {` ${LOCATIONS[lastSearchLocationCode] || "this location"}`}
                  </span>
                  .
                </p>
              </div>

              <div className="rounded-xl bg-base-200/70 px-4 py-3 text-left text-sm text-base-content/70 space-y-1">
                <p>
                  Source checked:{" "}
                  <span className="font-medium">{lastResultSource}</span>
                  {lastUsedFallback ? (
                    <span>
                      {" "}
                      (with fallback chain: related → suggestions → ideas)
                    </span>
                  ) : null}
                </p>
                <p>
                  Try a broader phrase, swap word order, or change location.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    const words = lastSearchKeyword
                      .split(/\s+/)
                      .filter(Boolean);
                    const reversedKeyword = reverse(words).join(" ");
                    if (
                      !reversedKeyword ||
                      reversedKeyword === lastSearchKeyword
                    )
                      return;
                    controlsForm.setFieldValue("keyword", reversedKeyword);
                    onSearch({
                      keyword: reversedKeyword,
                      locationCode: lastSearchLocationCode,
                    });
                  }}
                  disabled={lastSearchKeyword.trim().split(/\s+/).length < 2}
                >
                  Try reversed phrase
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    const firstWord = lastSearchKeyword
                      .split(/\s+/)
                      .filter(Boolean)[0];
                    if (!firstWord) return;
                    controlsForm.setFieldValue("keyword", firstWord);
                    onSearch({
                      keyword: firstWord,
                      locationCode: lastSearchLocationCode,
                    });
                  }}
                >
                  Try broader seed
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
            <div className="mx-auto w-full max-w-5xl space-y-6 pt-3 md:pt-5">
              {historyLoaded && history.length > 0 ? (
                <section className="rounded-2xl border border-base-300 bg-base-100 p-5 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <History className="size-4 text-base-content/45" />
                      <span className="text-sm text-base-content/60">
                        {history.length} recent search
                        {history.length !== 1 ? "es" : ""}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={clearHistory}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="grid gap-2">
                    {history.map((item) => (
                      <div
                        key={item.timestamp}
                        className="flex items-center justify-between p-3 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 transition-colors text-left group cursor-pointer"
                        onClick={() => {
                          controlsForm.setFieldValue("keyword", item.keyword);
                          controlsForm.setFieldValue(
                            "locationCode",
                            item.locationCode,
                          );
                          setSearchParams({
                            q: item.keyword,
                            loc: item.locationCode,
                          });
                          onSearch({
                            keyword: item.keyword,
                            locationCode: item.locationCode,
                          });
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Clock className="size-4 text-base-content/40" />
                          <div>
                            <p className="font-medium text-base-content">
                              {item.keyword}
                            </p>
                            <p className="text-sm text-base-content/60">
                              {item.locationName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-base-content/40">
                            {new Date(item.timestamp).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                          <button
                            className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeHistoryItem(item.timestamp);
                            }}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/50 space-y-3">
                  <Search className="size-10 mx-auto opacity-40" />
                  <p className="text-lg font-medium text-base-content/80">
                    Enter a keyword to get started
                  </p>
                  <p className="text-sm max-w-md mx-auto">
                    Search for any keyword to see volume, difficulty, CPC, and
                    related keyword ideas.
                  </p>
                </section>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden w-full px-4 md:px-6 pb-4 max-w-8xl mx-auto">
          {/* 4. Two-panel layout: table (left) + SERP (right) */}
          {/* Desktop */}
          <div className="flex-1 hidden md:flex overflow-hidden gap-4 mt-2">
            {/* Left column: overview stats + keyword table */}
            <div className="flex-1 flex flex-col min-w-0 gap-2">
              {showApproximateMatchNotice && (
                <div
                  className="rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-base-content"
                  role="status"
                >
                  No exact match for{" "}
                  <span className="font-medium">"{searchedKeyword}"</span>.
                  Showing closest related keywords instead.
                  {lastUsedFallback ? (
                    <span className="text-base-content/75">
                      {" "}
                      Source: {lastResultSource} fallback.
                    </span>
                  ) : null}
                </div>
              )}

              {/* Overview stats strip */}
              {overviewKeyword && <OverviewStats keyword={overviewKeyword} />}

              {/* Keyword table card */}
              <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
                {/* Table toolbar */}
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-base-300">
                  <button
                    className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
                    onClick={() => setShowFilters((p) => !p)}
                    title="Toggle table filters"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="badge badge-xs badge-primary border-0 text-primary-content">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  <span className="text-sm text-base-content/60">
                    {selectedRows.size > 0
                      ? `${selectedRows.size} of ${filteredRows.length} selected`
                      : `${filteredRows.length} keywords`}
                  </span>
                  <div className="flex-1" />
                  <button
                    className="btn btn-ghost btn-sm gap-1"
                    onClick={handleSaveKeywords}
                    disabled={selectedRows.size === 0}
                  >
                    <Save className="size-3.5" />
                    <span className="hidden lg:inline">Save Keywords</span>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm gap-1"
                    onClick={exportCsv}
                    disabled={filteredRows.length === 0}
                  >
                    <FileDown className="size-3.5" />
                    <span className="hidden lg:inline">Export</span>
                  </button>
                </div>

                {showFilters && (
                  <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">
                          Refine table results
                        </p>
                        {activeFilterCount > 0 && (
                          <span className="badge badge-xs badge-primary border-0 text-primary-content">
                            {activeFilterCount} active
                          </span>
                        )}
                      </div>
                      <button
                        className="btn btn-xs btn-ghost gap-1"
                        onClick={resetFilters}
                        disabled={activeFilterCount === 0}
                      >
                        <RotateCcw className="size-3" />
                        Clear all
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <label className="form-control gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
                          Include Terms
                        </span>
                        <input
                          className="input input-bordered input-sm bg-base-100"
                          placeholder="audit, checker, template"
                          value={pendingInclude}
                          onChange={(e) => setPendingInclude(e.target.value)}
                        />
                      </label>
                      <label className="form-control gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
                          Exclude Terms
                        </span>
                        <input
                          className="input input-bordered input-sm bg-base-100"
                          placeholder="jobs, salary, course"
                          value={pendingExclude}
                          onChange={(e) => setPendingExclude(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                      <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
                          Search Volume
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="input input-bordered input-xs"
                            placeholder="Min"
                            type="number"
                            value={pendingMinVol}
                            onChange={(e) => setPendingMinVol(e.target.value)}
                          />
                          <input
                            className="input input-bordered input-xs"
                            placeholder="Max"
                            type="number"
                            value={pendingMaxVol}
                            onChange={(e) => setPendingMaxVol(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
                          CPC (USD)
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="input input-bordered input-xs"
                            placeholder="Min"
                            type="number"
                            step="0.01"
                            value={pendingMinCpc}
                            onChange={(e) => setPendingMinCpc(e.target.value)}
                          />
                          <input
                            className="input input-bordered input-xs"
                            placeholder="Max"
                            type="number"
                            step="0.01"
                            value={pendingMaxCpc}
                            onChange={(e) => setPendingMaxCpc(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
                          Difficulty
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="input input-bordered input-xs"
                            placeholder="Min"
                            type="number"
                            value={pendingMinKd}
                            onChange={(e) => setPendingMinKd(e.target.value)}
                          />
                          <input
                            className="input input-bordered input-xs"
                            placeholder="Max"
                            type="number"
                            value={pendingMaxKd}
                            onChange={(e) => setPendingMaxKd(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table header */}
                <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-base-300 bg-base-100 text-xs text-base-content/60 font-medium">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs shrink-0"
                    checked={
                      filteredRows.length > 0 &&
                      selectedRows.size === filteredRows.length
                    }
                    onChange={toggleAllRows}
                  />
                  <SortHeader
                    label="Keyword"
                    field="keyword"
                    current={sortField}
                    dir={sortDir}
                    onToggle={toggleSort}
                    className="flex-1 min-w-0"
                  />
                  <SortHeader
                    label="Volume"
                    field="searchVolume"
                    current={sortField}
                    dir={sortDir}
                    onToggle={toggleSort}
                    className="w-16 text-right"
                  />
                  <SortHeader
                    label="CPC"
                    helpText="Cost per click in USD."
                    field="cpc"
                    current={sortField}
                    dir={sortDir}
                    onToggle={toggleSort}
                    className="w-14 text-right"
                  />
                  <SortHeader
                    label="Comp."
                    helpText="Advertiser competition."
                    field="competition"
                    current={sortField}
                    dir={sortDir}
                    onToggle={toggleSort}
                    className="w-12 text-right"
                  />
                  <SortHeader
                    label="Score"
                    helpText="Keyword difficulty score."
                    field="keywordDifficulty"
                    current={sortField}
                    dir={sortDir}
                    onToggle={toggleSort}
                    className="w-10 text-right"
                  />
                </div>

                {/* Scrollable keyword rows */}
                <div className="flex-1 overflow-y-auto">
                  {filteredRows.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 text-base-content/50 gap-3">
                      <p className="text-sm font-medium">
                        No keywords match your current filters.
                      </p>
                      {activeFilterCount > 0 ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={resetFilters}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    filteredRows.map((row) => (
                      <KeywordRow
                        key={row.keyword}
                        row={row}
                        isSelected={selectedRows.has(row.keyword)}
                        isActive={overviewKeyword?.keyword === row.keyword}
                        onToggle={() => toggleRowSelection(row.keyword)}
                        onClick={() => handleRowClick(row)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right column: trend chart + SERP panel */}
            <div className="flex-1 flex flex-col min-w-0 gap-2">
              {/* Trend chart */}
              {overviewKeyword && overviewKeyword.trend.length > 0 && (
                <div className="shrink-0 border border-base-300 rounded-xl bg-base-100 px-4 py-3">
                  <h4 className="text-sm font-semibold mb-1">
                    Search Trends{" "}
                    <span className="font-normal text-base-content/50">
                      Past 12 months
                    </span>
                  </h4>
                  <AreaTrendChart trend={overviewKeyword.trend} />
                </div>
              )}

              {/* SERP panel */}
              <div className="flex-1 flex flex-col overflow-hidden border border-base-300 rounded-xl bg-base-100">
                <div className="shrink-0 px-4 py-3 border-b border-base-300">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Globe className="size-3.5" />
                    SERP Analysis
                    {serpKeyword && (
                      <span className="font-normal text-base-content/50 truncate">
                        : {serpKeyword}
                      </span>
                    )}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <SerpAnalysisCard
                    items={serpResults}
                    loading={serpLoading}
                    error={serpError}
                    onRetry={() => {
                      void serpQuery.refetch();
                    }}
                    page={serpPage}
                    pageSize={SERP_PAGE_SIZE}
                    onPageChange={setSerpPage}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: stacked layout with tabs */}
          <div className="flex-1 flex flex-col overflow-hidden md:hidden">
            {/* Tab bar */}
            <div className="shrink-0 flex border-b border-base-300 bg-base-100">
              <button
                className={`flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors ${
                  mobileTab === "keywords"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60"
                }`}
                onClick={() => setMobileTab("keywords")}
              >
                Keywords ({filteredRows.length})
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium text-center border-b-2 transition-colors ${
                  mobileTab === "serp"
                    ? "border-primary text-primary"
                    : "border-transparent text-base-content/60"
                }`}
                onClick={() => setMobileTab("serp")}
              >
                SERP Analysis
              </button>
            </div>

            {mobileTab === "keywords" ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {showApproximateMatchNotice && (
                  <div
                    className="mx-4 mt-2 rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-xs text-base-content"
                    role="status"
                  >
                    No exact match for{" "}
                    <span className="font-medium">"{searchedKeyword}"</span>.
                    Showing closest related keywords.
                  </div>
                )}

                {/* Mobile table toolbar */}
                <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-base-100">
                  <button
                    className={`btn btn-ghost btn-xs gap-1 ${showFilters ? "btn-active" : ""}`}
                    onClick={() => setShowFilters((p) => !p)}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="badge badge-xs badge-primary border-0 text-primary-content">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  <span className="text-xs text-base-content/60">
                    {selectedRows.size > 0
                      ? `${selectedRows.size} selected`
                      : `${filteredRows.length} keywords`}
                  </span>
                  <div className="flex-1" />
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={handleSaveKeywords}
                    disabled={selectedRows.size === 0}
                  >
                    <Save className="size-3.5" />
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={exportCsv}
                    disabled={filteredRows.length === 0}
                  >
                    <FileDown className="size-3.5" />
                  </button>
                </div>

                {showFilters && (
                  <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold">
                          Refine table results
                        </p>
                        {activeFilterCount > 0 && (
                          <span className="badge badge-xs badge-primary border-0 text-primary-content">
                            {activeFilterCount}
                          </span>
                        )}
                      </div>
                      <button
                        className="btn btn-xs btn-ghost gap-1"
                        onClick={resetFilters}
                        disabled={activeFilterCount === 0}
                      >
                        <RotateCcw className="size-3" />
                        Clear
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Include terms (audit, checker)"
                        value={pendingInclude}
                        onChange={(e) => setPendingInclude(e.target.value)}
                      />
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Exclude terms (jobs, course)"
                        value={pendingExclude}
                        onChange={(e) => setPendingExclude(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Min volume"
                        type="number"
                        value={pendingMinVol}
                        onChange={(e) => setPendingMinVol(e.target.value)}
                      />
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Max volume"
                        type="number"
                        value={pendingMaxVol}
                        onChange={(e) => setPendingMaxVol(e.target.value)}
                      />
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Min CPC"
                        type="number"
                        step="0.01"
                        value={pendingMinCpc}
                        onChange={(e) => setPendingMinCpc(e.target.value)}
                      />
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Max CPC"
                        type="number"
                        step="0.01"
                        value={pendingMaxCpc}
                        onChange={(e) => setPendingMaxCpc(e.target.value)}
                      />
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Min difficulty"
                        type="number"
                        value={pendingMinKd}
                        onChange={(e) => setPendingMinKd(e.target.value)}
                      />
                      <input
                        className="input input-bordered input-sm bg-base-100"
                        placeholder="Max difficulty"
                        type="number"
                        value={pendingMaxKd}
                        onChange={(e) => setPendingMaxKd(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Mobile keyword cards */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {filteredRows.length === 0 ? (
                    <div className="h-full min-h-48 flex flex-col items-center justify-center text-center px-4 text-base-content/50 gap-3">
                      <p className="text-sm font-medium">
                        No keywords match your current filters.
                      </p>
                      {activeFilterCount > 0 ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={resetFilters}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    filteredRows.map((row) => (
                      <KeywordCard
                        key={row.keyword}
                        row={row}
                        isSelected={selectedRows.has(row.keyword)}
                        isActive={overviewKeyword?.keyword === row.keyword}
                        onToggle={() => toggleRowSelection(row.keyword)}
                        onClick={() => handleRowClick(row)}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <SerpAnalysisCard
                  items={serpResults}
                  loading={serpLoading}
                  error={serpError}
                  onRetry={() => {
                    void serpQuery.refetch();
                  }}
                  page={serpPage}
                  pageSize={SERP_PAGE_SIZE}
                  onPageChange={setSerpPage}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">
              Save {selectedRows.size} Keywords
            </h3>
            <div className="py-4">
              <p className="text-base-content/70 text-sm">
                These keywords will be saved to your current project.
              </p>
            </div>
            <div className="modal-action">
              <button className="btn" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmSave}>
                Save
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => setShowSaveDialog(false)}
          />
        </div>
      )}
    </div>
  );
}

function KeywordResearchLoadingState() {
  return (
    <div className="flex-1 w-full px-4 md:px-6 pb-4 max-w-8xl mx-auto">
      <div className="hidden md:flex h-full gap-4 mt-2">
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="skeleton h-5 w-56" />
          </div>
          <div className="flex-1 rounded-xl border border-base-300 bg-base-100 overflow-hidden">
            <div className="border-b border-base-300 px-4 py-3 flex items-center gap-3">
              <div className="skeleton h-8 w-24" />
              <div className="skeleton h-4 w-40" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[24px_minmax(0,1fr)_64px_56px_48px_40px] items-center gap-3"
                >
                  <div className="skeleton h-3 w-3" />
                  <div className="skeleton h-4 w-10/12" />
                  <div className="skeleton h-3 w-12 justify-self-end" />
                  <div className="skeleton h-3 w-10 justify-self-end" />
                  <div className="skeleton h-3 w-10 justify-self-end" />
                  <div className="skeleton h-6 w-6 rounded-full justify-self-end" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div className="skeleton h-4 w-36" />
            <div className="skeleton h-56 w-full" />
          </div>
          <div className="flex-1 rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div className="skeleton h-4 w-44" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[24px_1fr_72px] gap-2">
                <div className="skeleton h-3 w-4" />
                <div className="skeleton h-3 w-10/12" />
                <div className="skeleton h-3 w-12 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:hidden mt-2 space-y-3">
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-2/3" />
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-base-300 p-3"
            >
              <div className="skeleton h-4 w-9/12" />
              <div className="grid grid-cols-3 gap-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
