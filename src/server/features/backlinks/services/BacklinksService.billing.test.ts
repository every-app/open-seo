import { beforeEach, expect, it, vi } from "vitest";

const backlinksSummaryMock = vi.fn();
const backlinksRowsMock = vi.fn();
const referringDomainsMock = vi.fn();
const domainPagesMock = vi.fn();
const backlinksHistoryMock = vi.fn();

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(
    async (prefix: string, params: Record<string, unknown>) =>
      `${prefix}:${JSON.stringify(params)}`,
  ),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  normalizeBacklinksTarget: vi.fn(),
  createDataforseoClient: vi.fn(() => ({
    backlinks: {
      summary: backlinksSummaryMock,
      rows: backlinksRowsMock,
      referringDomains: referringDomainsMock,
      domainPages: domainPagesMock,
      history: backlinksHistoryMock,
    },
  })),
}));

import { normalizeBacklinksTarget } from "@/server/lib/dataforseo";
import { createBacklinksService } from "./BacklinksService";

const billingCustomer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "team@example.com",
};

const pageInputDefaults = {
  projectId: "project_123",
  page: 1,
  pageSize: 100,
  sortOrder: "desc",
  filters: {},
  mode: "as_is",
} as const;

const cache = new Map<string, string>();
const service = createBacklinksService({
  async get(key) {
    const raw = cache.get(key);
    return raw ? parseCachedValue(raw) : null;
  },
  async set(key, data) {
    cache.set(key, JSON.stringify(data));
  },
});

beforeEach(() => {
  cache.clear();
  vi.clearAllMocks();
});

it("profiles only the summary and history for the overview and reuses cache on repeat", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksSummaryMock.mockResolvedValue({
    rank: 42,
    backlinks: 1200,
    referring_pages: 900,
    referring_domains: 320,
    broken_backlinks: 12,
    broken_pages: 3,
    backlinks_spam_score: 5,
    info: { target_spam_score: 4 },
    new_backlinks: 25,
    lost_backlinks: 10,
    new_referring_domains: 8,
    lost_referring_domains: 2,
  });
  backlinksHistoryMock.mockResolvedValue([
    {
      date: "2026-02-01",
      backlinks: 1100,
      referring_domains: 300,
      rank: 40,
      new_backlinks: 20,
      lost_backlinks: 5,
      new_referring_domains: 3,
      lost_referring_domains: 1,
    },
  ]);

  const first = await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
  );
  const second = await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
  );

  expect(first.overview.summary.backlinks).toBe(1200);
  expect(first.overview.trends).toHaveLength(1);
  expect(backlinksRowsMock).not.toHaveBeenCalled();
  expect(referringDomainsMock).not.toHaveBeenCalled();
  expect(domainPagesMock).not.toHaveBeenCalled();
  expect(backlinksSummaryMock).toHaveBeenCalledOnce();
  expect(backlinksHistoryMock).toHaveBeenCalledOnce();
  expect(second).toEqual(first);
});

it("profiles backlink rows per page with offset and total count", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksRowsMock.mockResolvedValue({
    items: [
      {
        domain_from: "source.example",
        url_from: "https://source.example/post",
        url_to: "https://example.com/",
        anchor: "Example",
        item_type: "content",
        dofollow: true,
        rank: 77,
        domain_from_rank: 65,
        page_from_rank: 54,
        backlink_spam_score: 3,
        first_seen: "2026-01-01",
        last_visited: "2026-03-01",
        lost_date: null,
        is_lost: false,
        is_broken: false,
        links_count: 1,
        rel_attributes: ["noopener"],
      },
    ],
    totalCount: 450,
  });

  const result = await service.profileBacklinksPage(
    {
      ...pageInputDefaults,
      target: "example.com",
      page: 2,
      sortField: "rank",
    },
    billingCustomer,
    { hideSpam: false },
  );

  expect(backlinksRowsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      target: "example.com",
      limit: 100,
      offset: 100,
      orderBy: ["rank,desc"],
      hideSpam: false,
    }),
  );
  expect(result.rows).toHaveLength(1);
  expect(result.totalCount).toBe(450);
  expect(result.hasMore).toBe(true);
  expect(result.page).toBe(2);
});

