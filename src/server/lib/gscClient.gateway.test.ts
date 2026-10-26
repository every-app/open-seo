import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  getGoogleAccessMode: vi.fn(),
  getGatewayGoogleFetch: vi.fn(),
  gatewayFetch: vi.fn<typeof fetch>(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/server/features/google/googleOAuth", () => ({
  getGoogleAccessToken: mocks.getAccessToken,
}));
vi.mock("@/server/features/google/googleAccess", () => ({
  getGoogleAccessMode: mocks.getGoogleAccessMode,
}));
vi.mock("@/server/features/google/gatewayGoogle", () => ({
  getGatewayGoogleFetch: mocks.getGatewayGoogleFetch,
}));

import { createGa4AdminClient, createGa4DataClient } from "./ga4Client";
import { Ga4TokenError } from "./ga4Errors";
import { createGscClient, GscTokenError } from "./gscClient";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/**
 * Behind the Every App gateway the clients send Google's real URLs through
 * the gateway's fetch, with no Authorization header of their own: the
 * gateway puts the member's token on the call and OpenSEO never mints one.
 */
describe("Google clients behind the Every App gateway", () => {
  beforeEach(() => {
    mocks.getGoogleAccessMode.mockResolvedValue("gateway");
    mocks.getGatewayGoogleFetch.mockResolvedValue(mocks.gatewayFetch);
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("lists Search Console sites through the gateway, token-free", async () => {
    mocks.gatewayFetch.mockResolvedValue(
      jsonResponse({
        siteEntry: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
      }),
    );

    const sites = await createGscClient({
      userId: "u1",
      gscAccountId: "everyapp",
    }).listSites();

    expect(sites).toEqual([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    const [url, init] = mocks.gatewayFetch.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("posts a Search Analytics query through the gateway with its JSON body", async () => {
    mocks.gatewayFetch.mockResolvedValue(jsonResponse({ rows: [] }));

    await createGscClient({ userId: "u1" }).querySearchAnalytics("https://x/", {
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      dimensions: ["query"],
    });

    const [url, init] = mocks.gatewayFetch.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fx%2F/searchAnalytics/query",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });

  it("says Google isn't reachable when the gateway fetch is missing", async () => {
    mocks.getGatewayGoogleFetch.mockResolvedValue(null);

    await expect(
      createGscClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(GscTokenError);
    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "everyapp",
      }).listProperties(),
    ).rejects.toBeInstanceOf(Ga4TokenError);
  });

  it("reads Analytics admin and data APIs through the gateway, token-free", async () => {
    mocks.gatewayFetch
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [
            {
              account: "accounts/1",
              displayName: "Acme",
              propertySummaries: [
                { property: "properties/42", displayName: "Site" },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ rows: [] }));

    const properties = await createGa4AdminClient({
      userId: "u1",
      ga4AccountId: "everyapp",
    }).listProperties();
    expect(properties).toEqual([
      {
        propertyId: "properties/42",
        displayName: "Site",
        accountDisplayName: "Acme",
      },
    ]);

    await createGa4DataClient({
      userId: "u1",
      ga4AccountId: "everyapp",
      propertyId: "properties/42",
    }).runReport({
      dateRanges: [{ startDate: "2026-10-01", endDate: "2026-10-07" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      offset: "0",
      limit: "10",
      orderBys: [],
      keepEmptyRows: false,
      returnPropertyQuota: true,
    });

    for (const [, init] of mocks.gatewayFetch.mock.calls) {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
    }
    const [reportUrl, reportInit] = mocks.gatewayFetch.mock.calls[1];
    expect(reportUrl).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/42:runReport",
    );
    expect(reportInit?.method).toBe("POST");
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });
});
