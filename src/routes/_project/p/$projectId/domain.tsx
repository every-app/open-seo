import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DomainOverviewPage } from "@/client/features/domain/DomainOverviewPage";
import {
  resolveSortOrder,
  toSortMode,
  toSortOrder,
} from "@/client/features/domain/utils";
import { domainSearchSchema } from "@/types/schemas/domain";

export const Route = createFileRoute("/_project/p/$projectId/domain")({
  validateSearch: domainSearchSchema,
  component: DomainOverviewRoute,
});

function DomainOverviewRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const {
    domain = "",
    subdomains = true,
    sort = "rank",
    order,
    tab = "keywords",
    search = "",
  } = Route.useSearch();

  const normalizedSort = toSortMode(sort) ?? "rank";
  const normalizedOrder = resolveSortOrder(
    normalizedSort,
    toSortOrder(order ?? null),
  );

  return (
    <DomainOverviewPage
      projectId={projectId}
      navigate={navigate}
      searchState={{
        domain,
        subdomains,
        sort: normalizedSort,
        order: normalizedOrder,
        tab,
        search,
      }}
    />
  );
}
