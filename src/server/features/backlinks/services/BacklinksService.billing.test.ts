import { beforeEach, expect, it, vi } from "vitest";

const backlinksSummaryMock = vi.fn();
const backlinksRowsMock = vi.fn();
const referringDomainsMock = vi.fn();
const domainPagesMock = vi.fn();
const timeseriesSummaryMock = vi.fn();
const newLostTimeseriesMock = vi.fn();

vi.mock("@/server/lib/dataforseoBacklinks", () => ({
  normalizeBacklinksTarget: vi.fn(),
}));

vi.mock("@/server/lib/dataforseoClient", () => ({
  createDataforseoClient: vi.fn(() => ({
    backlinks: {
      summary: backlinksSummaryMock,
      rows: backlinksRowsMock,
      referringDomains: referringDomainsMock,
      domainPages: domainPagesMock,
      timeseriesSummary: timeseriesSummaryMock,
      newLostTimeseries: newLostTimeseriesMock,
    },
  })),
}));

import { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinks";
import { createBacklinksService } from "./BacklinksService";

const billingCustomer = {
  organizationId: "org_123",
  userEmail: "team@example.com",
};

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

it("profiles only the initial overview calls and reuses cache on repeat", async () => {
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
  backlinksRowsMock.mockResolvedValue([
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
  ]);
  timeseriesSummaryMock.mockResolvedValue([
    {
      date: "2026-02-01",
      backlinks: 1100,
      referring_domains: 300,
      rank: 40,
    },
  ]);
  newLostTimeseriesMock.mockResolvedValue([
    {
      date: "2026-02-01",
      new_backlinks: 20,
      lost_backlinks: 5,
      new_referring_domains: 3,
      lost_referring_domains: 1,
    },
  ]);

  const first = await service.profileOverview(
    {
      target: "example.com",
      includeSubdomains: true,
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      status: "live",
    },
    billingCustomer,
  );
  const second = await service.profileOverview(
    {
      target: "example.com",
      includeSubdomains: true,
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      status: "live",
    },
    billingCustomer,
  );

  expect(first.overview.referringDomains).toEqual([]);
  expect(first.overview.topPages).toEqual([]);
  expect(referringDomainsMock).not.toHaveBeenCalled();
  expect(domainPagesMock).not.toHaveBeenCalled();
  expect(backlinksSummaryMock).toHaveBeenCalledOnce();
  expect(second).toEqual(first);
});

it("profiles referring domains and top pages separately", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "https://example.com/foo",
    displayTarget: "https://example.com/foo",
    scope: "page",
  });
  referringDomainsMock.mockResolvedValue([
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
  ]);
  domainPagesMock.mockResolvedValue([
    {
      page: "https://example.com/foo",
      backlinks: 100,
      referring_domains: 20,
      rank: 50,
      broken_backlinks: 0,
    },
  ]);

  const domains = await service.profileReferringDomains(
    {
      target: "https://example.com/foo",
      includeSubdomains: true,
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      status: "live",
    },
    billingCustomer,
  );
  const pages = await service.profileTopPages(
    {
      target: "https://example.com/foo",
      includeSubdomains: true,
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      status: "live",
    },
    billingCustomer,
  );

  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBe(2);
  expect(pages.rows).toHaveLength(1);
});

it("does not fall back to target spam score for referring domains", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  referringDomainsMock.mockResolvedValue([
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
  ]);

  const domains = await service.profileReferringDomains(
    {
      target: "example.com",
      includeSubdomains: true,
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      status: "live",
    },
    billingCustomer,
  );

  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBeNull();
});

it("keeps cache entries isolated per organization", async () => {
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
  backlinksRowsMock.mockResolvedValue([]);
  timeseriesSummaryMock.mockResolvedValue([]);
  newLostTimeseriesMock.mockResolvedValue([]);

  const input = {
    target: "example.com",
    includeSubdomains: true,
    includeIndirectLinks: true,
    excludeInternalBacklinks: true,
    status: "live" as const,
  };

  await service.profileOverview(input, billingCustomer);
  await service.profileOverview(input, {
    organizationId: "org_456",
    userEmail: "other@example.com",
  });

  expect(backlinksSummaryMock).toHaveBeenCalledTimes(2);
});

function parseCachedValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
