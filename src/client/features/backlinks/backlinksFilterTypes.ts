export type BacklinksTabFilterValues = {
  include: string;
  exclude: string;
  minDomainRank: string;
  maxDomainRank: string;
  minLinkAuthority: string;
  maxLinkAuthority: string;
  minSpamScore: string;
  maxSpamScore: string;
  linkType: string;
  hideLost: string;
  hideBroken: string;
};

export type ReferringDomainsFilterValues = {
  include: string;
  exclude: string;
  minBacklinks: string;
  maxBacklinks: string;
  minRank: string;
  maxRank: string;
};

export type TopPagesFilterValues = {
  include: string;
  exclude: string;
  minBacklinks: string;
  maxBacklinks: string;
  minReferringDomains: string;
  maxReferringDomains: string;
  minRank: string;
  maxRank: string;
};

export const EMPTY_BACKLINKS_FILTERS: BacklinksTabFilterValues = {
  include: "",
  exclude: "",
  minDomainRank: "",
  maxDomainRank: "",
  minLinkAuthority: "",
  maxLinkAuthority: "",
  minSpamScore: "",
  maxSpamScore: "",
  linkType: "",
  hideLost: "",
  hideBroken: "",
};

export const EMPTY_REFERRING_DOMAINS_FILTERS: ReferringDomainsFilterValues = {
  include: "",
  exclude: "",
  minBacklinks: "",
  maxBacklinks: "",
  minRank: "",
  maxRank: "",
};

export const EMPTY_TOP_PAGES_FILTERS: TopPagesFilterValues = {
  include: "",
  exclude: "",
  minBacklinks: "",
  maxBacklinks: "",
  minReferringDomains: "",
  maxReferringDomains: "",
  minRank: "",
  maxRank: "",
};
