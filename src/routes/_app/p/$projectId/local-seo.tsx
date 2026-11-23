import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { pageHead } from "@/client/lib/pageHead";
import leafletCss from "leaflet/dist/leaflet.css?url";
import localRankMapCss from "@/client/features/local-seo/local-rank-map.css?url";
import { distanceUnitQueryOptions } from "@/client/features/settings/distanceUnitQueries";
import { queryClient } from "@/client/tanstack-db/queryClient";

export const Route = createFileRoute("/_app/p/$projectId/local-seo")({
  head: () => ({
    ...pageHead("Local SEO"),
    links: [
      { rel: "stylesheet", href: leafletCss },
      { rel: "stylesheet", href: localRankMapCss },
    ],
  }),
  // Distances show in the user's unit (see useDistanceUnit).
  loader: () => queryClient.ensureQueryData(distanceUnitQueryOptions()),
  component: LocalSeoLayout,
});
function LocalSeoLayout() {
  const { projectId, trackerId } = useParams({ strict: false });
  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader
          title="Local SEO"
          description="Track Google Maps rankings across your local area"
          backLink={
            projectId && trackerId ? (
              <BackLink to="/p/$projectId/local-seo" params={{ projectId }}>
                Tracked businesses
              </BackLink>
            ) : undefined
          }
        />
        <Outlet />
      </div>
    </div>
  );
}
