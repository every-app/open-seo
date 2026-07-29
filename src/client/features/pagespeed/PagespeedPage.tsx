import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { PagespeedConnectionCard } from "@/client/features/pagespeed/PagespeedConnectionCard";
import { PagespeedExportMenu } from "@/client/features/pagespeed/PagespeedExportMenu";
import { PagespeedIssuesPanel } from "@/client/features/pagespeed/PagespeedIssuesPanel";
import { PagespeedRunDetail } from "@/client/features/pagespeed/PagespeedRunDetail";
import { PagespeedTrendChart } from "@/client/features/pagespeed/PagespeedTrendChart";
import {
  PagespeedUrlTable,
  type PsiUrlRow,
} from "@/client/features/pagespeed/PagespeedUrlTable";
import {
  addPagespeedUrl,
  getPagespeedOverview,
  removePagespeedUrl,
  runPagespeedForUrl,
} from "@/serverFunctions/pagespeed";
import {
  latestByUrl,
  PAGESPEED_STRATEGY_VALUES,
  type PagespeedSnapshotLike,
  type PagespeedStrategyValue,
} from "@/shared/pagespeed";

const NO_URLS: PsiUrlRow[] = [];
const NO_SNAPSHOTS: PagespeedSnapshotLike[] = [];

/**
 * PageSpeed Insights for the project's monitored URLs: Lighthouse scores and
 * lab metrics, plus CrUX field data — the real-user numbers Google actually
 * scores ranking on. See specs/0011.
 */
export function PagespeedPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [strategy, setStrategy] =
    React.useState<PagespeedStrategyValue>("mobile");
  const [selectedUrlId, setSelectedUrlId] = React.useState<string | null>(null);
  const [newUrl, setNewUrl] = React.useState("");
  const [runningIds, setRunningIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const overviewKey = React.useMemo(
    () => ["pagespeedOverview", projectId],
    [projectId],
  );
  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => getPagespeedOverview({ data: { projectId } }),
  });
  const data = overviewQuery.data;
  // Stable empty fallbacks: a fresh [] each render would invalidate the memos
  // below on every keystroke in the add-URL field.
  const urls = data?.configured ? data.urls : NO_URLS;
  const snapshots = data?.configured ? data.snapshots : NO_SNAPSHOTS;

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: overviewKey }),
    [queryClient, overviewKey],
  );

  /** Track in-flight runs per row so "Run all" shows each URL's own progress
   *  rather than one spinner for the whole batch. */
  const runUrl = React.useCallback(
    async (urlId: string) => {
      setRunningIds((current) => new Set(current).add(urlId));
      try {
        await runPagespeedForUrl({ data: { projectId, urlId } });
      } catch (error) {
        toast.error(getStandardErrorMessage(error));
      } finally {
        setRunningIds((current) => {
          const next = new Set(current);
          next.delete(urlId);
          return next;
        });
        await invalidate();
      }
    },
    [projectId, invalidate],
  );

  /** Sequential on purpose: PageSpeed rate-limits per key, and one URL
   *  failing must not abort the rest. */
  const runAll = React.useCallback(async () => {
    for (const url of urls) {
      await runUrl(url.id);
    }
  }, [urls, runUrl]);

  const addMutation = useMutation({
    mutationFn: (url: string) => addPagespeedUrl({ data: { projectId, url } }),
    onSuccess: () => {
      setNewUrl("");
      toast.success("URL added");
      void invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (urlId: string) =>
      removePagespeedUrl({ data: { projectId, urlId } }),
    onSuccess: () => {
      toast.success("URL removed");
      void invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const latest = React.useMemo(
    () => latestByUrl(snapshots, strategy),
    [snapshots, strategy],
  );

  const activeUrl =
    urls.find((url) => url.id === selectedUrlId) ?? urls[0] ?? null;
  const activeEntry = activeUrl ? latest.get(activeUrl.id) : undefined;
  const activeSnapshots = React.useMemo(
    () =>
      activeUrl
        ? snapshots.filter((snapshot) => snapshot.urlId === activeUrl.id)
        : NO_SNAPSHOTS,
    [snapshots, activeUrl],
  );
  const busy = runningIds.size > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">PageSpeed</h1>
        <p className="text-sm text-base-content/70">
          Lighthouse scores and real-user Core Web Vitals from Google PageSpeed
          Insights.
        </p>
      </div>

      {overviewQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Loading PageSpeed results…
        </div>
      ) : overviewQuery.isError ? (
        <div className="space-y-3">
          <p className="text-sm text-error">Couldn't load PageSpeed results.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void overviewQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : !data?.configured ? (
        <div className="max-w-2xl">
          <PagespeedConnectionCard projectId={projectId} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="join">
              {PAGESPEED_STRATEGY_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn join-item btn-sm ${
                    strategy === value ? "btn-active" : ""
                  }`}
                  onClick={() => setStrategy(value)}
                >
                  {value === "mobile" ? "Mobile" : "Desktop"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || urls.length === 0}
              onClick={() => void runAll()}
            >
              {busy ? "Running…" : "Run all"}
            </button>
          </div>

          <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4">
              <h2 className="text-sm font-semibold">Monitored URLs</h2>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (newUrl.trim()) addMutation.mutate(newUrl);
                }}
              >
                <input
                  type="url"
                  className="input input-bordered input-sm w-64"
                  placeholder="https://example.com/pricing"
                  value={newUrl}
                  onChange={(event) => setNewUrl(event.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm"
                  disabled={!newUrl.trim() || addMutation.isPending}
                >
                  {addMutation.isPending ? "Adding…" : "Add URL"}
                </button>
                <PagespeedExportMenu
                  urls={urls}
                  latest={latest}
                  strategy={strategy}
                />
              </form>
            </div>
            <PagespeedUrlTable
              urls={urls}
              latest={latest}
              runningIds={runningIds}
              selectedUrlId={activeUrl?.id ?? null}
              onSelect={setSelectedUrlId}
              onRun={(urlId) => void runUrl(urlId)}
              onRemove={(urlId) => removeMutation.mutate(urlId)}
            />
          </section>

          {activeUrl ? (
            <>
              <PagespeedRunDetail
                url={activeUrl.url}
                entry={latest.get(activeUrl.id)}
              />
              {activeEntry && !activeEntry.snapshot.errorMessage ? (
                <PagespeedIssuesPanel
                  projectId={projectId}
                  snapshotId={activeEntry.snapshot.id}
                />
              ) : null}
              <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
                <h2 className="mb-3 truncate text-sm font-semibold">
                  Trend · {activeUrl.url}
                </h2>
                <PagespeedTrendChart
                  snapshots={activeSnapshots}
                  strategy={strategy}
                />
              </section>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
