import { createFileRoute } from "@tanstack/react-router";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";

export const Route = createFileRoute("/_project/p/$projectId/integrations")({
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  const { projectId } = Route.useParams();

  return (
    <div
      id="search-console"
      className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6"
    >
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-base-content/60">
          Connect your data sources.
        </p>
      </div>
      <SearchConsoleConnectionCard projectId={projectId} />
    </div>
  );
}
