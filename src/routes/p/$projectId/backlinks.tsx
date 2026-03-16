import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BacklinksPage } from "@/client/features/backlinks/BacklinksPage";
import { inferBacklinksSearchScopeFromTarget } from "@/client/features/backlinks/backlinksSearchScope";
import { backlinksSearchSchema } from "@/types/schemas/backlinks";

export const Route = createFileRoute("/p/$projectId/backlinks")({
  validateSearch: backlinksSearchSchema,
  component: BacklinksRoute,
});

function BacklinksRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    target = "",
    scope: rawScope,
    subdomains = true,
    indirect = true,
    excludeInternal = true,
    status = "live",
    tab = "backlinks",
  } = Route.useSearch();
  const scope = rawScope ?? inferBacklinksSearchScopeFromTarget(target);

  return (
    <BacklinksPage
      projectId={projectId}
      navigate={navigate}
      searchState={{
        target,
        scope,
        subdomains,
        indirect,
        excludeInternal,
        status,
        tab,
      }}
    />
  );
}
