import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderUnsupportedError } from "../errors";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/db", () => ({ db: mocks.db }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { createInternalProvider } from "./internal-provider";
import type { SEODataRequest } from "../types";
import { backlinksSummaryItemSchema } from "@/server/lib/dataforseo/backlinks-schemas";

/** A backlink_snapshots row exactly as the dashboard persists it. */
const BACKLINK_SNAPSHOT_ROW = {
  domain: "powersiment.ae",
  rank: 28,
  backlinks: 151,
  referringDomains: 38,
  brokenBacklinks: 15,
  newBacklinks: null,
  lostBacklinks: null,
  newReferringDomains: null,
  lostReferringDomains: null,
  capturedAt: "2026-08-16T00:05:07.120Z",
};

function makeBacklinksRequest(
  constraints: Record<string, unknown> | undefined,
): SEODataRequest {
  return {
    dataType: "backlinks",
    domain: "powersiment.ae",
    locationCode: 2784,
    languageCode: "ar",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
    billingCustomer: { organizationId: "org-1" } as never,
    constraints,
  };
}

function fakeSelectChain(rows: unknown[]) {
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  });
}

function fakeKeywordMetricsSelect(rows: unknown[]) {
  mocks.db.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function makeCompetitorsRequest(
  overrides: Partial<SEODataRequest> = {},
): SEODataRequest {
  return {
    dataType: "competitors",
    keywords: ["CRM", "sales"],
    locationCode: 2840,
    languageCode: "en",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
    billingCustomer: { organizationId: "org-1" } as never,
    constraints: { projectId: "project-1" },
    ...overrides,
  };
}

describe("internal provider — competitors", () => {
  const provider = createInternalProvider();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the latest D1 snapshot for the keyword set", async () => {
    fakeSelectChain([{ itemsJson: '[{"domain":"hubspot.com","etv":100}]' }]);

    const items = await provider.get(makeCompetitorsRequest());

    expect(items).toEqual([{ domain: "hubspot.com", etv: 100 }]);
  });

  it("falls back (unsupported) when no snapshot exists", async () => {
    fakeSelectChain([]);

    await expect(provider.get(makeCompetitorsRequest())).rejects.toThrow(
      ProviderUnsupportedError,
    );
  });

  it("falls back (unsupported) without a projectId", async () => {
    await expect(
      provider.get(makeCompetitorsRequest({ constraints: {} })),
    ).rejects.toThrow(ProviderUnsupportedError);
  });

  it("falls back (unsupported) without keywords", async () => {
    await expect(
      provider.get(makeCompetitorsRequest({ keywords: [] })),
    ).rejects.toThrow(ProviderUnsupportedError);
  });

  it("does not support other data types", () => {
    expect(provider.supports(makeCompetitorsRequest())).toBe(true);
    expect(
      provider.supports(makeCompetitorsRequest({ dataType: "serp" })),
    ).toBe(false);
  });

  it("serves a fresh domain overview snapshot in provider shape", async () => {
    fakeSelectChain([
      {
        id: 1,
        organizationId: "org-1",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        organicTraffic: 1234,
        organicKeywords: 57,
        fetchedAt: new Date().toISOString(),
      },
    ]);

    const result = await provider.get({
      dataType: "domain_overview",
      domain: "example.com",
      locationCode: 2840,
      languageCode: "en",
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
      billingCustomer: { organizationId: "org-1" } as never,
      constraints: { projectId: "project-1" },
    });

    expect(result).toEqual([
      { metrics: { organic: { etv: 1234, count: 57 } } },
    ]);
  });

  it("falls back when the domain overview snapshot is stale", async () => {
    fakeSelectChain([
      {
        id: 1,
        organizationId: "org-1",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        organicTraffic: 1234,
        organicKeywords: 57,
        fetchedAt: "2020-01-01T00:00:00.000Z",
      },
    ]);

    await expect(
      provider.get({
        dataType: "domain_overview",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
        billingCustomer: { organizationId: "org-1" } as never,
      }),
    ).rejects.toThrow("No fresh domain overview snapshot found");
  });
});

