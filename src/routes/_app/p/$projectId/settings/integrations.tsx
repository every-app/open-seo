import { queryClient } from "@/client/tanstack-db/queryClient";
import { googleConnectionOptions } from "@/client/features/integrations/googleProviders";
import { createFileRoute } from "@tanstack/react-router";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { UmamiConnectionCard } from "@/client/features/integrations/UmamiConnectionCard";
import { CrawlerAccessSettings } from "@/client/features/settings/CrawlerAccessSettings";
import { IndexNowSettings } from "@/client/features/settings/IndexNowSettings";

export const Route = createFileRoute(
  "/_app/p/$projectId/settings/integrations",
)({
  loader: ({ params }) => {
    // Start both database checks on link intent without holding up navigation.
    void queryClient.prefetchQuery(
      googleConnectionOptions("gsc", params.projectId),
    );
    void queryClient.prefetchQuery(
      googleConnectionOptions("ga4", params.projectId),
    );
  },
  component: ProjectIntegrationsRoute,
});

function ProjectIntegrationsRoute() {
  const { projectId } = Route.useParams();

  return (
    <div className="space-y-8">
      {/* The ids are the targets old #search-console / #google-analytics deep
          links are redirected to from the settings index. Each card's title
          names its integration, so the sections carry no heading. */}
      <section id="search-console" className="scroll-mt-6">
        <GoogleConnectionCard provider="gsc" projectId={projectId} />
      </section>

      <section id="google-analytics" className="scroll-mt-6">
        <GoogleConnectionCard provider="ga4" projectId={projectId} />
      </section>

      <section id="umami" className="scroll-mt-6">
        <UmamiConnectionCard projectId={projectId} />
      </section>

      <IndexNowSettings projectId={projectId} />

      <CrawlerAccessSettings projectId={projectId} />
    </div>
  );
}
