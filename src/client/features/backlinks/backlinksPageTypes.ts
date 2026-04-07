import type {
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

export type BacklinksRow = BacklinksOverviewData["backlinks"][number];

export type GroupedBacklinkDomain = {
  domain: string;
  domainAuthority: number | null;
  spamScore: number | null;
  firstSeen: string | null;
  backlinkCount: number;
  targetCount: number;
  lostCount: number;
  brokenCount: number;
  nofollowCount: number;
  /** Child rows for TanStack Table's getSubRows — each wraps a BacklinksRow */
  subRows: GroupedBacklinkDomain[];
  /** Set on child rows only — the original backlink data */
  _backlink?: BacklinksRow;
};