describe("internal provider — keyword metrics", () => {
  const provider = createInternalProvider();
  const request: SEODataRequest = {
    dataType: "keyword_metrics",
    keywords: ["one", "two"],
    locationCode: 2840,
    languageCode: "en",
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
    billingCustomer: { organizationId: "org-1" } as never,
    constraints: { projectId: "project-1" },
  };

  beforeEach(() => vi.clearAllMocks());

  it("serves D1 only when all requested keywords are covered", async () => {
    fakeKeywordMetricsSelect([
      { keyword: "one", searchVolume: 10 },
      { keyword: "two", searchVolume: 20 },
    ]);

    await expect(provider.get(request)).resolves.toEqual([
      expect.objectContaining({ keyword: "one", searchVolume: 10 }),
      expect.objectContaining({ keyword: "two", searchVolume: 20 }),
    ]);
  });

  it("falls through when D1 only partially covers the request", async () => {
    fakeKeywordMetricsSelect([{ keyword: "one", searchVolume: 10 }]);

    await expect(provider.get(request)).rejects.toThrow(
      "Stored keyword metrics do not cover the full request",
    );
  });

  it("falls through for city-scoped requests", async () => {
    await expect(
      provider.get({
        ...request,
        constraints: {
          projectId: "project-1",
          locationName: "Enid,Oklahoma,United States",
        },
      }),
    ).rejects.toThrow("not scoped to a local location name");
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
});

describe("internal provider — backlinks provider contract", () => {
  const provider = createInternalProvider();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("supports()", () => {
    it("supports the summary operation", () => {
      expect(
        provider.supports(
          makeBacklinksRequest({ backlinkCall: "summary" }),
        ),
      ).toBe(true);
    });

    it("supports an unspecified backlinkCall (defaults to summary)", () => {
      expect(provider.supports(makeBacklinksRequest(undefined))).toBe(true);
      expect(provider.supports(makeBacklinksRequest({}))).toBe(true);
    });

    it("does NOT support history", () => {
      expect(
        provider.supports(makeBacklinksRequest({ backlinkCall: "history" })),
      ).toBe(false);
    });

    it("does NOT support rows", () => {
      expect(
        provider.supports(makeBacklinksRequest({ backlinkCall: "rows" })),
      ).toBe(false);
    });

    it("does NOT support referring_domains", () => {
      expect(
        provider.supports(
          makeBacklinksRequest({ backlinkCall: "referring_domains" }),
        ),
      ).toBe(false);
    });

    it("does NOT support domain_pages", () => {
      expect(
        provider.supports(
          makeBacklinksRequest({ backlinkCall: "domain_pages" }),
        ),
      ).toBe(false);
    });
  });

  describe("get()", () => {
    it("returns the snapshot for a summary request", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      const result = await provider.get(
        makeBacklinksRequest({ backlinkCall: "summary" }),
      );

      expect(result).toMatchObject({
        target: "powersiment.ae",
        rank: 28,
        backlinks: 151,
        referring_domains: 38,
        broken_backlinks: 15,
      });
    });

    it("returns the snapshot when backlinkCall is omitted (summary default)", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      const result = await provider.get(makeBacklinksRequest(undefined));

      expect(result).toMatchObject({ referring_domains: 38 });
    });

    it("throws unsupported for a history request even with a snapshot", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      await expect(
        provider.get(makeBacklinksRequest({ backlinkCall: "history" })),
      ).rejects.toThrow(ProviderUnsupportedError);
      // Never queried: the guard rejects before touching the DB.
      expect(mocks.db.select).not.toHaveBeenCalled();
    });

    it("throws unsupported for a rows request even with a snapshot", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      await expect(
        provider.get(makeBacklinksRequest({ backlinkCall: "rows" })),
      ).rejects.toThrow(ProviderUnsupportedError);
      expect(mocks.db.select).not.toHaveBeenCalled();
    });

    it("throws unsupported for a referring_domains request even with a snapshot", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      await expect(
        provider.get(makeBacklinksRequest({ backlinkCall: "referring_domains" })),
      ).rejects.toThrow(ProviderUnsupportedError);
      expect(mocks.db.select).not.toHaveBeenCalled();
    });

    it("throws unsupported for a domain_pages request even with a snapshot", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      await expect(
        provider.get(makeBacklinksRequest({ backlinkCall: "domain_pages" })),
      ).rejects.toThrow(ProviderUnsupportedError);
      expect(mocks.db.select).not.toHaveBeenCalled();
    });

    it("never returns a summary payload for a non-summary operation", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      for (const backlinkCall of [
        "history",
        "rows",
        "referring_domains",
        "domain_pages",
      ]) {
        await expect(
          provider.get(
            makeBacklinksRequest({ backlinkCall }),
          ),
        ).rejects.toThrow(ProviderUnsupportedError);
      }
    });

    it("returns a payload validating against the backlinks summary route schema", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      const result = await provider.get(
        makeBacklinksRequest({ backlinkCall: "summary" }),
      );

      expect(
        backlinksSummaryItemSchema.safeParse(result).success,
      ).toBe(true);
    });

    it("falls back (unsupported) without a snapshot", async () => {
      fakeSelectChain([]);

      await expect(
        provider.get(makeBacklinksRequest({ backlinkCall: "summary" })),
      ).rejects.toThrow(ProviderUnsupportedError);
    });

    it("falls back (unsupported) without projectId or domain", async () => {
      fakeSelectChain([BACKLINK_SNAPSHOT_ROW]);

      await expect(
        provider.get({
          ...makeBacklinksRequest({ backlinkCall: "summary" }),
          domain: undefined,
        }),
      ).rejects.toThrow(ProviderUnsupportedError);
      expect(mocks.db.select).not.toHaveBeenCalled();
    });
  });
});
