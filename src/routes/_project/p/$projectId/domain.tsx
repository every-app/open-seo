import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DomainOverviewPage } from "@/client/features/domain/DomainOverviewPage";
import {
  resolveSortOrder,
  toSortMode,
  toSortOrder,
} from "@/client/features/domain/utils";
import {
  DEFAULT_LOCATION_CODE,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";
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
    loc,
  } = Route.useSearch();

  const normalizedSort = toSortMode(sort) ?? "rank";
  const normalizedOrder = resolveSortOrder(
    normalizedSort,
    toSortOrder(order ?? null),
  );
  const normalizedLocationCode =
    loc != null && isSupportedLocationCode(loc) ? loc : DEFAULT_LOCATION_CODE;

  return (
    <DomainOverviewPage
      projectId={projectId}
      onShowRecentSearches={() => {
        void navigate({
          search: (prev) => ({
            ...prev,
            domain: undefined,
            subdomains: undefined,
            sort: undefined,
            order: undefined,
            tab: undefined,
            search: undefined,
            loc: undefined,
          }),
          replace: true,
        });
      }}
      navigate={navigate}
      searchState={{
        domain,
        subdomains,
        sort: normalizedSort,
        order: normalizedOrder,
        tab,
        search,
        locationCode: normalizedLocationCode,
      }}
    />
  );
}
