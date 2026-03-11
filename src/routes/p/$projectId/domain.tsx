import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { sortBy } from "remeda";
import { getDomainOverview } from "@/serverFunctions/domain";
import { saveKeywords } from "@/serverFunctions/keywords";
import { domainSearchSchema } from "@/types/schemas/domain";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Globe,
  Save,
  Search,
  Copy,
  AlertCircle,
  History,
  Clock,
  X,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useDomainSearchHistory } from "@/client/hooks/useDomainSearchHistory";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { scoreTierClass } from "@/client/features/keywords/utils";

export const Route = createFileRoute("/p/$projectId/domain")({
  validateSearch: domainSearchSchema,
  component: DomainOverviewPage,
});

type KeywordRow = {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  traffic: number | null;
  cpc: number | null;
  url: string | null;
  relativeUrl: string | null;
  keywordDifficulty: number | null;
};

type PageRow = {
  page: string;
  relativePath: string | null;
  organicTraffic: number | null;
  keywords: number | null;
};

type DomainControlsValues = {
  domain: string;
  subdomains: boolean;
  sort: "rank" | "traffic" | "volume";
};

type DomainSortMode = DomainControlsValues["sort"];
type SortOrder = "asc" | "desc";

function DomainOverviewPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  // --- URL search params (persisted in query string) ---
  const {
    domain: domainInput = "",
    subdomains: includeSubdomains = true,
    sort: sortMode = "rank",
    order: sortOrder,
    tab: activeTab = "keywords",
    search: searchText = "",
  } = Route.useSearch();
  const currentSortOrder = resolveSortOrder(sortMode, sortOrder);
  const navigate = useNavigate({ from: Route.fullPath });

  // --- Pending state (not in URL until Search clicked) ---
  const [domainError, setDomainError] = useState<string | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState(searchText);

  const defaultControlValues: DomainControlsValues = {
    domain: domainInput,
    subdomains: includeSubdomains,
    sort: sortMode,
  };

  const controlsForm = useForm({
    defaultValues: defaultControlValues,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    clearHistory,
    removeHistoryItem,
  } = useDomainSearchHistory(projectId);

  // Sync URL params to local pending state when they change
  useEffect(() => {
    controlsForm.setFieldValue("domain", domainInput);
    controlsForm.setFieldValue("subdomains", includeSubdomains);
    controlsForm.setFieldValue("sort", sortMode);
    setPendingSearch(searchText);
  }, [controlsForm, domainInput, includeSubdomains, searchText, sortMode]);

  // One-time URL normalization for old links with empty/default params.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search);
    const rawSort = toSortMode(raw.get("sort"));
    const rawOrder = toSortOrder(raw.get("order"));
    const shouldNormalize =
      raw.get("domain") === "" ||
      raw.get("search") === "" ||
      raw.get("subdomains") === "true" ||
      raw.get("sort") === "rank" ||
      (rawOrder != null &&
        rawOrder === getDefaultSortOrder(rawSort ?? "rank")) ||
      raw.get("tab") === "keywords";

    if (!shouldNormalize) return;

    void navigate({
      search: (prev) => ({
        ...prev,
        domain: prev.domain === "" ? undefined : prev.domain,
        search: prev.search === "" ? undefined : prev.search,
        subdomains: prev.subdomains === true ? undefined : prev.subdomains,
        sort: prev.sort === "rank" ? undefined : prev.sort,
        order:
          prev.order != null &&
          prev.order === getDefaultSortOrder(prev.sort ?? "rank")
            ? undefined
            : prev.order,
        tab: prev.tab === "keywords" ? undefined : prev.tab,
      }),
      replace: true,
    });
  }, [navigate]);

  const setSearchParams = useCallback(
    (updates: Record<string, string | number | boolean | undefined>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  // --- Local-only state (API response data) ---
  const [overview, setOverview] = useState<{
    domain: string;
    organicTraffic: number | null;
    organicKeywords: number | null;
    backlinks: number | null;
    referringDomains: number | null;
    hasData: boolean;
    keywords: KeywordRow[];
    pages: PageRow[];
  } | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    new Set(),
  );

  const domainMutation = useMutation({
    mutationFn: (data: {
      domain: string;
      includeSubdomains: boolean;
      locationCode: number;
      languageCode: string;
    }) => getDomainOverview({ data }),
  });
  const isLoading = domainMutation.isPending;

  const saveMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      languageCode: string;
      metrics?: Array<{
        keyword: string;
        searchVolume?: number | null;
        cpc?: number | null;
        keywordDifficulty?: number | null;
      }>;
    }) => saveKeywords({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });

  const filteredKeywords = useMemo(() => {
    const source = overview?.keywords ?? [];
    const filtered = !pendingSearch
      ? source
      : source.filter((row) => {
          const haystack =
            `${row.keyword} ${row.relativeUrl ?? ""}`.toLowerCase();
          return haystack.includes(pendingSearch.toLowerCase().trim());
        });

    if (sortMode === "traffic") {
      return sortBy(filtered, [
        (row) => sortableNullableNumber(row.traffic, currentSortOrder),
        currentSortOrder,
      ]);
    }

    if (sortMode === "volume") {
      return sortBy(filtered, [
        (row) => sortableNullableNumber(row.searchVolume, currentSortOrder),
        currentSortOrder,
      ]);
    }

    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.position, currentSortOrder),
      currentSortOrder,
    ]);
  }, [currentSortOrder, overview?.keywords, pendingSearch, sortMode]);

  const filteredPages = useMemo(() => {
    const source = overview?.pages ?? [];
    const filtered = !pendingSearch
      ? source
      : source.filter((row) => {
          const text = `${row.relativePath ?? ""} ${row.page}`.toLowerCase();
          return text.includes(pendingSearch.toLowerCase().trim());
        });

    const pageSortMode = toPageSortMode(sortMode);

    if (pageSortMode === "volume") {
      return sortBy(filtered, [
        (row) => sortableNullableNumber(row.keywords, currentSortOrder),
        currentSortOrder,
      ]);
    }

    return sortBy(filtered, [
      (row) => sortableNullableNumber(row.organicTraffic, currentSortOrder),
      currentSortOrder,
    ]);
  }, [currentSortOrder, overview?.pages, pendingSearch, sortMode]);
  useEffect(() => {
    setSearchParams({
      search: pendingSearch.trim() || undefined,
    });
  }, [pendingSearch, setSearchParams]);

  const visibleKeywords = useMemo(
    () => filteredKeywords.slice(0, 100).map((row) => row.keyword),
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
  }, [visibleKeywords]);

  const toggleKeywordSelection = (keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  };

  const toggleAllVisibleKeywords = () => {
    setSelectedKeywords((prev) => {
      if (
        visibleKeywords.length > 0 &&
        visibleKeywords.every((keyword) => prev.has(keyword))
      ) {
        return new Set();
      }
      return new Set(visibleKeywords);
    });
  };

  const applySort = useCallback(
    (nextSort: DomainSortMode, nextOrder: SortOrder) => {
      controlsForm.setFieldValue("sort", nextSort);
      setSearchParams({
        sort: toSortSearchParam(nextSort),
        order: toSortOrderSearchParam(nextSort, nextOrder),
      });
    },
    [controlsForm, setSearchParams],
  );

  const handleSortColumnClick = useCallback(
    (nextSort: DomainSortMode) => {
      const nextOrder =
        nextSort === sortMode
          ? currentSortOrder === "asc"
            ? "desc"
            : "asc"
          : getDefaultSortOrder(nextSort);

      applySort(nextSort, nextOrder);
    },
    [applySort, currentSortOrder, sortMode],
  );

  const handleSaveKeywords = () => {
    if (selectedKeywords.size === 0) {
      toast.error("Select at least one keyword first");
      return;
    }

    const selectedRows = filteredKeywords.filter((row) =>
      selectedKeywords.has(row.keyword),
    );

    saveMutation.mutate(
      {
        projectId,
        keywords: [...selectedKeywords],
        locationCode: 2840,
        languageCode: "en",
        metrics: selectedRows.map((row) => ({
          keyword: row.keyword,
          searchVolume: row.searchVolume,
          cpc: row.cpc,
          keywordDifficulty: row.keywordDifficulty,
        })),
      },
      {
        onSuccess: () => {
          toast.success(`Saved ${selectedKeywords.size} keywords`);
        },
        onError: (error) => {
          toast.error(getStandardErrorMessage(error, "Save failed."));
        },
      },
    );
  };

  const onSearch = (
    params?: Partial<{
      domain: string;
      subdomains: boolean;
      sort: DomainSortMode;
      order: SortOrder;
      tab: "keywords" | "pages";
      search: string;
    }>,
  ) => {
    const values = controlsForm.state.values;
    const rawTarget = params?.domain ?? values.domain;
    const activeSubdomains = params?.subdomains ?? values.subdomains;
    const activeSort = params?.sort ?? sortMode;
    const activeOrder = params?.order ?? currentSortOrder;
    const activeTabValue = params?.tab ?? activeTab;
    const activeSearch = params?.search ?? pendingSearch;
    if (!rawTarget.trim()) {
      setDomainError("Please enter a domain");
      return;
    }

    const target = normalizeDomainTarget(rawTarget);
    if (!target) {
      setDomainError(
        "Please enter a valid URL or domain (e.g. browserbase.com)",
      );
      return;
    }

    setDomainError(null);
    setOverviewError(null);
    setPendingSearch(activeSearch);
    controlsForm.setFieldValue("domain", target);
    controlsForm.setFieldValue("subdomains", activeSubdomains);
    controlsForm.setFieldValue("sort", activeSort);

    // Update URL with pending values before searching (filter out empty values)
    const searchUpdates: Record<string, string | boolean | undefined> = {
      domain: target,
      subdomains: activeSubdomains ? undefined : activeSubdomains,
      sort: toSortSearchParam(activeSort),
      order: toSortOrderSearchParam(activeSort, activeOrder),
      tab: activeTabValue === "keywords" ? undefined : activeTabValue,
    };
    searchUpdates.search = activeSearch.trim() || undefined;

    void navigate({
      search: (prev) => ({ ...prev, ...searchUpdates }),
      replace: true,
    });

    domainMutation.mutate(
      {
        domain: target,
        includeSubdomains: activeSubdomains,
        locationCode: 2840,
        languageCode: "en",
      },
      {
        onSuccess: (response) => {
          setOverview(response);
          setSelectedKeywords(new Set());

          addSearch({
            domain: target,
            subdomains: activeSubdomains,
            sort: activeSort,
            tab: activeTabValue,
            search: activeSearch.trim() || undefined,
          });

          if (!response.hasData) {
            toast.info("Not enough data for this domain");
          }
        },
        onError: (error) => {
          setOverviewError(getStandardErrorMessage(error, "Lookup failed."));
        },
      },
    );
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Domain Overview</h1>
          <p className="text-sm text-base-content/70">
            Analyze any domain&apos;s SEO profile: traffic, keywords, and
            backlinks.
          </p>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <form
              className="grid grid-cols-1 gap-3 lg:grid-cols-12"
              onSubmit={handleSearchSubmit}
            >
              <label
                className={`input input-bordered lg:col-span-8 flex items-center gap-2 ${domainError ? "input-error" : ""}`}
              >
                <Search className="size-4 text-base-content/60" />
                <controlsForm.Field name="domain">
                  {(field) => (
                    <input
                      placeholder="Enter a domain (e.g. coolify.io or example.com/blog)"
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                        if (domainError) setDomainError(null);
                      }}
                      aria-invalid={domainError ? true : undefined}
                      aria-describedby={
                        domainError ? "domain-input-error" : undefined
                      }
                    />
                  )}
                </controlsForm.Field>
              </label>

              <controlsForm.Field name="sort">
                {(field) => (
                  <select
                    className="select select-bordered lg:col-span-2"
                    value={field.state.value}
                    onChange={(e) => {
                      const next = toSortMode(e.target.value) ?? "rank";
                      field.handleChange(next);
                      applySort(next, getDefaultSortOrder(next));
                    }}
                  >
                    <option value="rank">By Rank</option>
                    <option value="traffic">By Traffic</option>
                    <option value="volume">By Volume</option>
                  </select>
                )}
              </controlsForm.Field>

              <button
                type="submit"
                className="btn btn-primary lg:col-span-2"
                disabled={isLoading}
              >
                {isLoading ? "Loading..." : "Search"}
              </button>
            </form>

            {domainError ? (
              <p id="domain-input-error" className="text-sm text-error">
                {domainError}
              </p>
            ) : null}

            {overviewError ? (
              <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{overviewError}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <label className="label cursor-pointer gap-2 py-0">
                <controlsForm.Field name="subdomains">
                  {(field) => (
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={field.state.value}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                  )}
                </controlsForm.Field>
                <span className="label-text">Include subdomains</span>
              </label>
            </div>
          </div>
        </div>

        {isLoading ? (
          <DomainOverviewLoadingState />
        ) : overview === null ? (
          <div className="space-y-4 pt-1">
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
                        const updates = {
                          domain: item.domain,
                          subdomains: item.subdomains ? undefined : false,
                          sort: toSortSearchParam(item.sort),
                          order: undefined,
                          tab: item.tab === "keywords" ? undefined : item.tab,
                          search: item.search?.trim() ? item.search : undefined,
                        };

                        controlsForm.setFieldValue("domain", item.domain);
                        controlsForm.setFieldValue(
                          "subdomains",
                          item.subdomains,
                        );
                        controlsForm.setFieldValue("sort", item.sort);
                        setPendingSearch(item.search ?? "");
                        setSearchParams(updates);

                        onSearch({
                          domain: item.domain,
                          subdomains: item.subdomains,
                          sort: item.sort,
                          order: getDefaultSortOrder(item.sort),
                          tab: item.tab,
                          search: item.search ?? "",
                        });
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Clock className="size-4 text-base-content/40 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-base-content truncate">
                            {item.domain}
                          </p>
                          <p className="text-sm text-base-content/60 truncate">
                            {item.subdomains
                              ? "Include subdomains"
                              : "Root domain only"}
                            {item.search?.trim() ? ` - ${item.search}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
              <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/55 space-y-2">
                <Globe className="size-9 mx-auto opacity-35" />
                <p className="text-base font-medium text-base-content/80">
                  Enter a domain to get started
                </p>
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard
                label="Estimated Organic Traffic"
                value={formatMetric(overview.organicTraffic, overview.hasData)}
              />
              <StatCard
                label="Organic Keywords"
                value={formatMetric(overview.organicKeywords, overview.hasData)}
              />
            </div>

            {!overview.hasData && (
              <div className="alert alert-info">
                <span>
                  Not enough data for this domain yet. Try another domain or
                  include subdomains.
                </span>
              </div>
            )}

            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div role="tablist" className="tabs tabs-box w-fit">
                    <button
                      role="tab"
                      className={`tab ${activeTab === "keywords" ? "tab-active" : ""}`}
                      onClick={() => setSearchParams({ tab: "keywords" })}
                    >
                      Top Keywords
                    </button>
                    <button
                      role="tab"
                      className={`tab ${activeTab === "pages" ? "tab-active" : ""}`}
                      onClick={() => {
                        if (sortMode === "rank") {
                          applySort("traffic", getDefaultSortOrder("traffic"));
                        }
                        setSearchParams({ tab: "pages" });
                      }}
                    >
                      Top Pages
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {activeTab === "keywords" && (
                      <button
                        className="btn btn-sm"
                        onClick={handleSaveKeywords}
                        disabled={selectedKeywords.size === 0}
                      >
                        <Save className="size-4" /> Save Keywords
                      </button>
                    )}
                    <div className="dropdown dropdown-end">
                      <div
                        tabIndex={0}
                        role="button"
                        className="btn btn-sm gap-1"
                      >
                        <Download className="size-4" />
                        Export
                        <ChevronDown className="size-3 opacity-60" />
                      </div>
                      <ul
                        tabIndex={0}
                        className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-48"
                      >
                        <li>
                          <button
                            onClick={async () => {
                              const text = JSON.stringify(
                                activeTab === "keywords"
                                  ? filteredKeywords
                                  : filteredPages,
                                null,
                                2,
                              );
                              await navigator.clipboard.writeText(text);
                              toast.success("Copied data");
                            }}
                          >
                            <Copy className="size-4" />
                            Copy data
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              const rows =
                                activeTab === "keywords"
                                  ? keywordsToCsv(filteredKeywords)
                                  : pagesToCsv(filteredPages);
                              downloadCsv(
                                rows,
                                `${overview.domain}-${activeTab}.csv`,
                              );
                            }}
                          >
                            <Download className="size-4" />
                            Download CSV
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              const rows =
                                activeTab === "keywords"
                                  ? keywordsToCsv(filteredKeywords)
                                  : pagesToCsv(filteredPages);
                              downloadCsv(
                                rows,
                                `${overview.domain}-${activeTab}.xls`,
                              );
                            }}
                          >
                            <FileSpreadsheet className="size-4" />
                            Download Excel
                          </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <label className="input input-bordered input-sm w-full max-w-xs flex items-center gap-2">
                    <Search className="size-4 text-base-content/60" />
                    <input
                      placeholder="Search in results"
                      value={pendingSearch}
                      onChange={(e) => setPendingSearch(e.target.value)}
                    />
                  </label>
                </div>

                {activeTab === "keywords" ? (
                  <div className="overflow-x-auto">
                    <div className="mb-2 text-xs text-base-content/60">
                      {selectedKeywords.size > 0
                        ? `${selectedKeywords.size} selected`
                        : "Select keywords to save"}
                    </div>
                    <table className="table table-zebra table-sm">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              className="checkbox checkbox-xs"
                              checked={
                                visibleKeywords.length > 0 &&
                                visibleKeywords.every((keyword) =>
                                  selectedKeywords.has(keyword),
                                )
                              }
                              onChange={toggleAllVisibleKeywords}
                            />
                          </th>
                          <th>Keyword</th>
                          <th>
                            <SortableHeader
                              label="Rank"
                              isActive={sortMode === "rank"}
                              order={currentSortOrder}
                              onClick={() => handleSortColumnClick("rank")}
                            />
                          </th>
                          <th>
                            <SortableHeader
                              label="Volume"
                              isActive={sortMode === "volume"}
                              order={currentSortOrder}
                              onClick={() => handleSortColumnClick("volume")}
                            />
                          </th>
                          <th>
                            <SortableHeader
                              label="Traffic"
                              isActive={sortMode === "traffic"}
                              order={currentSortOrder}
                              onClick={() => handleSortColumnClick("traffic")}
                            />
                          </th>
                          <th>
                            <HeaderHelpLabel
                              label="CPC"
                              helpText="Cost per click in USD."
                            />
                          </th>
                          <th>URL</th>
                          <th>
                            <HeaderHelpLabel
                              label="Score"
                              helpText="Keyword difficulty score."
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredKeywords.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="py-6 text-center text-base-content/60"
                            >
                              No keywords match this search.
                            </td>
                          </tr>
                        ) : (
                          filteredKeywords.slice(0, 100).map((row) => (
                            <tr key={`${row.keyword}-${row.url ?? ""}`}>
                              <td>
                                <input
                                  type="checkbox"
                                  className="checkbox checkbox-xs"
                                  checked={selectedKeywords.has(row.keyword)}
                                  onChange={() =>
                                    toggleKeywordSelection(row.keyword)
                                  }
                                  aria-label={`Select ${row.keyword}`}
                                />
                              </td>
                              <td className="font-medium">{row.keyword}</td>
                              <td>{row.position ?? "-"}</td>
                              <td>{formatNumber(row.searchVolume)}</td>
                              <td>{formatFloat(row.traffic)}</td>
                              <td>
                                {row.cpc == null
                                  ? "-"
                                  : `$${row.cpc.toFixed(2)}`}
                              </td>
                              <td
                                className="max-w-[260px] truncate"
                                title={row.url ?? undefined}
                              >
                                {row.relativeUrl ?? row.url ?? "-"}
                              </td>
                              <td>
                                <DifficultyBadge
                                  value={row.keywordDifficulty}
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-zebra table-sm">
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th>
                            <SortableHeader
                              label="Organic Traffic"
                              isActive={toPageSortMode(sortMode) === "traffic"}
                              order={currentSortOrder}
                              onClick={() => handleSortColumnClick("traffic")}
                            />
                          </th>
                          <th>
                            <SortableHeader
                              label="Keywords"
                              isActive={toPageSortMode(sortMode) === "volume"}
                              order={currentSortOrder}
                              onClick={() => handleSortColumnClick("volume")}
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPages.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-6 text-center text-base-content/60"
                            >
                              No pages match this search.
                            </td>
                          </tr>
                        ) : (
                          filteredPages.slice(0, 100).map((row) => (
                            <tr key={row.page}>
                              <td
                                className="max-w-[420px] truncate"
                                title={row.page}
                              >
                                {row.relativePath ?? row.page}
                              </td>
                              <td>{formatFloat(row.organicTraffic)}</td>
                              <td>{formatNumber(row.keywords)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DomainOverviewLoadingState() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body p-4 space-y-2">
            <div className="skeleton h-3 w-36" />
            <div className="skeleton h-8 w-44" />
          </div>
        </div>
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body p-4 space-y-2">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-8 w-40" />
          </div>
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-center justify-between">
            <div className="skeleton h-8 w-48" />
            <div className="skeleton h-8 w-60" />
          </div>
          <div className="skeleton h-9 w-64" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="grid grid-cols-7 gap-3">
                <div className="skeleton h-4 col-span-2" />
                <div className="skeleton h-4" />
                <div className="skeleton h-4" />
                <div className="skeleton h-4" />
                <div className="skeleton h-4 col-span-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function toSortMode(value: string | null): DomainSortMode | undefined {
  if (value === "rank" || value === "traffic" || value === "volume") {
    return value;
  }
  return undefined;
}

function toSortOrder(value: string | null): SortOrder | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

function getDefaultSortOrder(sortMode: DomainSortMode): SortOrder {
  return sortMode === "rank" ? "asc" : "desc";
}

function resolveSortOrder(
  sortMode: DomainSortMode,
  sortOrder: SortOrder | undefined,
): SortOrder {
  return sortOrder ?? getDefaultSortOrder(sortMode);
}

function toSortSearchParam(
  sortMode: DomainSortMode,
): DomainSortMode | undefined {
  return sortMode === "rank" ? undefined : sortMode;
}

function toSortOrderSearchParam(
  sortMode: DomainSortMode,
  sortOrder: SortOrder,
): SortOrder | undefined {
  return sortOrder === getDefaultSortOrder(sortMode) ? undefined : sortOrder;
}

function sortableNullableNumber(
  value: number | null | undefined,
  order: SortOrder,
): number {
  if (value != null) return value;
  return order === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function toPageSortMode(
  sortMode: DomainSortMode,
): Exclude<DomainSortMode, "rank"> {
  if (sortMode === "rank") return "traffic";
  return sortMode;
}

function SortableHeader({
  label,
  isActive,
  order,
  onClick,
}: {
  label: string;
  isActive: boolean;
  order: SortOrder;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium hover:text-base-content"
      onClick={onClick}
      aria-label={`Sort by ${label}`}
      aria-pressed={isActive}
    >
      <span>{label}</span>
      {isActive ? (
        order === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : null}
    </button>
  );
}

function normalizeDomainTarget(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)
    ? value
    : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || !hostname.includes(".")) return null;

    if (!/^[a-z\d.-]+$/.test(hostname)) return null;

    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${hostname}${path}`;
  } catch {
    return null;
  }
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4">
        <p className="text-xs uppercase tracking-wide text-base-content/60">
          {label}
        </p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

function DifficultyBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="badge badge-ghost">-</span>;
  }

  return (
    <span
      className={`score-badge ${scoreTierClass(value)} inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold`}
    >
      {value}
    </span>
  );
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat().format(value);
}

function formatFloat(value: number | null | undefined) {
  if (value == null) return "-";
  if (value > 100) return new Intl.NumberFormat().format(Math.round(value));
  return value.toFixed(2);
}

function formatMetric(
  value: number | null | undefined,
  hasData: boolean | undefined,
) {
  if (!hasData) return "Not enough data";
  return formatNumber(value);
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function keywordsToCsv(rows: KeywordRow[]): string {
  const headers = [
    "Keyword",
    "Rank",
    "Volume",
    "Traffic",
    "CPC",
    "URL",
    "Score",
  ];
  const lines = rows.map((row) =>
    [
      row.keyword,
      row.position,
      row.searchVolume,
      row.traffic,
      row.cpc,
      row.relativeUrl ?? row.url,
      row.keywordDifficulty,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [headers.map(csvEscape).join(","), ...lines].join("\n");
}

function pagesToCsv(rows: PageRow[]): string {
  const headers = ["Page", "Organic Traffic", "Keywords"];
  const lines = rows.map((row) =>
    [row.relativePath ?? row.page, row.organicTraffic, row.keywords]
      .map(csvEscape)
      .join(","),
  );
  return [headers.map(csvEscape).join(","), ...lines].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
