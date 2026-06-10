import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BrandLookupPage } from "@/client/features/ai-search/BrandLookupPage";
import { brandLookupSearchSchema } from "@/types/schemas/ai-search";

export const Route = createFileRoute("/_project/p/$projectId/brand-lookup")({
  validateSearch: brandLookupSearchSchema,
  component: BrandLookupRoute,
});

function BrandLookupRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  // `c` is already an opaque competitor string array via the schema transform.
  const { q = "", c = [] } = Route.useSearch();

  return (
    <BrandLookupPage
      projectId={projectId}
      initialQuery={q}
      initialCompetitors={c}
      onSearchChange={(nextQuery, nextCompetitors) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            q: nextQuery.trim() || undefined,
            // One serialization site: comma-join the competitor list.
            c:
              nextCompetitors.length > 0
                ? nextCompetitors.join(",")
                : undefined,
          }),
          replace: true,
        });
      }}
    />
  );
}
