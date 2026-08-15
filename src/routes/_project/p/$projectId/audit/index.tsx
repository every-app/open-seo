import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getAuditResults,
  getAuditStatus,
  getCrawlProgress,
} from "@/serverFunctions/audit";
import { auditSearchSchema } from "@/types/schemas/audit";
import { LaunchView } from "@/client/features/audit/launch/LaunchView";
import { ResultsView } from "@/client/features/audit/results/ResultsView";
import {
  extractHostname,
  extractPathname,
  formatStartedAt,
  HttpStatusBadge,
  StatusBadge,
  SUPPORT_EMAIL,
} from "@/client/features/audit/shared";

export const Route = createFileRoute<"/_project/p/$projectId/audit/">(
  "/_project/p/$projectId/audit/",
)({
  validateSearch: auditSearchSchema,
  component: SiteAuditPage,
});

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

  if (!auditId) {
    return (
      <LaunchView
        projectId={projectId}
        onAuditStarted={(id) => setSearchParams({ auditId: id })}
      />
    );
  }

  return (
    <AuditDetail
      projectId={projectId}
      auditId={auditId}
      tab={tab}
      onBack={() => setSearchParams({ auditId: undefined })}
      onTabChange={(nextTab) => setSearchParams({ tab: nextTab })}
    />
  );
}

function AuditDetail({
  projectId,
  auditId,
  tab,
  onBack,
  onTabChange,
}: {
  projectId: string;
  auditId: string;
  tab: string;
  onBack: () => void;
  onTabChange: (tab: "issues" | "pages" | "performance") => void;
}) {
  const statusQuery = useQuery({
    queryKey: ["audit-status", projectId, auditId],
    queryFn: () => getAuditStatus({ data: { projectId, auditId } }),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "running" ? 3000 : false;
    },
  });

  const isComplete = statusQuery.data?.status === "completed";
  const isFailed = statusQuery.data?.status === "failed";
  const isRunning = statusQuery.data?.status === "running";

  // Failed audits keep whatever pages were crawled before the failure
  // (persistence is per-batch), so fetch results for them too and show the
  // partial crawl instead of a dead end.
  const resultsQuery = useQuery({
    queryKey: ["audit-results", projectId, auditId],
    queryFn: () => getAuditResults({ data: { projectId, auditId } }),
    enabled: isComplete || isFailed,
  });

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (statusQuery.isError) {
    return (
      <div className="px-4 py-6 md:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="alert alert-error">
            <AlertCircle className="size-5" />
            <span>无法加载此审计，记录可能已被删除。</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            ← 返回审计列表
          </button>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;
  const partialPageCount = isFailed
    ? (resultsQuery.data?.pages.length ?? 0)
    : 0;
  const failedWithResults = isFailed && partialPageCount > 0;
  // Wait for the results fetch before choosing between the "partial results"
  // banner and the zero-page support CTA, so the CTA doesn't flash first.
  const showSupportCta =
    (isFailed && resultsQuery.isSuccess && !failedWithResults) ||
    (isComplete && status && status.pagesCrawled <= 1);

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="space-y-1">
          <button className="btn btn-ghost btn-sm px-0" onClick={onBack}>
            ← 全部审计
          </button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold">
              {status ? extractHostname(status.startUrl) : "站点审计"}
            </h1>
            {status?.status !== "running" && status && (
              <StatusBadge status={status.status} />
            )}
          </div>
          {status && (
            <p className="text-sm text-base-content/60">
              站点审计 · 开始时间 {formatStartedAt(status.startedAt)}
            </p>
          )}
        </div>

        {isRunning && status && (
          <ProgressCard
            projectId={projectId}
            auditId={auditId}
            status={status}
          />
        )}

        {showSupportCta && (
          <div
            className={isFailed ? "alert alert-error" : "alert alert-warning"}
          >
            <AlertCircle className="size-5" />
            <div className="space-y-1">
              <p className="font-medium">站点审计未能完整抓取此网站。</p>
              <p>
                这通常由机器人防护或防火墙设置导致。您可以发送邮件至{" "}
                <a
                  className="link link-primary"
                  href={`mailto:${SUPPORT_EMAIL}`}
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                ，我们会协助配置网站审计。
              </p>
            </div>
          </div>
        )}

        {failedWithResults && (
          <div className="alert alert-warning">
            <AlertCircle className="size-5" />
            <div className="space-y-1">
              <p className="font-medium">
                此次审计提前停止，已抓取 {partialPageCount} 个页面。
              </p>
              <p>
                以下结果涵盖停止前已抓取的内容。可运行新审计重试，或发送邮件至{" "}
                <a
                  className="link link-primary"
                  href={`mailto:${SUPPORT_EMAIL}`}
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                寻求帮助。
              </p>
            </div>
          </div>
        )}

        {(isComplete || failedWithResults) && resultsQuery.data && (
          <ResultsView
            projectId={projectId}
            data={resultsQuery.data}
            tab={tab}
            onTabChange={onTabChange}
          />
        )}
      </div>
    </div>
  );
}

