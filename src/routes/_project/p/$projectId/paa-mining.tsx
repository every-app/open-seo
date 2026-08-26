import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
import { PaaMiningPage } from "@/client/features/paa-mining/PaaMiningPage";

const searchSchema = z.object({
  scanId: z.string().optional(),
});

export const Route = createFileRoute("/_project/p/$projectId/paa-mining")({
  validateSearch: searchSchema,
  search: {
    middlewares: [stripSearchParams({ scanId: undefined })],
  },
  component: PaaMiningRoute,
});

function PaaMiningRoute() {
  const { projectId } = Route.useParams();
  const { scanId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <PaaMiningPage
      projectId={projectId}
      scanId={scanId ?? null}
      onOpenScan={(nextScanId) => {
        void navigate({
          search: () => (nextScanId === null ? {} : { scanId: nextScanId }),
          replace: false,
        });
      }}
    />
  );
}
