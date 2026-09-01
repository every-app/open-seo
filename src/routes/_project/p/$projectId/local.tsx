import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { MapPinned } from "lucide-react";

export const Route = createFileRoute("/_project/p/$projectId/local")({
  component: LocalSeoLayout,
});

function LocalSeoLayout() {
  const { projectId } = Route.useParams();

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPinned className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Local SEO</h1>
            <p className="text-sm text-base-content/70">
              Measure Google Maps visibility across the areas your business
              serves.
            </p>
          </div>
        </div>

        <div role="tablist" className="tabs tabs-border">
          <Link
            role="tab"
            className="tab"
            activeProps={{ className: "tab tab-active" }}
            to="/p/$projectId/local/grid"
            params={{ projectId }}
          >
            Map Grid
          </Link>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
