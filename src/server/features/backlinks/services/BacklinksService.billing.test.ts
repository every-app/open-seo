import { beforeEach, expect, it, vi } from "vitest";
import type { SEODataRequest } from "@/server/lib/seo-data";
import {
  backlinksHistoryItemSchema,
  backlinksSummaryItemSchema,
  backlinksItemSchema,
  referringDomainItemSchema,
  domainPageSummaryItemSchema,
} from "@/server/lib/dataforseo/backlinks-schemas";

const routeMock = vi.hoisted(() =>
  vi.fn<(request: SEODataRequest, schema?: unknown) => Promise<unknown>>(),
);

vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: vi.fn(() => ({ route: routeMock })),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  normalizeBacklinksTarget: vi.fn(),
  backlinksHistoryItemSchema,
  backlinksSummaryItemSchema,
  backlinksItemSchema,
  referringDomainItemSchema,
  domainPageSummaryItemSchema,
}));

import { normalizeBacklinksTarget } from "@/server/lib/dataforseo";
import { createBacklinksService } from "./BacklinksService";

const BACKLINK_CALLS = [
  "summary",
  "history",
  "rows",
  "referring_domains",
  "domain_pages",
] as const;

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

const service = createBacklinksService();

beforeEach(() => {
  vi.clearAllMocks();
});

function routerResponse(data: unknown, fromCache = false) {
  return { dataType: "backlinks", provider: "dataforseo", data, fromCache, durationMs: 1 };
}

function routedCalls() {
  return routeMock.mock.calls.map(([request]) => request);
}

function routeCallsFor(backlinkCall: (typeof BACKLINK_CALLS)[number]) {
  return routedCalls().filter(
    (request) => request.constraints?.backlinkCall === backlinkCall,
  );
}

function mockTarget(apiTarget: string, scope: "domain" | "page") {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget,
    displayTarget: apiTarget,
    scope,
  });
}

const SUMMARY_DATA = {
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
};

const HISTORY_DATA = [
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
];

it("routes the overview through summary and history calls on a router miss", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockImplementation(async (request) =>
    request.constraints?.backlinkCall === "history"
      ? routerResponse(HISTORY_DATA)
      : routerResponse(SUMMARY_DATA),
  );

  const result = await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
  );

  expect(result.overview.summary.backlinks).toBe(1200);
  expect(result.overview.summary.referringPages).toBe(900);
  expect(result.overview.trends).toHaveLength(1);
  expect(result.overview.newLostTrends).toHaveLength(1);
  expect(routeCallsFor("summary")).toHaveLength(1);
  expect(routeCallsFor("history")).toHaveLength(1);
  expect(routeCallsFor("rows")).toHaveLength(0);
  expect(routeCallsFor("referring_domains")).toHaveLength(0);
  expect(routeCallsFor("domain_pages")).toHaveLength(0);

  for (const request of routedCalls()) {
    expect(request.dataType).toBe("backlinks");
    expect(request.domain).toBe("example.com");
    expect(request.billingCustomer).toEqual(billingCustomer);
  }

  // History carries the date range; summary does not.
  const historyRequest = routeCallsFor("history")[0];
  expect(historyRequest?.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(historyRequest?.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("skips the history call entirely when the overview scope is page", async () => {
  mockTarget("https://example.com/foo", "page");
  routeMock.mockResolvedValue(routerResponse({ rank: 10, backlinks: 5 }));

  const result = await service.profileOverview(
    { target: "https://example.com/foo", scope: "page" },
    billingCustomer,
  );

  expect(routeCallsFor("summary")).toHaveLength(1);
  expect(routeCallsFor("history")).toHaveLength(0);
  expect(result.overview.trends).toHaveLength(0);
  expect(result.overview.summary.backlinks).toBe(5);
});

it("passes creditFeature through to the router for per-call billing attribution", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockImplementation(async (request) =>
    routerResponse(
      request.constraints?.backlinkCall === "history" ? [] : { rank: 1 },
    ),
  );

  await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
    "onboarding",
  );

  for (const request of routedCalls()) {
    expect(request.creditFeature).toBe("onboarding");
    expect(request.billingCustomer).toEqual(billingCustomer);
  }
});

