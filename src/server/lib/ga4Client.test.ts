import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGa4AdminClient, createGa4DataClient } from "./ga4Client";
import {
  Ga4AdminApiError,
  Ga4DataApiError,
  Ga4MalformedResponseError,
  Ga4TokenError,
} from "./ga4Errors";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/server/features/google/googleOAuth", () => ({
  getGoogleAccessToken: mocks.getAccessToken,
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("ga4Client admin API", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue("ga4_tok");
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the dedicated Analytics grant and paginates property discovery", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [
            {
              account: "accounts/1",
              displayName: "Agency",
              propertySummaries: [
                { property: "properties/11", displayName: "Site A" },
              ],
            },
          ],
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [
            {
              account: "accounts/2",
              displayName: "Client",
              propertySummaries: [
                { property: "properties/22", displayName: "Site B" },
              ],
            },
          ],
        }),
      );

    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      }).listProperties(),
    ).resolves.toEqual([
      {
        propertyId: "properties/11",
        displayName: "Site A",
        accountDisplayName: "Agency",
      },
      {
        propertyId: "properties/22",
        displayName: "Site B",
        accountDisplayName: "Client",
      },
    ]);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      providerId: "google-analytics",
      userId: "u1",
      accountId: "google-sub-a",
    });
    expect(requestUrl(mocks.fetch.mock.calls[1][0])).toContain(
      "pageToken=page-2",
    );
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "a rejected grant",
      respond: () =>
        mocks.fetch.mockResolvedValue(jsonResponse({ error: "expired" }, 401)),
      status: 401,
    },
    {
      label: "a transport failure",
      respond: () =>
        mocks.fetch.mockRejectedValue(new TypeError("connection reset")),
      status: 0,
    },
  ])(
    "classifies $label as a typed admin error with status $status",
    async ({ respond, status }) => {
      respond();
      const client = createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      });
      await expect(client.listProperties()).rejects.toBeInstanceOf(
        Ga4AdminApiError,
      );
      await expect(client.listProperties()).rejects.toMatchObject({ status });
    },
  );

  it("throws a token error when no access token can be minted", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      }).listProperties(),
    ).rejects.toBeInstanceOf(Ga4TokenError);
  });
});

const reportRequest = {
  dateRanges: [{ startDate: "2026-07-01", endDate: "2026-07-28" }],
  dimensions: [{ name: "hostName" }],
  metrics: [{ name: "sessions" }],
  offset: "0",
  limit: "100",
  orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  keepEmptyRows: false as const,
  returnPropertyQuota: true as const,
};

describe("ga4Client data API", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue("token");
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("posts a fixed report to the selected property with its dedicated grant", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        dimensionHeaders: [{ name: "hostName" }],
        metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
        rows: [
          {
            dimensionValues: [{ value: "example.com" }],
            metricValues: [{ value: "12" }],
          },
        ],
        rowCount: 1,
      }),
    );
    const result = await createGa4DataClient({
      userId: "user_1",
      ga4AccountId: "account_1",
      propertyId: "properties/123",
    }).runReport(reportRequest);

    expect(result.rowCount).toBe(1);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      providerId: "google-analytics",
      userId: "user_1",
      accountId: "account_1",
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(reportRequest),
      }),
    );
  });

  it("reuses one token promise for concurrent reports on the same client", async () => {
    mocks.fetch.mockImplementation(async () =>
      Response.json({
        dimensionHeaders: [{ name: "hostName" }],
        metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
        rowCount: 0,
      }),
    );
    const client = createGa4DataClient({
      userId: "user_1",
      ga4AccountId: "account_1",
      propertyId: "properties/123",
    });

    await Promise.all([
      client.runReport(reportRequest),
      client.runReport(reportRequest),
    ]);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("classifies quota failures and retains a safe retry delay", async () => {
    mocks.fetch.mockResolvedValue(
      new Response('{"error":{"message":"private upstream detail"}}', {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    );
    const promise = createGa4DataClient({
      userId: "user_1",
      ga4AccountId: "account_1",
      propertyId: "properties/123",
    }).runReport(reportRequest);

    await expect(promise).rejects.toBeInstanceOf(Ga4DataApiError);
    await expect(promise).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 120,
    });
  });

  it("retains only safe Google error categories from a rejected request", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        {
          error: {
            message: "contains project-specific private detail",
            status: "PERMISSION_DENIED",
            details: [
              {
                reason: "SERVICE_DISABLED",
                metadata: { service: "analyticsdata.googleapis.com" },
              },
            ],
          },
        },
        { status: 403 },
      ),
    );
    await expect(
      createGa4DataClient({
        userId: "user_1",
        ga4AccountId: "account_1",
        propertyId: "properties/123",
      }).runReport(reportRequest),
    ).rejects.toMatchObject({
      status: 403,
      upstreamReason: "SERVICE_DISABLED",
    });
  });

  it("rejects malformed successful responses", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ rows: "not-an-array" }));
    await expect(
      createGa4DataClient({
        userId: "user_1",
        ga4AccountId: "account_1",
        propertyId: "properties/123",
      }).runReport(reportRequest),
    ).rejects.toBeInstanceOf(Ga4MalformedResponseError);
  });

  it("rejects a non-canonical property identifier before fetching", async () => {
    expect(() =>
      createGa4DataClient({
        userId: "user_1",
        ga4AccountId: "account_1",
        propertyId: "123",
      }),
    ).toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("converts transport failures to a typed upstream error", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("DNS failure"));
    await expect(
      createGa4DataClient({
        userId: "user_1",
        ga4AccountId: "account_1",
        propertyId: "properties/123",
      }).runReport(reportRequest),
    ).rejects.toMatchObject({ status: 0 });
  });
});
