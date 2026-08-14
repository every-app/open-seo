import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  serpCompetitors: vi.fn(),
  rankOverview: vi.fn(),
  fetchKeywordMetricsForList: vi.fn(),
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(() => ({
    labs: { serpCompetitors: mocks.serpCompetitors },
    domain: { rankOverview: mocks.rankOverview },
  })),
  fetchKeywordMetricsForList: mocks.fetchKeywordMetricsForList,
}));

vi.mock("../cost-tracker", () => ({
  recordDataforseoFallback: vi.fn(),
}));

vi.mock("../config", () => ({
  getDefaultCacheTtl: vi.fn(() => 7 * 24 * 60 * 60),
  getProviderFeatureFlags: vi.fn(async () => ({
    routerEnabled: true,
    dataforseoEnabled: true,
    gscEnabled: false,
    googleAdsEnabled: false,
    bingWebmasterEnabled: false,
    localCrawlerEnabled: true,
  })),
}));

vi.mock("@/db", () => ({ db: mocks.db }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { createDataforseoProvider } from "./dataforseo-provider";
import type { SEODataRequest } from "../types";

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
    constraints: {
      projectId: "project-1",
      limit: 20,
      offset: 10,
      itemTypes: ["organic", "local_pack"],
      includeSubdomains: true,
    },
    ...overrides,
  };
}

describe("dataforseo provider — competitors", () => {
  const provider = createDataforseoProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("passes the keyword set and constraints through to serpCompetitors", async () => {
    mocks.serpCompetitors.mockResolvedValue([{ domain: "hubspot.com" }]);

    const result = await provider.get(makeCompetitorsRequest());

    expect(mocks.serpCompetitors).toHaveBeenCalledWith({
      keywords: ["CRM", "sales"],
      locationCode: 2840,
      languageCode: "en",
      itemTypes: ["organic", "local_pack"],
      includeSubdomains: true,
      limit: 20,
      offset: 10,
    });
    expect(result).toEqual([{ domain: "hubspot.com" }]);
  });

  it("defaults limit to 50 and drops absent constraints", async () => {
    mocks.serpCompetitors.mockResolvedValue([]);

    await provider.get(
      makeCompetitorsRequest({ constraints: { projectId: "project-1" } }),
    );

    expect(mocks.serpCompetitors).toHaveBeenCalledWith({
      keywords: ["CRM", "sales"],
      locationCode: 2840,
      languageCode: "en",
      itemTypes: undefined,
      includeSubdomains: undefined,
      limit: 50,
      offset: undefined,
    });
  });

  it("write-throughs the paid result to D1 for the project", async () => {
    mocks.serpCompetitors.mockResolvedValue([{ domain: "hubspot.com" }]);

    await provider.get(makeCompetitorsRequest());

    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
    expect(mocks.db.insert).toHaveBeenCalledWith(expect.anything());
  });

  it("skips persistence when no projectId is provided", async () => {
    mocks.serpCompetitors.mockResolvedValue([{ domain: "hubspot.com" }]);

    await provider.get(makeCompetitorsRequest({ constraints: {} }));

    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it("still returns the paid result when persistence fails", async () => {
    mocks.serpCompetitors.mockResolvedValue([{ domain: "hubspot.com" }]);
    mocks.db.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("d1 down")),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await provider.get(makeCompetitorsRequest());

    expect(result).toEqual([{ domain: "hubspot.com" }]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("throws ProviderUnsupportedError without keywords", async () => {
    await expect(
      provider.get(makeCompetitorsRequest({ keywords: [] })),
    ).rejects.toThrow("keywords are required");
    expect(mocks.serpCompetitors).not.toHaveBeenCalled();
  });
});

describe("dataforseo provider — domain overview", () => {
  const provider = createDataforseoProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("writes normalized organic metrics to the organization snapshot", async () => {
    mocks.rankOverview.mockResolvedValue([
      { metrics: { organic: { etv: 1234.5, count: 57.2 } } },
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
      { metrics: { organic: { etv: 1234.5, count: 57.2 } } },
    ]);
    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
  });

  it("returns the paid result when snapshot persistence fails", async () => {
    mocks.rankOverview.mockResolvedValue([]);
    mocks.db.insert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("d1 down")),
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      provider.get({
        dataType: "domain_overview",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only BillingCustomerContext mock
        billingCustomer: { organizationId: "org-1" } as never,
      }),
    ).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
