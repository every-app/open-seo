import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, Loader2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { LocalGridResults } from "@/client/features/local-seo/LocalGridResults";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  archiveLocalGridConfig,
  getLocalGridConfig,
  getLocalGridResults,
  triggerLocalGridScan,
  updateLocalGridConfig,
} from "@/serverFunctions/local-seo";
import { estimateLocalGridCost, toLocalGridSize } from "@/shared/local-seo";

export const Route = createFileRoute(
  "/_project/p/$projectId/local/grid/$configId",
)({
  component: LocalGridDetail,
});

function LocalGridDetail() {
  const { projectId, configId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showScanConfirm, setShowScanConfirm] = useState(false);
  const { data, isPending } = useQuery({
    queryKey: ["localGridConfig", projectId, configId],
    queryFn: () => getLocalGridConfig({ data: { projectId, configId } }),
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveLocalGridConfig({ data: { projectId, configId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["localGridConfigs", projectId],
      });
      toast.success("Map grid archived");
      void navigate({
        to: "/p/$projectId/local/grid",
        params: { projectId },
      });
    },
  });
  const activeMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      updateLocalGridConfig({ data: { projectId, configId, isActive } }),
    onSuccess: (_, isActive) => {
      void queryClient.invalidateQueries({
        queryKey: ["localGridConfig", projectId, configId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["localGridConfigs", projectId],
      });
      toast.success(isActive ? "Schedule resumed" : "Schedule paused");
    },
  });
  const { data: resultsData } = useQuery({
    queryKey: ["localGridResults", projectId, configId],
    queryFn: () => getLocalGridResults({ data: { projectId, configId } }),
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return run?.status === "pending" || run?.status === "running"
        ? 2_000
        : false;
    },
  });
  const scanMutation = useMutation({
    mutationFn: () => triggerLocalGridScan({ data: { projectId, configId } }),
    onSuccess: (result) => {
      setShowScanConfirm(false);
      void queryClient.invalidateQueries({
        queryKey: ["localGridResults", projectId, configId],
      });
      if (result.ok) {
        toast.success("Map grid scan queued");
      } else {
        toast.info("A map grid scan is already running");
      }
    },
    onError: () => toast.error("Could not start the map grid scan"),
  });

  if (isPending || !data) {
    return <div className="skeleton h-56 w-full" aria-busy />;
  }

  const estimate = estimateLocalGridCost({
    gridSize: toLocalGridSize(data.config.gridSize),
    keywordCount: data.keywords.length,
    searchDepth: data.config.searchDepth,
  });
  const latestRun = resultsData?.run;
  const scanIsActive =
    latestRun?.status === "pending" || latestRun?.status === "running";
  const hostedScansDisabled = isHostedClientAuthMode();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="btn btn-ghost btn-sm btn-square"
            to="/p/$projectId/local/grid"
            params={{ projectId }}
            aria-label="Back to map grids"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              {data.config.name}
            </h2>
            <p className="truncate text-xs text-base-content/60">
              {data.business.name} · {data.business.address ?? "No address"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => activeMutation.mutate(!data.config.isActive)}
            disabled={activeMutation.isPending}
          >
            {data.config.isActive ? "Disable grid" : "Enable grid"}
          </button>
          <button
            className="btn btn-ghost btn-sm gap-1 text-error"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            <Archive className="size-3.5" />
            Archive
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card border border-base-300 bg-base-100 lg:col-span-2">
          <div className="card-body">
            <h3 className="card-title text-sm">Configuration</h3>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-base-content/50">Grid</dt>
                <dd>
                  {data.config.gridSize}×{data.config.gridSize}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Radius</dt>
                <dd>{data.config.radiusMeters.toLocaleString()} m</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Depth</dt>
                <dd>Top {data.config.searchDepth}</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Scan mode</dt>
                <dd>Manual</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Language</dt>
                <dd>{data.config.languageCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Search domain</dt>
                <dd>{data.config.seDomain ?? "Automatic"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h3 className="card-title text-sm">Next scan estimate</h3>
            <p className="text-2xl font-semibold">{estimate.taskCount}</p>
            <p className="text-xs text-base-content/60">queued API tasks</p>
            <div className="mt-2 text-xs">
              <p>Raw provider: ${estimate.rawCostUsd.toFixed(5)}</p>
              <p>Hosted billing: ${estimate.hostedCostUsd.toFixed(5)}</p>
            </div>
            {latestRun ? (
              <p className="mt-2 text-xs text-base-content/60">
                Latest: <span className="capitalize">{latestRun.status}</span>
                {scanIsActive
                  ? ` · ${latestRun.tasksCompleted}/${latestRun.taskCount}`
                  : ""}
              </p>
            ) : null}
            <button
              className="btn btn-primary btn-sm mt-2"
              onClick={() => setShowScanConfirm(true)}
              disabled={
                hostedScansDisabled || !data.config.isActive || scanIsActive
              }
              title={
                hostedScansDisabled
                  ? "Hosted scans will be enabled after credit reservation is available"
                  : undefined
              }
            >
              {scanIsActive ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Zap className="size-3.5" />
              )}
              {hostedScansDisabled
                ? "Hosted scans coming soon"
                : scanIsActive
                  ? "Scan running"
                  : "Run scan"}
            </button>
          </div>
        </div>
      </div>

      <div className="card border border-base-300 bg-base-100">
        <div className="card-body">
          <h3 className="card-title text-sm">Keywords</h3>
          <div className="flex flex-wrap gap-2">
            {data.keywords.map((keyword) => (
              <span key={keyword.id} className="badge badge-outline">
                {keyword.keyword}
              </span>
            ))}
          </div>
        </div>
      </div>

      {resultsData ? (
        <LocalGridResults data={resultsData} />
      ) : (
        <div className="skeleton h-80 w-full" aria-busy />
      )}

      {showScanConfirm ? (
        <Modal
          maxWidth="max-w-md"
          onClose={() => setShowScanConfirm(false)}
          labelledBy="local-grid-scan-confirm-title"
        >
          <div>
            <h3
              id="local-grid-scan-confirm-title"
              className="text-lg font-semibold"
            >
              Run this map grid scan?
            </h3>
            <p className="mt-1 text-sm text-base-content/60">
              This queues {estimate.taskCount} paid DataForSEO tasks. Results
              can take up to 15 minutes.
            </p>
          </div>
          <div className="rounded-xl border border-base-300 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span>Estimated hosted cost</span>
              <strong>${estimate.hostedCostUsd.toFixed(5)}</strong>
            </div>
            <div className="mt-1 flex justify-between gap-4 text-base-content/60">
              <span>Usage credits</span>
              <span>{estimate.hostedCredits.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowScanConfirm(false)}
              disabled={scanMutation.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Confirm and run
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
