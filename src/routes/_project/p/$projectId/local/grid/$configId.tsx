import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  archiveLocalGridConfig,
  getLocalGridConfig,
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

  if (isPending || !data) {
    return <div className="skeleton h-56 w-full" aria-busy />;
  }

  const estimate = estimateLocalGridCost({
    gridSize: toLocalGridSize(data.config.gridSize),
    keywordCount: data.keywords.length,
    searchDepth: data.config.searchDepth,
  });

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
            {data.config.isActive ? "Pause schedule" : "Resume schedule"}
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
                <dt className="text-xs text-base-content/50">Schedule</dt>
                <dd className="capitalize">{data.config.scheduleInterval}</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Language</dt>
                <dd>{data.config.languageCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/50">Search domain</dt>
                <dd>{data.config.seDomain}</dd>
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
            <button className="btn btn-primary btn-sm mt-2" disabled>
              Scanning arrives in Batch 2
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
    </div>
  );
}
