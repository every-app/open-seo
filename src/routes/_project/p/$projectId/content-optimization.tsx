import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
import { ContentOptimizationPage } from "@/client/features/content-optimization/ContentOptimizationPage";

const searchSchema = z.object({
  jobId: z.string().optional(),
});

export const Route = createFileRoute(
  "/_project/p/$projectId/content-optimization",
)({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ jobId: undefined })],
  },
  component: ContentOptimizationRoute,
});

function ContentOptimizationRoute() {
  const { projectId } = Route.useParams();
  const { jobId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ContentOptimizationPage
      projectId={projectId}
      jobId={jobId ?? null}
      onOpenScan={(nextJobId) => {
        void navigate({
          search: () => (nextJobId === null ? {} : { jobId: nextJobId }),
          replace: false,
        });
      }}
    />
  );
}
