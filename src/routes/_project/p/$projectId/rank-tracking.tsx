import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking")({
  component: RankTrackingLayout,
});

function RankTrackingLayout() {
  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Rank Tracking</h1>
          <p className="text-sm text-base-content/70">
            Track keyword positions across domains
          </p>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
