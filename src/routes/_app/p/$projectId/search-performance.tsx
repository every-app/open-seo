import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { SearchPerformancePage } from "@/client/features/search-performance/SearchPerformancePage";
import { googleConnectionOptions } from "@/client/features/integrations/googleProviders";
import {
  SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  searchPerformanceSearchSchema,
} from "@/types/schemas/search-performance";
import { pageHead } from "@/client/lib/pageHead";
import { queryClient } from "@/client/tanstack-db/queryClient";

export const Route = createFileRoute("/_app/p/$projectId/search-performance")({
  head: () => pageHead("GSC Insights"),
  validateSearch: searchPerformanceSearchSchema,
  loader: ({ params }) => {
    // Without Search Console, the report is replaced by the connect card,
    // which needs this check: start it alongside the report, not after it.
    void queryClient.prefetchQuery(
      googleConnectionOptions("gsc", params.projectId),
    );
  },
  search: {
    middlewares: [
      stripSearchParams({
        tab: "striking",
        range: "last_28_days",
        page: 1,
        size: SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
      }),
    ],
  },
  component: SearchPerformanceRoute,
});

function SearchPerformanceRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  return (
    <SearchPerformancePage
      projectId={projectId}
      search={search}
      onSearchChange={(update) => {
        void navigate({
          search: (prev) => ({ ...prev, ...update }),
          replace: true,
        });
      }}
    />
  );
}
