export function getFixtureOverview(domain: string) {
  return {
    domain,
    organicTraffic: 373,
    organicKeywords: 307,
    backlinks: null,
    referringDomains: null,
    hasData: true,
    fetchedAt: "2026-05-19T00:00:00.000Z",
  };
}

export function getFixturePagesPage(data: {
  domain: string;
  page: number;
  pageSize: number;
}) {
  const rows = [
    ["/section-a/page-001", 179, 34],
    ["/section-a/page-002", 63, 9],
    ["/section-b/page-003", 23, 25],
    ["/section-b/page-004", 19, 16],
    ["/section-b/page-005", 17, 12],
    ["/section-c/page-006", 8, 7],
    ["/section-c/page-007", 8, 11],
    ["/guides/topic-008", 3, 10],
    ["/guides/topic-009", 3, 11],
    ["/guides/topic-010", 3, 7],
    ["/guides/topic-011", 3, 6],
    ["/guides/topic-012", 2, 5],
  ];
  const pages = rows.map(([path, traffic, keywords]) => ({
    page: `https://${data.domain}${path}`,
    relativePath: String(path),
    organicTraffic: Number(traffic),
    keywords: Number(keywords),
  }));

  return {
    domain: data.domain,
    page: data.page,
    pageSize: data.pageSize,
    totalCount: 66,
    hasMore: data.page * data.pageSize < 66,
    pages,
    fetchedAt: "2026-05-19T00:00:00.000Z",
  };
}

export function getFixtureKeywordsPage(data: {
  domain: string;
  page: number;
  pageSize: number;
}) {
  const rows = [
    ["primary sample query", 1, 4_400, 86, 0.61, 18],
    ["secondary sample query", 2, 3_600, 74, 0.82, 24],
    ["tertiary sample query", 1, 1_900, 51, 0.44, 21],
    ["sample comparison term", 3, 1_600, 39, 0.52, 28],
    ["sample evaluation term", 4, 1_300, 31, 0.49, 25],
    ["sample reference term", 5, 1_100, 24, 0.37, 19],
  ];
  const keywords = rows.map(
    ([keyword, position, searchVolume, traffic, cpc, keywordDifficulty]) => ({
      keyword: String(keyword),
      position: Number(position),
      searchVolume: Number(searchVolume),
      traffic: Number(traffic),
      cpc: Number(cpc),
      url: `https://${data.domain}/section-a/page-001`,
      relativeUrl: "/section-a/page-001",
      keywordDifficulty: Number(keywordDifficulty),
    }),
  );

  return {
    domain: data.domain,
    page: data.page,
    pageSize: data.pageSize,
    totalCount: 307,
    hasMore: data.page * data.pageSize < 307,
    keywords,
    fetchedAt: "2026-05-19T00:00:00.000Z",
  };
}
