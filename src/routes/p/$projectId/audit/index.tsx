import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  startAudit,
  getAuditStatus,
  getAuditResults,
  getAuditHistory,
  getCrawlProgress,
  deleteAudit,
} from "@/serverFunctions/audit";
import {
  clearProjectPsiApiKey,
  getProjectPsiApiKey,
  saveProjectPsiApiKey,
} from "@/serverFunctions/psi";
import { auditSearchSchema } from "@/types/schemas/audit";
import {
  ScanSearch,
  AlertCircle,
  CheckCircle,
  Trash2,
  MoreHorizontal,
  ExternalLink,
  Loader2,
  Download,
  ChevronDown,
  Settings,
} from "lucide-react";

const SUPPORT_URL = "https://everyapp.dev/support";

export const Route = createFileRoute<"/p/$projectId/audit/">(
  "/p/$projectId/audit/",
)({
  validateSearch: auditSearchSchema,
  component: SiteAuditPage,
});

function extractPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStartedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SiteAuditPage() {
  const { projectId } = Route.useParams();
  const { auditId, tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearchParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      void navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  if (auditId) {
    return (
      <AuditDetail
        projectId={projectId}
        auditId={auditId}
        tab={tab}
        setSearchParams={setSearchParams}
        onBack={() => setSearchParams({ auditId: undefined })}
      />
    );
  }

  return (
    <LaunchView
      projectId={projectId}
      onAuditStarted={(id) => setSearchParams({ auditId: id })}
    />
  );
}

function LaunchView({
  projectId,
  onAuditStarted,
}: {
  projectId: string;
  onAuditStarted: (auditId: string) => void;
}) {
  type LaunchFormValues = {
    url: string;
    maxPagesInput: string;
    runPsi: boolean;
    psiMode: "auto" | "all";
  };

  const defaultLaunchValues: LaunchFormValues = {
    url: "",
    maxPagesInput: "50",
    runPsi: false,
    psiMode: "auto",
  };

  const minPages = 10;
  const maxPagesLimit = 10_000;
  const launchForm = useForm({
    defaultValues: defaultLaunchValues,
  });
  const settingsForm = useForm({
    defaultValues: {
      psiApiKey: "",
    },
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showPsiKey, setShowPsiKey] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [psiRequirementError, setPsiRequirementError] = useState<string | null>(
    null,
  );
  const [startError, setStartError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      startUrl: string;
      maxPages: number;
      psiStrategy: "auto" | "all" | "none";
      psiApiKey?: string;
    }) => startAudit({ data }),
  });

  const historyQuery = useQuery({
    queryKey: ["audit-history", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });

  const deleteMutation = useMutation({
    mutationFn: (auditId: string) => deleteAudit({ data: { auditId } }),
    onSuccess: () => {
      void historyQuery.refetch();
      toast.success("Audit deleted");
    },
  });

  const keyQuery = useQuery({
    queryKey: ["projectPsiApiKey", projectId],
    // PSI key is non-billing and used to prevent API abuse; this read-back is
    // intentional to keep setup simple for self-host users.
    queryFn: () => getProjectPsiApiKey({ data: { projectId } }),
  });

  useEffect(() => {
    if (keyQuery.data?.apiKey) {
      settingsForm.setFieldValue("psiApiKey", keyQuery.data.apiKey);
    }
  }, [keyQuery.data?.apiKey, settingsForm]);

  const saveKeyMutation = useMutation({
    mutationFn: (apiKey: string) =>
      saveProjectPsiApiKey({ data: { projectId, apiKey } }),
    onSuccess: async () => {
      toast.success("PSI API key saved for this project");
      await keyQuery.refetch();
    },
  });

  const clearKeyMutation = useMutation({
    mutationFn: () => clearProjectPsiApiKey({ data: { projectId } }),
    onSuccess: async () => {
      settingsForm.setFieldValue("psiApiKey", "");
      toast.success("PSI API key cleared");
      await keyQuery.refetch();
    },
  });

  const applyMaxPages = (value: number) => {
    const safeValue = Number.isFinite(value)
      ? Math.max(minPages, Math.min(maxPagesLimit, Math.round(value)))
      : minPages;
    launchForm.setFieldValue("maxPagesInput", String(safeValue));
    return safeValue;
  };

  const commitMaxPagesInput = () => {
    const maxPagesInput = launchForm.state.values.maxPagesInput;
    if (!maxPagesInput) {
      return applyMaxPages(minPages);
    }

    const parsed = Number.parseInt(maxPagesInput, 10);
    return applyMaxPages(parsed);
  };

  const handleStart = () => {
    const launchValues = launchForm.state.values;
    const settingsValues = settingsForm.state.values;
    const effectiveMaxPages = commitMaxPagesInput();
    setStartError(null);

    if (!launchValues.url.trim()) {
      setUrlError("Please enter a URL.");
      return;
    }
    setUrlError(null);

    if (launchValues.runPsi && !settingsValues.psiApiKey.trim()) {
      setPsiRequirementError(
        "Set a Google PageSpeed Insights API key before running PSI checks.",
      );
      setIsSettingsOpen(true);
      return;
    }
    setPsiRequirementError(null);

    if (effectiveMaxPages > 500) {
      const confirmed = window.confirm(
        `You are about to crawl ${effectiveMaxPages.toLocaleString()} pages. This is okay, but it may take a while. Continue?`,
      );
      if (!confirmed) return;
    }

    startMutation.mutate(
      {
        projectId,
        startUrl: launchValues.url,
        maxPages: effectiveMaxPages,
        psiStrategy: launchValues.runPsi ? launchValues.psiMode : "none",
        psiApiKey: launchValues.runPsi
          ? settingsValues.psiApiKey || undefined
          : undefined,
      },
      {
        onSuccess: (result) => {
          setStartError(null);
          toast.success("Audit started!");
          onAuditStarted(result.auditId);
        },
        onError: (error) => {
          setStartError(
            error instanceof Error ? error.message : "Failed to start audit",
          );
        },
      },
    );
  };

  const handleStartSubmit = (event: FormEvent) => {
    event.preventDefault();
    handleStart();
  };

  const history = historyQuery.data ?? [];

  const handleRunPsiToggle = (checked: boolean) => {
    const psiApiKey = settingsForm.state.values.psiApiKey;
    if (!checked) {
      setPsiRequirementError(null);
      launchForm.setFieldValue("runPsi", false);
      return;
    }

    if (!psiApiKey.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    launchForm.setFieldValue("runPsi", true);
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Site Audit</h1>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-base">Start New Audit</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Open audit settings"
              >
                <Settings className="size-4" />
                Settings
              </button>
            </div>

            <form
              className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center"
              onSubmit={handleStartSubmit}
            >
              <label
                className={`input input-bordered w-full lg:col-span-9 ${urlError ? "input-error" : ""}`}
              >
                <launchForm.Field name="url">
                  {(field) => (
                    <input
                      placeholder="https://example.com"
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                        if (urlError) setUrlError(null);
                      }}
                    />
                  )}
                </launchForm.Field>
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-sm w-full lg:col-span-3"
                disabled={startMutation.isPending}
              >
                {startMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Starting...
                  </>
                ) : (
                  "Start Audit"
                )}
              </button>

              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-12 lg:items-start">
                <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-base-content/60">
                    Crawl limit
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-base-content/70">
                      Max pages
                    </span>
                    <launchForm.Field name="maxPagesInput">
                      {(field) => (
                        <input
                          type="number"
                          min={minPages}
                          max={maxPagesLimit}
                          className="input input-bordered input-sm w-28"
                          value={field.state.value}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!/^\d*$/.test(next)) return;
                            field.handleChange(next);
                          }}
                          onBlur={commitMaxPagesInput}
                        />
                      )}
                    </launchForm.Field>
                  </div>
                  <p className="text-xs text-base-content/50">
                    Enter any value from {minPages} to {maxPagesLimit}.
                  </p>
                </div>

                <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
                  <label className="label cursor-pointer justify-start gap-2 p-0">
                    <launchForm.Field name="runPsi">
                      {(field) => (
                        <input
                          type="checkbox"
                          className="toggle toggle-sm toggle-primary"
                          checked={field.state.value}
                          onChange={(e) => handleRunPsiToggle(e.target.checked)}
                        />
                      )}
                    </launchForm.Field>
                    <span
                      className="text-sm font-medium text-base-content/80"
                      title="Run Google PageSpeed Insights checks during this audit"
                    >
                      Include PSI checks
                    </span>
                  </label>

                  <launchForm.Subscribe
                    selector={(state) => state.values.runPsi}
                  >
                    {(runPsi) =>
                      runPsi ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-base-content/60">
                              PSI mode
                            </span>
                            <launchForm.Field name="psiMode">
                              {(field) => (
                                <select
                                  className="select select-bordered select-xs"
                                  value={field.state.value}
                                  onChange={(e) => {
                                    field.handleChange(
                                      e.target.value === "all" ? "all" : "auto",
                                    );
                                  }}
                                >
                                  <option value="auto">
                                    Auto sample (recommended)
                                  </option>
                                  <option value="all">All crawled pages</option>
                                </select>
                              )}
                            </launchForm.Field>
                            <settingsForm.Subscribe
                              selector={(state) => state.values.psiApiKey}
                            >
                              {(psiApiKey) => (
                                <span
                                  className={`text-xs ${
                                    psiApiKey.trim()
                                      ? "text-success/80"
                                      : "text-warning"
                                  }`}
                                >
                                  {psiApiKey.trim()
                                    ? "PSI key saved"
                                    : "PSI key required"}
                                </span>
                              )}
                            </settingsForm.Subscribe>
                          </div>
                        </div>
                      ) : null
                    }
                  </launchForm.Subscribe>
                </div>

                <div className="lg:col-span-12 space-y-2">
                  {urlError ? (
                    <p className="text-sm text-error">{urlError}</p>
                  ) : null}
                  {psiRequirementError ? (
                    <div className="alert alert-warning py-2">
                      <span className="text-sm">{psiRequirementError}</span>
                    </div>
                  ) : null}
                  {startError ? (
                    <div className="alert alert-error py-2">
                      <span className="text-sm">{startError}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </form>
          </div>
        </div>

        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
            <div className="card w-full max-w-lg bg-base-100 border border-base-300 shadow-xl">
              <div className="card-body gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="card-title text-base">Audit Settings</h3>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setIsSettingsOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-base-content/70">
                    Google PageSpeed Insights API Key
                  </label>
                  <div className="flex gap-2">
                    <settingsForm.Field name="psiApiKey">
                      {(field) => (
                        <input
                          type={showPsiKey ? "text" : "password"}
                          className="input input-bordered flex-1"
                          placeholder="Google API key"
                          value={field.state.value}
                          onChange={(e) => {
                            field.handleChange(e.target.value);
                            if (settingsError) setSettingsError(null);
                            if (psiRequirementError)
                              setPsiRequirementError(null);
                          }}
                        />
                      )}
                    </settingsForm.Field>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowPsiKey((v) => !v)}
                    >
                      {showPsiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="text-xs text-base-content/50">
                    Stored on this project and reused by PSI and Site Audit.
                    Required to run PSI checks in audits.
                  </p>
                  <div className="rounded-md border border-base-300 bg-base-200/30 p-3 text-xs text-base-content/70 space-y-1.5">
                    <p className="font-medium text-base-content/80">
                      Need a PSI key?
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Open{" "}
                        <a
                          className="link link-primary"
                          href="https://developers.google.com/speed/docs/insights/v5/get-started"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          PageSpeed Insights getting started
                        </a>{" "}
                        and click "Get a key".
                      </li>
                      <li>
                        Create any Google Cloud project (for example: Open SEO).
                      </li>
                      <li>Paste the key here and save.</li>
                    </ol>
                  </div>
                  {settingsError ? (
                    <p className="text-sm text-error">{settingsError}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-error"
                    onClick={() => {
                      clearKeyMutation.mutate();
                    }}
                  >
                    Clear key
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const trimmed =
                        settingsForm.state.values.psiApiKey.trim();
                      if (!trimmed) {
                        setSettingsError("Please enter an API key.");
                        return;
                      }
                      setSettingsError(null);
                      setPsiRequirementError(null);
                      saveKeyMutation.mutate(trimmed);
                      setShowPsiKey(false);
                      setIsSettingsOpen(false);
                    }}
                  >
                    Save settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3">
              <h2 className="card-title text-base">Previous Audits</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>URL</th>
                      <th>Status</th>
                      <th>Pages</th>
                      <th>PSI</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((audit) => (
                      <tr key={audit.id} className="hover group">
                        <td className="text-xs text-base-content/70">
                          {formatDate(audit.startedAt)}
                        </td>
                        <td className="max-w-[220px] truncate">
                          {audit.startUrl}
                        </td>
                        <td>
                          <StatusBadge status={audit.status} />
                        </td>
                        <td>{audit.pagesTotal || audit.pagesCrawled}</td>
                        <td>
                          {audit.ranPsi ? (
                            <span className="badge badge-ghost badge-xs">
                              Yes
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => onAuditStarted(audit.id)}
                            >
                              View
                            </button>
                            <div className="dropdown dropdown-end">
                              <div
                                tabIndex={0}
                                role="button"
                                className="btn btn-ghost btn-xs btn-square"
                                aria-label="Audit actions"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </div>
                              <ul
                                tabIndex={0}
                                className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-40"
                              >
                                <li>
                                  <button
                                    className="text-error"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteMutation.mutate(audit.id);
                                    }}
                                  >
                                    <Trash2 className="size-3.5" />
                                    Delete audit
                                  </button>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {history.length === 0 && !historyQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center text-base-content/40 space-y-3">
              <ScanSearch className="size-12 mx-auto opacity-30" />
              <p className="text-lg font-medium">No audits yet</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditDetail({
  projectId,
  auditId,
  tab,
  setSearchParams,
  onBack,
}: {
  projectId: string;
  auditId: string;
  tab: string;
  setSearchParams: (updates: Record<string, string | undefined>) => void;
  onBack: () => void;
}) {
  const statusQuery = useQuery({
    queryKey: ["audit-status", auditId],
    queryFn: () => getAuditStatus({ data: { auditId } }),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 3000 : false;
    },
  });

  const isComplete = statusQuery.data?.status === "completed";
  const isFailed = statusQuery.data?.status === "failed";
  const isRunning = statusQuery.data?.status === "running";

  const resultsQuery = useQuery({
    queryKey: ["audit-results", auditId],
    queryFn: () => getAuditResults({ data: { auditId } }),
    enabled: isComplete,
  });

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const status = statusQuery.data;
  const showSupportCta =
    isFailed || (isComplete && status && status.pagesCrawled <= 1);

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="space-y-1">
          <button className="btn btn-ghost btn-sm px-0" onClick={onBack}>
            &larr; All audits
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Site Audit</h1>
            {status?.status !== "running" && status && (
              <StatusBadge status={status.status} />
            )}
          </div>
          {status && (
            <p className="text-sm text-base-content/70">
              {extractHostname(status.startUrl)} &middot; Started{" "}
              {formatStartedAt(status.startedAt)}
            </p>
          )}
        </div>

        {isRunning && status && (
          <ProgressCard auditId={auditId} status={status} />
        )}

        {showSupportCta && (
          <div
            className={isFailed ? "alert alert-error" : "alert alert-warning"}
          >
            <AlertCircle className="size-5" />
            <div className="space-y-1">
              <p className="font-medium">
                Site audit couldn't fully crawl this website.
              </p>
              <p>
                This is often caused by anti-bot or firewall settings. Reach out
                at{" "}
                <a
                  className="link link-primary"
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  everyapp.dev/support
                </a>{" "}
                and we'll help configure auditing for your site.
              </p>
            </div>
          </div>
        )}

        {isComplete && resultsQuery.data && (
          <ResultsView
            projectId={projectId}
            data={resultsQuery.data}
            tab={tab}
            setSearchParams={setSearchParams}
          />
        )}
      </div>
    </div>
  );
}

function ProgressCard({
  auditId,
  status,
}: {
  auditId: string;
  status: {
    pagesCrawled: number;
    pagesTotal: number;
    psiTotal: number;
    psiCompleted: number;
    psiFailed: number;
    currentPhase: string | null;
  };
}) {
  const crawlProgress =
    status.pagesTotal > 0
      ? Math.round((status.pagesCrawled / status.pagesTotal) * 100)
      : 0;
  const psiDone = status.psiCompleted + status.psiFailed;
  const psiProgress =
    status.psiTotal > 0 ? Math.round((psiDone / status.psiTotal) * 100) : 0;
  const isPsiPhase = status.currentPhase === "psi";
  const phaseLabel =
    status.currentPhase === "discovery"
      ? "Discovery"
      : status.currentPhase === "crawling"
        ? "Crawling"
        : status.currentPhase === "psi"
          ? "PSI"
          : status.currentPhase === "finalizing"
            ? "Finalizing"
            : (status.currentPhase ?? "Running");
  const progress = isPsiPhase ? psiProgress : crawlProgress;

  const crawlProgressQuery = useQuery({
    queryKey: ["audit-crawl-progress", auditId],
    queryFn: () => getCrawlProgress({ data: { auditId } }),
    refetchInterval: 1500,
  });

  const crawledUrls = crawlProgressQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              {isPsiPhase ? "Running PSI checks" : "Crawling pages"}
            </h2>
            <span className="badge badge-ghost badge-sm">{phaseLabel}</span>
          </div>

          <progress
            className="progress progress-primary w-full"
            value={progress}
            max={100}
          />

          <div className="flex items-center justify-between text-sm">
            {isPsiPhase ? (
              <span>
                {psiDone} / {status.psiTotal} checks
                {status.psiFailed > 0 ? ` (${status.psiFailed} failed)` : ""}
              </span>
            ) : (
              <span>
                {status.pagesCrawled} / {status.pagesTotal} pages
              </span>
            )}
            <span className="text-base-content/60">{progress}%</span>
          </div>
        </div>
      </div>

      {crawledUrls.length > 0 && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 p-4">
            <h3 className="text-sm font-medium text-base-content/70">
              Crawled Pages ({crawledUrls.length})
            </h3>
            <p className="text-xs text-base-content/50">
              Updated {new Date(crawledUrls[0].crawledAt).toLocaleTimeString()}
            </p>
            <div className="max-h-[400px] overflow-y-auto -mx-1">
              {crawledUrls.map((entry, i) => {
                const pathname = extractPathname(entry.url);
                return (
                  <div
                    key={`${entry.url}-${entry.crawledAt}`}
                    className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded text-sm ${
                      i === 0
                        ? "bg-primary/5 animate-in fade-in slide-in-from-top-1 duration-300"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <HttpStatusBadge code={entry.statusCode} />
                      <span
                        className="truncate text-base-content/80"
                        title={entry.url}
                      >
                        {pathname}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {entry.title && (
                        <span
                          className="text-xs text-base-content/40 truncate max-w-[260px] hidden md:block"
                          title={entry.title}
                        >
                          {entry.title}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AuditResultsData = Awaited<ReturnType<typeof getAuditResults>>;

function ResultsView({
  projectId,
  data,
  tab,
  setSearchParams,
}: {
  projectId: string;
  data: AuditResultsData;
  tab: string;
  setSearchParams: (updates: Record<string, string | undefined>) => void;
}) {
  const { audit, pages, psi } = data;
  const hasPerformanceTab = psi.length > 0;
  const activeTab = hasPerformanceTab ? tab : "pages";

  const averageResponseMs = useMemo(() => {
    if (pages.length === 0) return 0;
    const total = pages.reduce(
      (sum, page) => sum + (page.responseTimeMs ?? 0),
      0,
    );
    return Math.round(total / pages.length);
  }, [pages]);

  const psiSummary = useMemo(() => {
    const failed = psi.filter((row) => !!row.errorMessage).length;
    const successful = psi.filter((row) => !row.errorMessage);

    const averageScore = (
      rows: typeof successful,
      key: "performanceScore" | "seoScore" | "accessibilityScore",
    ) => {
      const values = rows
        .map((row) => row[key])
        .filter((value): value is number => value != null);
      if (values.length === 0) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      return Math.round(total / values.length);
    };

    return {
      failed,
      avgPerformance: averageScore(successful, "performanceScore"),
      avgSeo: averageScore(successful, "seoScore"),
      avgAccessibility: averageScore(successful, "accessibilityScore"),
    };
  }, [psi]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pages Crawled" value={String(audit.pagesCrawled)} />
        <StatCard label="Total URLs" value={String(pages.length)} />
        <StatCard label="PSI Tests" value={String(psi.length)} />
        <StatCard label="Avg Response" value={`${averageResponseMs}ms`} />
        {psi.length > 0 && (
          <>
            <StatCard
              label="Avg PSI Perf"
              value={
                psiSummary.avgPerformance == null
                  ? "-"
                  : String(psiSummary.avgPerformance)
              }
              className={
                psiSummary.avgPerformance == null
                  ? ""
                  : psiSummary.avgPerformance >= 90
                    ? "text-success"
                    : psiSummary.avgPerformance >= 50
                      ? "text-warning"
                      : "text-error"
              }
            />
            <StatCard
              label="Avg PSI SEO"
              value={
                psiSummary.avgSeo == null ? "-" : String(psiSummary.avgSeo)
              }
              className={
                psiSummary.avgSeo == null
                  ? ""
                  : psiSummary.avgSeo >= 90
                    ? "text-success"
                    : psiSummary.avgSeo >= 50
                      ? "text-warning"
                      : "text-error"
              }
            />
            <StatCard
              label="Avg PSI A11y"
              value={
                psiSummary.avgAccessibility == null
                  ? "-"
                  : String(psiSummary.avgAccessibility)
              }
              className={
                psiSummary.avgAccessibility == null
                  ? ""
                  : psiSummary.avgAccessibility >= 90
                    ? "text-success"
                    : psiSummary.avgAccessibility >= 50
                      ? "text-warning"
                      : "text-error"
              }
            />
            <StatCard
              label="PSI Failures"
              value={String(psiSummary.failed)}
              className={psiSummary.failed > 0 ? "text-error" : "text-success"}
            />
          </>
        )}
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {hasPerformanceTab ? (
              <div role="tablist" className="tabs tabs-box w-fit">
                <button
                  role="tab"
                  className={`tab ${activeTab === "pages" ? "tab-active" : ""}`}
                  onClick={() => setSearchParams({ tab: "pages" })}
                >
                  Pages ({pages.length})
                </button>
                <button
                  role="tab"
                  className={`tab ${activeTab === "performance" ? "tab-active" : ""}`}
                  onClick={() => setSearchParams({ tab: "performance" })}
                >
                  Performance ({psi.length})
                </button>
              </div>
            ) : (
              <h3 className="text-base font-medium">Pages ({pages.length})</h3>
            )}

            <ExportDropdown
              onExport={(format) => {
                if (activeTab === "performance") {
                  exportPerformance(psi, pages, format);
                } else {
                  exportPages(pages, format);
                }
              }}
            />
          </div>

          {activeTab === "pages" && (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Title</th>
                    <th>H1</th>
                    <th>Words</th>
                    <th>Images</th>
                    <th>Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id}>
                      <td className="max-w-[200px] truncate">
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link link-primary text-xs inline-flex items-center gap-1"
                        >
                          {extractPathname(page.url)}
                          <ExternalLink className="size-3" />
                        </a>
                      </td>
                      <td>
                        <HttpStatusBadge code={page.statusCode} />
                      </td>
                      <td
                        className="max-w-[180px] truncate"
                        title={page.title ?? ""}
                      >
                        {page.title || (
                          <span className="text-error text-xs">missing</span>
                        )}
                      </td>
                      <td>{page.h1Count}</td>
                      <td>{page.wordCount}</td>
                      <td>
                        {page.imagesMissingAlt > 0 ? (
                          <span className="text-warning">
                            {page.imagesMissingAlt}/{page.imagesTotal}
                          </span>
                        ) : (
                          page.imagesTotal
                        )}
                      </td>
                      <td className="text-xs">
                        {page.responseTimeMs ? `${page.responseTimeMs}ms` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "performance" && psi.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Device</th>
                    <th>Status</th>
                    <th>Perf</th>
                    <th>A11y</th>
                    <th>SEO</th>
                    <th>LCP</th>
                    <th>CLS</th>
                    <th>INP</th>
                    <th>TTFB</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {psi.map((result) => {
                    const page = pages.find((p) => p.id === result.pageId);
                    const isFailed = !!result.errorMessage;
                    return (
                      <tr key={result.id}>
                        <td className="max-w-[160px] truncate text-xs">
                          {page ? extractPathname(page.url) : "-"}
                        </td>
                        <td className="capitalize text-xs">
                          {result.strategy}
                        </td>
                        <td>
                          {isFailed ? (
                            <span
                              className="badge badge-error badge-outline text-xs"
                              title={result.errorMessage ?? "PSI check failed"}
                            >
                              failed
                            </span>
                          ) : (
                            <span className="badge badge-success badge-outline text-xs">
                              ok
                            </span>
                          )}
                        </td>
                        <td>
                          <PsiScoreBadge score={result.performanceScore} />
                        </td>
                        <td>
                          <PsiScoreBadge score={result.accessibilityScore} />
                        </td>
                        <td>
                          <PsiScoreBadge score={result.seoScore} />
                        </td>
                        <td className="text-xs">
                          {result.lcpMs
                            ? `${(result.lcpMs / 1000).toFixed(1)}s`
                            : "-"}
                        </td>
                        <td className="text-xs">
                          {result.cls != null ? result.cls.toFixed(3) : "-"}
                        </td>
                        <td className="text-xs">
                          {result.inpMs ? `${Math.round(result.inpMs)}ms` : "-"}
                        </td>
                        <td className="text-xs">
                          {result.ttfbMs
                            ? `${Math.round(result.ttfbMs)}ms`
                            : "-"}
                        </td>
                        <td>
                          {result.r2Key ? (
                            <a
                              className="btn btn-primary btn-xs"
                              href={`/p/${projectId}/audit/issues/${result.id}?source=site&category=performance`}
                            >
                              View issues
                            </a>
                          ) : (
                            <span className="text-xs text-base-content/40">
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="badge badge-info badge-sm gap-1">
        <Loader2 className="size-3 animate-spin" /> Running
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="badge badge-outline badge-sm gap-1 text-success/80 border-success/30 bg-success/5">
        <CheckCircle className="size-3" /> Done
      </span>
    );
  }
  return (
    <span className="badge badge-error badge-sm gap-1">
      <AlertCircle className="size-3" /> Failed
    </span>
  );
}

function HttpStatusBadge({ code }: { code: number | null }) {
  if (!code) return <span className="badge badge-ghost badge-sm">-</span>;
  if (code >= 200 && code < 300)
    return <span className="badge badge-success badge-sm">{code}</span>;
  if (code >= 300 && code < 400)
    return <span className="badge badge-warning badge-sm">{code}</span>;
  return <span className="badge badge-error badge-sm">{code}</span>;
}

function PsiScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-base-content/40">-</span>;
  }
  const color =
    score >= 90 ? "text-success" : score >= 50 ? "text-warning" : "text-error";
  return <span className={`font-medium text-sm ${color}`}>{score}</span>;
}

function StatCard({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4">
        <p className="text-xs uppercase tracking-wide text-base-content/60">
          {label}
        </p>
        <p className={`text-2xl font-semibold ${className}`}>{value}</p>
      </div>
    </div>
  );
}

function csvEscape(
  value: string | number | boolean | null | undefined,
): string {
  if (value == null) return "";
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPages(pages: AuditResultsData["pages"], format: "csv" | "json") {
  const rows = pages.map((p) => ({
    url: p.url,
    statusCode: p.statusCode,
    title: p.title ?? "",
    h1Count: p.h1Count,
    wordCount: p.wordCount,
    imagesTotal: p.imagesTotal,
    imagesMissingAlt: p.imagesMissingAlt,
    responseTimeMs: p.responseTimeMs,
  }));

  if (format === "json") {
    downloadFile(
      JSON.stringify(rows, null, 2),
      "audit-pages.json",
      "application/json",
    );
    return;
  }

  const headers = [
    "URL",
    "Status",
    "Title",
    "H1",
    "Words",
    "Images",
    "Missing Alt",
    "Response Time (ms)",
  ];

  const lines = rows.map((r) =>
    [
      r.url,
      r.statusCode,
      r.title,
      r.h1Count,
      r.wordCount,
      r.imagesTotal,
      r.imagesMissingAlt,
      r.responseTimeMs,
    ]
      .map(csvEscape)
      .join(","),
  );

  downloadFile(
    [headers.map(csvEscape).join(","), ...lines].join("\n"),
    "audit-pages.csv",
    "text/csv",
  );
}

function exportPerformance(
  psi: AuditResultsData["psi"],
  pages: AuditResultsData["pages"],
  format: "csv" | "json",
) {
  const rows = psi.map((r) => {
    const page = pages.find((p) => p.id === r.pageId);
    return {
      url: page?.url ?? "",
      strategy: r.strategy,
      performance: r.performanceScore,
      accessibility: r.accessibilityScore,
      seo: r.seoScore,
      lcpMs: r.lcpMs,
      cls: r.cls,
      inpMs: r.inpMs,
      ttfbMs: r.ttfbMs,
    };
  });

  if (format === "json") {
    downloadFile(
      JSON.stringify(rows, null, 2),
      "audit-performance.json",
      "application/json",
    );
    return;
  }

  const headers = [
    "URL",
    "Device",
    "Performance",
    "Accessibility",
    "SEO",
    "LCP (ms)",
    "CLS",
    "INP (ms)",
    "TTFB (ms)",
  ];
  const lines = rows.map((r) =>
    [
      r.url,
      r.strategy,
      r.performance,
      r.accessibility,
      r.seo,
      r.lcpMs,
      r.cls,
      r.inpMs,
      r.ttfbMs,
    ]
      .map(csvEscape)
      .join(","),
  );

  downloadFile(
    [headers.map(csvEscape).join(","), ...lines].join("\n"),
    "audit-performance.csv",
    "text/csv",
  );
}

function ExportDropdown({
  onExport,
}: {
  onExport: (format: "csv" | "json") => void;
}) {
  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-sm btn-ghost gap-1">
        <Download className="size-4" />
        Export
        <ChevronDown className="size-3 opacity-60" />
      </div>
      <ul
        tabIndex={0}
        className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-40"
      >
        <li>
          <button onClick={() => onExport("csv")}>CSV</button>
        </li>
        <li>
          <button onClick={() => onExport("json")}>JSON</button>
        </li>
      </ul>
    </div>
  );
}
