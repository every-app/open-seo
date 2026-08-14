import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderUnsupportedError } from "../errors";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/db", () => ({ db: mocks.db }));

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { createInternalProvider } from "./internal-provider";
import type { SEODataRequest } from "../types";

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
