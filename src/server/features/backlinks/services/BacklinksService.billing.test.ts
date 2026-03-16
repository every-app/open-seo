import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/lib/dataforseoBacklinks", () => ({
  normalizeBacklinksTarget: vi.fn(),
  fetchBacklinksSummaryRaw: vi.fn(),
  fetchBacklinksRowsRaw: vi.fn(),
  fetchReferringDomainsRaw: vi.fn(),
  fetchDomainPagesSummaryRaw: vi.fn(),
  fetchTimeseriesSummaryRaw: vi.fn(),
  fetchNewLostTimeseriesRaw: vi.fn(),
}));

import { createBacklinksService } from "./BacklinksService";
import {
  fetchBacklinksRowsRaw,
  fetchBacklinksSummaryRaw,
  fetchDomainPagesSummaryRaw,
  fetchNewLostTimeseriesRaw,
  fetchReferringDomainsRaw,
  fetchTimeseriesSummaryRaw,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseoBacklinks";

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
  vi.mocked(fetchBacklinksSummaryRaw).mockResolvedValue({
    data: {
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
    },
    billing: createBilling("/v3/backlinks/summary/live", 0.02003, 1),
  });
  vi.mocked(fetchBacklinksRowsRaw).mockResolvedValue({
    data: [
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
    billing: createBilling("/v3/backlinks/backlinks/live", 0.023, 1),
  });
  vi.mocked(fetchTimeseriesSummaryRaw).mockResolvedValue({
    data: [
      {
        date: "2026-02-01",
        backlinks: 1100,
        referring_domains: 300,
        rank: 40,
      },
    ],
    billing: createBilling("/v3/backlinks/timeseries_summary/live", 0.02039, 1),
  });
  vi.mocked(fetchNewLostTimeseriesRaw).mockResolvedValue({
    data: [
      {
        date: "2026-02-01",
        new_backlinks: 20,
        lost_backlinks: 5,
        new_referring_domains: 3,
        lost_referring_domains: 1,
      },
    ],
    billing: createBilling(
      "/v3/backlinks/timeseries_new_lost_summary/live",
      0.02039,
      1,
    ),
  });

  const first = await service.profileOverview({
    target: "example.com",
    includeSubdomains: true,
    includeIndirectLinks: true,
    excludeInternalBacklinks: true,
    status: "live",
  });
  const second = await service.profileOverview({
    target: "example.com",
    includeSubdomains: true,
    includeIndirectLinks: true,
    excludeInternalBacklinks: true,
    status: "live",
  });

  expect(first.billing.fromCache).toBe(false);
  expect(first.billing.totalCostUsd).toBe(0.08381);
  expect(first.billing.calls.map((call) => call.endpoint)).toEqual([
    "/v3/backlinks/summary/live",
    "/v3/backlinks/backlinks/live",
    "/v3/backlinks/timeseries_summary/live",
    "/v3/backlinks/timeseries_new_lost_summary/live",
  ]);
  expect(first.overview.referringDomains).toEqual([]);
  expect(first.overview.topPages).toEqual([]);
  expect(second.billing.fromCache).toBe(true);
  expect(fetchReferringDomainsRaw).not.toHaveBeenCalled();
  expect(fetchDomainPagesSummaryRaw).not.toHaveBeenCalled();
  expect(fetchBacklinksSummaryRaw).toHaveBeenCalledOnce();
});

it("profiles referring domains and top pages separately", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "https://example.com/foo",
    displayTarget: "https://example.com/foo",
    scope: "page",
  });
  vi.mocked(fetchReferringDomainsRaw).mockResolvedValue({
    data: [
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
    billing: createBilling("/v3/backlinks/referring_domains/live", 0.023, 1),
  });
  vi.mocked(fetchDomainPagesSummaryRaw).mockResolvedValue({
    data: [
      {
        page: "https://example.com/foo",
        backlinks: 100,
        referring_domains: 20,
        rank: 50,
        broken_backlinks: 0,
      },
    ],
    billing: createBilling(
      "/v3/backlinks/domain_pages_summary/live",
      0.02003,
      1,
    ),
  });

  const domains = await service.profileReferringDomains({
    target: "https://example.com/foo",
    includeSubdomains: true,
    includeIndirectLinks: true,
    excludeInternalBacklinks: true,
    status: "live",
  });
  const pages = await service.profileTopPages({
    target: "https://example.com/foo",
    includeSubdomains: true,
    includeIndirectLinks: true,
    excludeInternalBacklinks: true,
    status: "live",
  });

  expect(domains.billing.totalCostUsd).toBe(0.023);
  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBe(2);
  expect(pages.billing.totalCostUsd).toBe(0.02003);
  expect(pages.rows).toHaveLength(1);
});

it("does not fall back to target spam score for referring domains", async () => {
  vi.mocked(normalizeBacklinksTarget).mockReturnValue({
    apiTarget: "example.com",
    displayTarget: "example.com",
    scope: "domain",
  });
  vi.mocked(fetchReferringDomainsRaw).mockResolvedValue({
    data: [
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
    billing: createBilling("/v3/backlinks/referring_domains/live", 0.023, 1),
  });

  const domains = await service.profileReferringDomains({
    target: "example.com",
    includeSubdomains: true,
    includeIndirectLinks: true,
    excludeInternalBacklinks: true,
    status: "live",
  });

  expect(domains.rows).toHaveLength(1);
  expect(domains.rows[0]?.spamScore).toBeNull();
});

function createBilling(
  endpoint: string,
  costUsd: number,
  rowsReturned: number,
) {
  return {
    endpoint,
    path: endpoint.split("/").filter(Boolean),
    costUsd,
    resultCount: 1,
    rowsReturned,
  };
}

function parseCachedValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
