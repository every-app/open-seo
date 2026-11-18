import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LocalTrackerDetail } from "@/client/features/local-seo/LocalTrackerDetail";
import { localSeoSearchSchema } from "@/types/schemas/local-seo-search";

export const Route = createFileRoute("/_app/p/$projectId/local-seo/$trackerId")(
  { validateSearch: localSeoSearchSchema, component: LocalSeoDetailRoute },
);
function LocalSeoDetailRoute() {
  const { projectId, trackerId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <LocalTrackerDetail
      key={trackerId}
      projectId={projectId}
      trackerId={trackerId}
      search={search}
      onSearchChange={(next) =>
        void navigate({ from: Route.fullPath, search: next, replace: true })
      }
    />
  );
}
