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

function mockTarget(
  overrides: Partial<ReturnType<typeof normalizeBacklinksTarget>> = {},
) {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
    includeSubdomains: false,
    path: "",
    ...overrides,
  });
}

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
});

it("profiles only the summary and history for the overview and reuses cache on repeat", async () => {
  mockTarget();
  backlinksSummaryMock.mockResolvedValue({ backlinks: 1200 });
  backlinksHistoryMock.mockResolvedValue([{ date: "2026-02-01" }]);

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
  mockTarget();
  backlinksRowsMock.mockResolvedValue({
    items: [{ url_from: "https://source.example/post" }],
    totalCount: 450,
  });

  const result = await service.profileBacklinksPage(
    {
      ...pageInputDefaults,
      target: "example.com",
      page: 2,
      sortField: "rank",
      filters: { include: "blog" },
    },
    billingCustomer,
    { hideSpam: false },
  );

  // The user's filters reach the paid call; their translation is owned by
  // backlinksApiFilters.test.ts.
  expect(backlinksRowsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      target: "example.com",
      limit: 100,
      offset: 100,
      orderBy: ["rank,desc"],
      hideSpam: false,
      filters: [["url_from", "ilike", "%blog%"]],
    }),
  );
  expect(result.rows).toHaveLength(1);
  expect(result.totalCount).toBe(450);
  expect(result.hasMore).toBe(true);
  expect(result.page).toBe(2);
});

it("does not fall back to target spam score for referring domains", async () => {
  mockTarget();
  referringDomainsMock.mockResolvedValue({
    items: [
      {
        domain: "source.example",
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

it("keeps page cache entries isolated per page, organization, and scope", async () => {
  mockTarget();
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

  // Same hostname, subdomains included: a different result set, not a cache hit.
  mockTarget({ scope: "subdomains", includeSubdomains: true });
  await service.profileBacklinksPage(
    { ...input, scope: "subdomains" },
    billingCustomer,
  );
  expect(backlinksRowsMock).toHaveBeenCalledTimes(4);
});

function parseCachedValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

it("builds subfolder overview totals from two filtered backlink counts", async () => {
  mockTarget({
    displayTarget: "example.com/blog",
    scope: "subfolder",
    path: "/blog",
  });
  backlinksRowsMock
    .mockResolvedValueOnce({ items: [], totalCount: 2500 })
    .mockResolvedValueOnce({ items: [], totalCount: 180 });

  const { overview } = await service.profileOverview(
    { target: "example.com/blog", scope: "subfolder" },
    billingCustomer,
  );

  expect(overview.summary.backlinks).toBe(2500);
  expect(overview.summary.referringDomains).toBe(180);
  expect(overview.summary.rank).toBeNull();
  expect(overview.trends).toEqual([]);
  expect(backlinksSummaryMock).not.toHaveBeenCalled();
  expect(backlinksHistoryMock).not.toHaveBeenCalled();
  expect(backlinksRowsMock).toHaveBeenCalledTimes(2);
  expect(backlinksRowsMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      mode: "as_is",
      limit: 1,
      hideSpam: false,
    }),
  );
  expect(backlinksRowsMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      mode: "one_per_domain",
      limit: 1,
      hideSpam: false,
    }),
  );
});

it("shows the provider's last_seen timestamp in backlink results", async () => {
  mockTarget();
  backlinksRowsMock.mockResolvedValue({
    items: [{ last_seen: "2026-10-06 10:00:00 +00:00" }],
    totalCount: 1,
  });
  const result = await service.profileBacklinksPage(
    { ...pageInputDefaults, target: "example.com", sortField: "rank" },
    billingCustomer,
    { hideSpam: false },
  );
  expect(result.rows[0]?.lastSeen).toBe("2026-10-06 10:00:00 +00:00");
});
