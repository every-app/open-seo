import { AlertCircle } from "lucide-react";
import { BackButton } from "@/client/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { QueryError, QueryState } from "@/client/components/QueryState";
import { SkeletonPage } from "@/client/components/SkeletonPresets";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/client/components/ui/progress";
import { Spinner } from "@/client/components/ui/spinner";
import {
  getAuditResults,
  getAuditStatus,
  getCrawlProgress,
} from "@/serverFunctions/audit";
import { ResultsView } from "@/client/features/audit/results/ResultsView";
import {
  BotProtectionAdvice,
  extractHostname,
  extractPathname,
  formatStartedAt,
  HttpStatusBadge,
  StatusBadge,
} from "@/client/features/audit/shared";
import { SUPPORT_EMAIL } from "@/client/lib/support";

export function AuditDetail({
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

  // isPending (not isLoading) also covers a fetch paused while offline, so
  // past these two returns the status is always loaded.
  if (statusQuery.isPending) {
    return <SkeletonPage />;
  }

  if (statusQuery.isError) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <BackButton onClick={onBack}>All audits</BackButton>
          <QueryError
            fallback="We could not load this audit. It may have been deleted."
            onRetry={() => void statusQuery.refetch()}
            isRetrying={statusQuery.isFetching}
          />
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
  // banner and the zero-page banner, so the zero-page banner doesn't flash.
  const failedWithoutResults =
    isFailed && resultsQuery.isSuccess && !failedWithResults;
  const results = resultsQuery.data;
  // A completed crawl that reached one page or none was blocked by the site,
  // unless that page is an app shell, which the results explain instead.
  // A failed audit stopped on our side, so it gets the error code instead.
  const siteBlocked =
    isComplete &&
    status.pagesCrawled <= 1 &&
    results !== undefined &&
    !results.issues.some(
      (issue) => issue.issueType === "javascript-rendering-suspected",
    );

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="space-y-3">
          <BackButton onClick={onBack}>All audits</BackButton>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {extractHostname(status.startUrl)}
              </h1>
              {!isRunning && <StatusBadge status={status.status} />}
            </div>
            <p className="text-sm text-muted-foreground">
              Site audit &middot; Started {formatStartedAt(status.startedAt)}
            </p>
          </div>
        </div>

        {isRunning && (
          <ProgressCard
            projectId={projectId}
            auditId={auditId}
            status={status}
          />
        )}

        {failedWithoutResults && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>
              This audit stopped before it crawled any pages.
            </AlertTitle>
            <AlertDescription>
              <p>
                Run a new audit to try again, or email{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if this
                keeps happening.
              </p>
              {status.errorCode ? (
                <p className="font-mono text-xs">Code: {status.errorCode}</p>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        {siteBlocked && results && (
          <Alert variant="warning">
            <AlertCircle />
            <AlertTitle>
              This site's bot protection blocked our crawler.
            </AlertTitle>
            <AlertDescription>
              <BotProtectionAdvice
                projectId={projectId}
                rendered={results.audit.config.renderJavaScript === true}
              />
            </AlertDescription>
          </Alert>
        )}

        {failedWithResults && (
          <Alert variant="warning">
            <AlertCircle />
            <AlertTitle>
              This audit stopped early after {partialPageCount} page
              {partialPageCount === 1 ? "" : "s"}.
            </AlertTitle>
            <AlertDescription>
              The results below cover everything crawled before it stopped. Run
              a new audit to try again, or email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if this
              keeps happening.
            </AlertDescription>
          </Alert>
        )}

        {(isComplete || isFailed) && (
          <QueryState
            query={resultsQuery}
            errorFallback="Failed to load the audit results"
          >
            {(data) =>
              (isComplete || failedWithResults) && (
                <ResultsView
                  projectId={projectId}
                  data={data}
                  tab={tab}
                  onTabChange={onTabChange}
                  siteBlocked={siteBlocked}
                />
              )
            }
          </QueryState>
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
      ? "Discovery"
      : status.currentPhase === "crawling"
        ? "Crawling"
        : status.currentPhase === "lighthouse"
          ? "Lighthouse"
          : status.currentPhase === "finalizing"
            ? "Finalizing"
            : "Running";
  const progress = isLighthousePhase ? lighthouseProgress : crawlProgress;

  const crawlProgressQuery = useQuery({
    queryKey: ["audit-crawl-progress", projectId, auditId],
    queryFn: () => getCrawlProgress({ data: { projectId, auditId } }),
    refetchInterval: 1500,
  });

  const crawledUrls = crawlProgressQuery.data ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-medium">
            <Spinner className="text-primary" aria-hidden />
            {isLighthousePhase ? "Running Lighthouse checks" : "Crawling pages"}
          </CardTitle>
          <CardAction>
            <Badge variant="secondary">{phaseLabel}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Progress value={progress}>
            <ProgressLabel className="font-normal">
              {isLighthousePhase
                ? `${lighthouseDone} / ${status.lighthouseTotal} checks${
                    status.lighthouseFailed > 0
                      ? ` (${status.lighthouseFailed} failed)`
                      : ""
                  }`
                : `${status.pagesCrawled} / ${status.pagesTotal} pages`}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
        </CardContent>
      </Card>

      {crawledUrls.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="font-medium text-muted-foreground">
              Crawled Pages ({crawledUrls.length})
            </CardTitle>
            <CardAction className="text-xs text-muted-foreground">
              Updated {new Date(crawledUrls[0].crawledAt).toLocaleTimeString()}
            </CardAction>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto">
            {crawledUrls.map((entry, i) => (
              <ProgressRow
                key={`${entry.url}-${entry.crawledAt}`}
                entry={entry}
                index={i}
              />
            ))}
          </CardContent>
        </Card>
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
        <span className="truncate text-foreground/80" title={entry.url}>
          {pathname}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {entry.title && (
          <span
            className="text-xs text-muted-foreground truncate max-w-[260px] hidden md:block"
            title={entry.title}
          >
            {entry.title}
          </span>
        )}
      </div>
    </div>
  );
}
