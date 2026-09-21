import { queryClient } from "@/client/tanstack-db/queryClient";
import {
  gscConnectionOptions,
  ga4ConnectionOptions,
} from "@/client/features/integrations/googleConnectionQueries";
import { createFileRoute } from "@tanstack/react-router";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import { GoogleAnalyticsConnectionCard } from "@/client/features/ga4/GoogleAnalyticsConnectionCard";
import { GoogleAdsConnectionCard } from "@/client/features/google-ads/GoogleAdsConnectionCard";

export const Route = createFileRoute(
  "/_project/p/$projectId/settings/integrations",
)({
  loader: ({ params }) => {
    // Start both database checks on link intent without holding up navigation.
    void queryClient.prefetchQuery(gscConnectionOptions(params.projectId));
    void queryClient.prefetchQuery(ga4ConnectionOptions(params.projectId));
  },
  component: ProjectIntegrationsRoute,
});

function ProjectIntegrationsRoute() {
  const { projectId } = Route.useParams();

  return (
    <div className="space-y-8">
      {/* The ids are the targets old #search-console / #google-analytics deep
          links are redirected to from the settings index. */}
      <section id="search-console" className="scroll-mt-6 space-y-3">
        <h2 className="text-sm font-medium text-base-content/50">
          Search Console
        </h2>
        <SearchConsoleConnectionCard projectId={projectId} />
      </section>

      <section id="google-analytics" className="scroll-mt-6 space-y-3">
        <GoogleAnalyticsConnectionCard
          projectId={projectId}
          heading={
            <h2 className="text-sm font-medium text-base-content/50">
              Analytics
            </h2>
          }
        />
      </section>

      <section id="google-ads" className="scroll-mt-6 space-y-3">
        <h2 className="text-sm font-medium text-base-content/50">
          Local Services Ads
        </h2>
        <GoogleAdsConnectionCard projectId={projectId} />
      </section>
    </div>
  );
}
