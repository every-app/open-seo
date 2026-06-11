import type {
  BacklinksSortOrder,
  BacklinksTab,
  BacklinksTargetScope,
} from "@/types/schemas/backlinks";
import type {
  getBacklinksOverview,
  getBacklinksReferringDomains,
  getBacklinksRows,
  getBacklinksTopPages,
} from "@/serverFunctions/backlinks";

export type BacklinksOverviewData = Awaited<
  ReturnType<typeof getBacklinksOverview>
>;
export type BacklinksRowsPageData = Awaited<
  ReturnType<typeof getBacklinksRows>
>;
export type BacklinksReferringDomainsData = Awaited<
  ReturnType<typeof getBacklinksReferringDomains>
>;
export type BacklinksTopPagesData = Awaited<
  ReturnType<typeof getBacklinksTopPages>
>;

export type BacklinksRow = BacklinksRowsPageData["rows"][number];
export type ReferringDomainRow = BacklinksReferringDomainsData["rows"][number];
export type TopPageRow = BacklinksTopPagesData["rows"][number];

export type BacklinksSearchState = {
  target: string;
  scope: BacklinksTargetScope;
  tab: BacklinksTab;
  page: number;
  pageSize: number;
  /** Sort column id for the active tab; falls back to the tab's default. */
  sort?: string;
  order?: BacklinksSortOrder;
  /** Backlinks tab only: "all" lists every link; default is one per domain. */
  view?: "all";
};

export type BacklinksNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

export type BacklinksPageProps = {
  projectId: string;
  searchState: BacklinksSearchState;
  navigate: BacklinksNavigate;
};

/** Page rows for all three tabs; tabs that haven't loaded yet are empty. */
export type BacklinksTabRows = {
  backlinks: BacklinksRow[];
  referringDomains: ReferringDomainRow[];
  topPages: TopPageRow[];
};