function ProgressCard({
  projectId,
  auditId,
  status,
}: {
  projectId: string;
  auditId: string;
  status: {
    pagesCrawled: number;
    pagesTotal: number;
    lighthouseTotal: number;
    lighthouseCompleted: number;
    lighthouseFailed: number;
    currentPhase: string | null;
  };
}) {
  const crawlProgress =
    status.pagesTotal > 0
      ? Math.round((status.pagesCrawled / status.pagesTotal) * 100)
      : 0;
  const lighthouseDone = status.lighthouseCompleted + status.lighthouseFailed;
  const lighthouseProgress =
    status.lighthouseTotal > 0
      ? Math.round((lighthouseDone / status.lighthouseTotal) * 100)
      : 0;
  const isLighthousePhase = status.currentPhase === "lighthouse";
  const phaseLabel =
    status.currentPhase === "discovery"
      ? "发现页面"
      : status.currentPhase === "crawling"
        ? "抓取中"
        : status.currentPhase === "lighthouse"
          ? "Lighthouse"
          : status.currentPhase === "finalizing"
            ? "整理结果"
            : (status.currentPhase ?? "运行中");
  const progress = isLighthousePhase ? lighthouseProgress : crawlProgress;

  const crawlProgressQuery = useQuery({
    queryKey: ["audit-crawl-progress", projectId, auditId],
    queryFn: () => getCrawlProgress({ data: { projectId, auditId } }),
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
              {isLighthousePhase ? "正在运行 Lighthouse 检查" : "正在抓取页面"}
            </h2>
            <span className="badge badge-ghost badge-sm">{phaseLabel}</span>
          </div>

          <progress
            className="progress progress-primary w-full"
            value={progress}
            max={100}
          />

          <div className="flex items-center justify-between text-sm">
            {isLighthousePhase ? (
              <span>
                {lighthouseDone} / {status.lighthouseTotal} checks
                {status.lighthouseFailed > 0
                  ? ` (${status.lighthouseFailed} failed)`
                  : ""}
              </span>
            ) : (
              <span>
                {status.pagesCrawled} / {status.pagesTotal} 个页面
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
              已抓取页面（{crawledUrls.length})
            </h3>
            <p className="text-xs text-base-content/50">
              更新时间 {new Date(crawledUrls[0].crawledAt).toLocaleTimeString()}
            </p>
            <div className="max-h-[400px] overflow-y-auto -mx-1">
              {crawledUrls.map((entry, i) => (
                <ProgressRow
                  key={`${entry.url}-${entry.crawledAt}`}
                  entry={entry}
                  index={i}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressRow({
  entry,
  index,
}: {
  entry: {
    url: string;
    statusCode: number | null;
    title: string | null;
    crawledAt: number;
  };
  index: number;
}) {
  const pathname = extractPathname(entry.url);

  return (
    <div
      className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded text-sm ${
        index === 0
          ? "bg-primary/5 animate-in fade-in slide-in-from-top-1 duration-300"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <HttpStatusBadge code={entry.statusCode} />
        <span className="truncate text-base-content/80" title={entry.url}>
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
}
