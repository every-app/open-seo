import {
  createFileRoute,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import { DomainOverviewPage } from "@/client/features/domain/DomainOverviewPage";
import {
  DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  domainSearchSchema,
} from "@/types/schemas/domain";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { getDomainRouteState } from "@/client/features/domain/domainRouteState";

const DEFAULT_DOMAIN_SEARCH = {
  domain: "",
  subdomains: true,
  sort: "traffic",
  order: undefined,
  tab: "keywords",
  loc: DEFAULT_LOCATION_CODE,
  page: 1,
  size: DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE,
  include: "",
  exclude: "",
  minTraffic: undefined,
  maxTraffic: undefined,
  minVol: undefined,
  maxVol: undefined,
  minCpc: undefined,
  maxCpc: undefined,
  minKd: undefined,
  maxKd: undefined,
  minRank: undefined,
  maxRank: undefined,
  pInclude: "",
  pExclude: "",
  pMinTraffic: undefined,
  pMaxTraffic: undefined,
  pMinVol: undefined,
  pMaxVol: undefined,
} as const;

export const Route = createFileRoute("/_project/p/$projectId/domain")({
  validateSearch: domainSearchSchema,
  search: {
    middlewares: [stripSearchParams(DEFAULT_DOMAIN_SEARCH)],
  },
  component: DomainOverviewRoute,
});

function DomainOverviewRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const routeState = getDomainRouteState(search);

  return (
    <DomainOverviewPage
      projectId={projectId}
      onShowRecentSearches={() => {
        void navigate({
          search: () => ({}),
          replace: true,
        });
      }}
      navigate={navigate}
      routeState={routeState}
    />
  );
}
