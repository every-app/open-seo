import type {
  BacklinksStatus,
  BacklinksTab,
  BacklinksTargetScope,
} from "@/types/schemas/backlinks";
import type {
  getBacklinksOverview,
  getBacklinksReferringDomains,
  getBacklinksTopPages,
} from "@/serverFunctions/backlinks";
import type { getBacklinksAccessSetupStatus } from "@/serverFunctions/backlinksAccess";

export type BacklinksOverviewData = Awaited<
  ReturnType<typeof getBacklinksOverview>
>;
export type BacklinksAccessStatusData = Awaited<
  ReturnType<typeof getBacklinksAccessSetupStatus>
>;
export type BacklinksReferringDomainsData = Awaited<
  ReturnType<typeof getBacklinksReferringDomains>
>;
export type BacklinksTopPagesData = Awaited<
  ReturnType<typeof getBacklinksTopPages>
>;

export type BacklinksSearchState = {
  target: string;
  scope: BacklinksTargetScope;
  subdomains: boolean;
  indirect: boolean;
  excludeInternal: boolean;
  status: BacklinksStatus;
  tab: BacklinksTab;
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
