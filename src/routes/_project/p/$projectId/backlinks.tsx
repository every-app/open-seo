import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BacklinksPage } from "@/client/features/backlinks/BacklinksPage";
import { inferBacklinksSearchScopeFromTarget } from "@/client/features/backlinks/backlinksSearchScope";
import { backlinksSearchSchema } from "@/types/schemas/backlinks";

export const Route = createFileRoute("/_project/p/$projectId/backlinks")({
  validateSearch: backlinksSearchSchema,
  component: BacklinksRoute,
});

function BacklinksRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { target = "", scope: rawScope, tab = "backlinks" } = Route.useSearch();
  const scope = rawScope ?? inferBacklinksSearchScopeFromTarget(target);

  return (
    <BacklinksPage
      projectId={projectId}
      navigate={navigate}
      searchState={{
        target,
        scope,
        tab,
      }}
    />
  );
}