it("translates filters into DataForSEO conditions for backlink rows", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksRowsMock.mockResolvedValue({ items: [], totalCount: 0 });

  await service.profileBacklinksPage(
    {
      ...pageInputDefaults,
      target: "example.com",
      sortField: "rank",
      filters: {
        include: "blog",
        minDomainRank: 30,
        linkType: "dofollow",
        hideLost: true,
      },
    },
    billingCustomer,
    { hideSpam: false },
  );

  expect(backlinksRowsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      filters: [
        ["url_from", "ilike", "%blog%"],
        "and",
        ["domain_from_rank", ">=", 30],
        "and",
        ["dofollow", "=", true],
        "and",
        ["is_lost", "=", false],
      ],
    }),
  );
});

it("profiles referring domains and top pages pages separately", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "https://example.com/foo",
    displayTarget: "https://example.com/foo",
    scope: "page",
  });
  referringDomainsMock.mockResolvedValue({
    items: [
      {
        domain: "source.example",
        backlinks: 4,
        referring_pages: 2,
        rank: 65,
        first_seen: "2026-01-01",
        broken_backlinks: 0,
        broken_pages: 0,
        backlinks_spam_score: 2,
        target_spam_score: 4,
      },
    ],
    totalCount: 1,
  });
  domainPagesMock.mockResolvedValue({
    items: [
      {
        page: "https://example.com/foo",
        backlinks: 100,
        referring_domains: 20,
        rank: 50,
        broken_backlinks: 0,
      },
    ],
    totalCount: 1,
  });

  const domains = await service.profileReferringDomainsPage(
    {
      ...pageInputDefaults,
      target: "https://example.com/foo",
      sortField: "backlinks",
    },
    billingCustomer,
  );
  const pages = await service.profileTopPagesPage(
    {
      ...pageInputDefaults,
      target: "https://example.com/foo",
      sortField: "backlinks",
    },
    billingCustomer,
  );

  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBe(2);
  expect(domains.hasMore).toBe(false);
  expect(pages.rows).toHaveLength(1);
});

it("does not fall back to target spam score for referring domains", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  referringDomainsMock.mockResolvedValue({
    items: [
      {
        domain: "source.example",
        backlinks: 4,
        referring_pages: 2,
        rank: 65,
        first_seen: "2026-01-01",
        broken_backlinks: 0,
        broken_pages: 0,
        backlinks_spam_score: null,
        target_spam_score: 4,
      },
    ],
    totalCount: 1,
  });

  const domains = await service.profileReferringDomainsPage(
    {
      ...pageInputDefaults,
      target: "example.com",
      sortField: "backlinks",
    },
    billingCustomer,
  );

  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBeNull();
});

it("keeps page cache entries isolated per page and per organization", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  backlinksRowsMock.mockResolvedValue({ items: [], totalCount: 0 });

  const input = {
    ...pageInputDefaults,
    target: "example.com",
    sortField: "rank",
  } as const;

  await service.profileBacklinksPage(input, billingCustomer);
  await service.profileBacklinksPage(input, billingCustomer);
  expect(backlinksRowsMock).toHaveBeenCalledTimes(1);

  await service.profileBacklinksPage({ ...input, page: 2 }, billingCustomer);
  expect(backlinksRowsMock).toHaveBeenCalledTimes(2);

  await service.profileBacklinksPage(input, {
    organizationId: "org_456",
    userId: "user_456",
    userEmail: "other@example.com",
  });
  expect(backlinksRowsMock).toHaveBeenCalledTimes(3);
});

function parseCachedValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