it("spends nothing on router cache hits — the service returns without a provider call", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockImplementation(async (request) =>
    routerResponse(
      request.constraints?.backlinkCall === "history" ? [] : { backlinks: 7 },
      true,
    ),
  );

  const result = await service.profileOverview(
    { target: "example.com" },
    billingCustomer,
  );

  expect(result.overview.summary.backlinks).toBe(7);
  expect(routeMock).toHaveBeenCalledTimes(2);
  for (const call of routeMock.mock.calls) {
    expect(call[1]).toBeDefined();
  }
});

it("profiles backlink rows per page with offset and total count", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockResolvedValue(
    routerResponse({
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
    }),
  );

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

  const request = routeMock.mock.calls[0]?.[0];
  expect(request).toMatchObject({
    dataType: "backlinks",
    domain: "example.com",
    billingCustomer: { organizationId: "org_123" },
    constraints: {
      backlinkCall: "rows",
      limit: 100,
      offset: 100,
      orderBy: ["rank,desc"],
      mode: "as_is",
      hideSpam: false,
    },
  });
  expect(request?.constraints).not.toHaveProperty("spamThreshold");
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]?.relAttributes).toEqual(["noopener"]);
  expect(result.totalCount).toBe(450);
  expect(result.hasMore).toBe(true);
  expect(result.page).toBe(2);
});

it("translates filters into DataForSEO conditions for backlink rows", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockResolvedValue(routerResponse({ items: [], totalCount: 0 }));

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

  const request = routeMock.mock.calls[0]?.[0];
  expect(request).toMatchObject({
    constraints: {
      backlinkCall: "rows",
      filters: [
        ["url_from", "ilike", "%blog%"],
        "and",
        ["domain_from_rank", ">=", 30],
        "and",
        ["dofollow", "=", true],
        "and",
        ["is_lost", "=", false],
      ],
    },
  });
});

it("forwards the full spam filter pair when the caller provides it", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockResolvedValue(routerResponse({ items: [], totalCount: 0 }));

  await service.profileReferringDomainsPage(
    {
      ...pageInputDefaults,
      target: "example.com",
      sortField: "backlinks",
    },
    billingCustomer,
    { hideSpam: true, spamThreshold: 25 },
  );

  const request = routeMock.mock.calls[0]?.[0];
  expect(request).toMatchObject({
    constraints: {
      backlinkCall: "referring_domains",
      hideSpam: true,
      spamThreshold: 25,
    },
  });
});

it("profiles referring domains and top pages pages separately", async () => {
  mockTarget("https://example.com/foo", "page");
  routeMock.mockImplementation(async (request) =>
    request.constraints?.backlinkCall === "referring_domains"
      ? routerResponse({
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
        })
      : routerResponse({
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
        }),
  );

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

  expect(routeCallsFor("referring_domains")).toHaveLength(1);
  expect(routeCallsFor("domain_pages")).toHaveLength(1);
  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBe(2);
  expect(domains.hasMore).toBe(false);
  expect(pages.rows).toHaveLength(1);
  expect(pages.rows[0]?.page).toBe("https://example.com/foo");
});

it("does not fall back to target spam score for referring domains", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockResolvedValue(
    routerResponse({
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
    }),
  );

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

it("hands each distinct request shape to the router without a service-side cache", async () => {
  mockTarget("example.com", "domain");
  routeMock.mockResolvedValue(routerResponse({ items: [], totalCount: 0 }));

  const input = {
    ...pageInputDefaults,
    target: "example.com",
    sortField: "rank",
  } as const;

  await service.profileBacklinksPage(input, billingCustomer);
  await service.profileBacklinksPage({ ...input, page: 2 }, billingCustomer);
  await service.profileBacklinksPage(input, {
    organizationId: "org_456",
    userId: "user_456",
    userEmail: "other@example.com",
  });

  // Keyed by {org, constraints}: page 2 differs by offset, the third call by
  // organizationId. The router owns caching — the service never dedupes.
  expect(routeMock).toHaveBeenCalledTimes(3);
  const [first, second, third] = routeMock.mock.calls.map(
    ([request]) => request,
  );
  expect(first.constraints?.offset).toBe(0);
  expect(second.constraints?.offset).toBe(100);
  expect(first.billingCustomer.organizationId).toBe("org_123");
  expect(third.billingCustomer.organizationId).toBe("org_456");
});