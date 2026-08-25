import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, MapPinned, Plus } from "lucide-react";
import { LocalGridSetupModal } from "@/client/features/local-seo/LocalGridSetupModal";
import { listLocalGridConfigs } from "@/serverFunctions/local-seo";
import { estimateLocalGridCost, toLocalGridSize } from "@/shared/local-seo";

export const Route = createFileRoute("/_project/p/$projectId/local/grid/")({
  component: LocalGridIndex,
});

function formatRadius(radiusMeters: number, unit: "km" | "mi") {
  const value = unit === "mi" ? radiusMeters / 1_609.344 : radiusMeters / 1_000;
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
}

function LocalGridIndex() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const { data, isPending } = useQuery({
    queryKey: ["localGridConfigs", projectId],
    queryFn: () => listLocalGridConfigs({ data: { projectId } }),
  });

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-0 p-0">
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Map grids</h2>
            <p className="mt-1 text-xs text-base-content/60">
              Configurations are saved without running a scan. Every future scan
              will show its task count and estimated cost before it starts.
            </p>
          </div>
          <button
            className="btn btn-primary btn-sm shrink-0 gap-1"
            onClick={() => setShowSetup(true)}
          >
            <Plus className="size-3.5" />
            Add grid
          </button>
        </div>

        <div className="divide-y divide-base-300 border-t border-base-300">
          {isPending ? (
            <div className="space-y-3 px-5 py-5" aria-busy>
              <div className="skeleton h-5 w-52" />
              <div className="skeleton h-4 w-80" />
            </div>
          ) : data?.length ? (
            data.map(({ config, business, keywordCount }) => {
              const estimate = estimateLocalGridCost({
                gridSize: toLocalGridSize(config.gridSize),
                keywordCount,
                searchDepth: config.searchDepth,
              });
              return (
                <Link
                  key={config.id}
                  to="/p/$projectId/local/grid/$configId"
                  params={{ projectId, configId: config.id }}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-base-200/50"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-base-200">
                    <MapPinned className="size-4 text-base-content/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {config.name}
                    </p>
                    <p className="truncate text-xs text-base-content/60">
                      {business.name} · {config.gridSize}×{config.gridSize} ·{" "}
                      {formatRadius(config.radiusMeters, config.distanceUnit)} ·{" "}
                      {keywordCount} keyword{keywordCount === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-[11px] text-base-content/45">
                      {estimate.taskCount} queued tasks · raw estimate $
                      {estimate.rawCostUsd.toFixed(5)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-base-content/40" />
                </Link>
              );
            })
          ) : (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-base-200">
                <MapPinned className="size-5 text-base-content/40" />
              </div>
              <p className="mt-3 text-sm font-medium">No map grids yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-base-content/55">
                Add a confirmed Google listing, grid coverage and keywords.
                Saving a configuration does not spend provider credits.
              </p>
            </div>
          )}
        </div>
      </div>

      {showSetup && (
        <LocalGridSetupModal
          projectId={projectId}
          onClose={() => setShowSetup(false)}
          onSaved={(configId) => {
            setShowSetup(false);
            void queryClient.invalidateQueries({
              queryKey: ["localGridConfigs", projectId],
            });
            void navigate({
              to: "/p/$projectId/local/grid/$configId",
              params: { projectId, configId },
            });
          }}
        />
      )}
    </div>
  );
}
