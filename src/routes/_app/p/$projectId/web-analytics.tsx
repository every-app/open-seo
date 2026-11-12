import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { WebAnalyticsPage } from "@/client/features/web-analytics/WebAnalyticsPage";
import { webAnalyticsSearchSchema } from "@/types/schemas/web-analytics";

export const Route = createFileRoute("/_app/p/$projectId/web-analytics")({
  validateSearch: webAnalyticsSearchSchema,
  search: {
    middlewares: [stripSearchParams({ period: "30d" })],
  },
  component: WebAnalyticsRoute,
});

function WebAnalyticsRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  return (
    <WebAnalyticsPage
      projectId={projectId}
      period={search.period}
      onPeriodChange={(period) => {
        void navigate({
          search: (prev) => ({ ...prev, period }),
          replace: true,
        });
      }}
    />
  );
}
