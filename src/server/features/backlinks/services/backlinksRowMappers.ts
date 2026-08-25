import type {
  BacklinksItem,
  DomainPageSummaryItem,
  ReferringDomainItem,
} from "@/server/lib/dataforseo";

export function normalizeHistoryDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

export function mapBacklinksRows(rows: BacklinksItem[]) {
  return rows.map((item) => ({
    domainFrom: item.domain_from ?? null,
    urlFrom: item.url_from ?? null,
    urlTo: item.url_to ?? null,
    anchor: item.anchor ?? null,
    itemType: item.item_type ?? null,
    isDofollow: item.dofollow ?? null,
    relAttributes: item.rel_attributes ?? item.attributes ?? [],
    rank: item.rank ?? null,
    domainFromRank: item.domain_from_rank ?? null,
    pageFromRank: item.page_from_rank ?? null,
    spamScore: item.backlink_spam_score ?? item.backlinks_spam_score ?? null,
    firstSeen: item.first_seen ?? null,
    lastSeen: item.lost_date ?? item.last_visited ?? null,
    isLost: item.is_lost ?? Boolean(item.lost_date),
    isBroken: item.is_broken ?? false,
    linksCount: item.links_count ?? null,
  }));
}

export function mapReferringDomainsRows(rows: ReferringDomainItem[]) {
  return rows.map((item) => ({
    domain: item.domain ?? null,
    backlinks: item.backlinks ?? null,
    referringPages: item.referring_pages ?? null,
    rank: item.rank ?? null,
    spamScore: item.backlinks_spam_score ?? null,
    firstSeen: item.first_seen ?? null,
    brokenBacklinks: item.broken_backlinks ?? null,
    brokenPages: item.broken_pages ?? null,
  }));
}

export function mapTopPagesRows(rows: DomainPageSummaryItem[]) {
  return rows.map((item) => ({
    page: item.page ?? item.url ?? null,
    backlinks: item.backlinks ?? null,
    referringDomains: item.referring_domains ?? null,
    rank: item.rank ?? null,
    brokenBacklinks: item.broken_backlinks ?? null,
  }));
}

export function buildPageResult<TRow>(
  input: { page: number; pageSize: number },
  offset: number,
  data: { rows: TRow[]; totalCount: number | null },
) {
  const hasMore =
    data.totalCount != null
      ? offset + data.rows.length < data.totalCount
      : data.rows.length === input.pageSize;

  return {
    rows: data.rows,
    totalCount: data.totalCount,
    hasMore,
    page: input.page,
    pageSize: input.pageSize,
    fetchedAt: new Date().toISOString(),
  };
}
