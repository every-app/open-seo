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

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
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
    mocks.getAccessToken.mockResolvedValue({ accessToken: "ga4_tok" });
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
      body: {
        providerId: "google-analytics",
        userId: "u1",
        accountId: "google-sub-a",
      },
    });
    const secondUrl = mocks.fetch.mock.calls[1]?.[0];
    const secondUrlText =
      typeof secondUrl === "string"
        ? secondUrl
        : secondUrl instanceof URL
          ? secondUrl.toString()
          : secondUrl?.url;
    expect(secondUrlText).toContain("pageToken=page-2");
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("loads and validates the selected property's reporting metadata", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        name: "properties/11",
        displayName: "Site A",
        timeZone: "America/New_York",
        currencyCode: "USD",
      }),
    );
    const property = await createGa4AdminClient({
      userId: "u1",
      ga4AccountId: "google-sub-a",
    }).getProperty("properties/11");

    expect(property.timeZone).toBe("America/New_York");
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe(
      "https://analyticsadmin.googleapis.com/v1beta/properties/11",
    );
  });

  it("classifies a rejected grant as a typed 401", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "expired" }, 401));
    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      }).listProperties(),
    ).rejects.toBeInstanceOf(Ga4AdminApiError);
    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      }).listProperties(),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws a token error when Better Auth cannot mint an access token", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      }).listProperties(),
    ).rejects.toBeInstanceOf(Ga4TokenError);
  });

  it("reads streams, enhanced measurement, key events, and custom definitions", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          dataStreams: [
            {
              name: "properties/11/dataStreams/22",
              type: "WEB_DATA_STREAM",
              displayName: "Website",
              webStreamData: {
                measurementId: "G-ABC123",
                defaultUri: "https://example.com",
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          streamEnabled: true,
          scrollsEnabled: true,
          outboundClicksEnabled: true,
          siteSearchEnabled: true,
          videoEngagementEnabled: true,
          fileDownloadsEnabled: true,
          pageChangesEnabled: true,
          formInteractionsEnabled: false,
          searchQueryParameter: "q,s",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          keyEvents: [
            {
              eventName: "purchase",
              countingMethod: "ONCE_PER_EVENT",
              custom: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          customDimensions: [
            {
              parameterName: "content_type",
              displayName: "Content type",
              scope: "EVENT",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          customMetrics: [
            {
              parameterName: "quality_score",
              displayName: "Quality score",
              measurementUnit: "STANDARD",
              scope: "EVENT",
            },
          ],
        }),
      );
    const client = createGa4AdminClient({
      userId: "u1",
      ga4AccountId: "google-sub-a",
    });

    const streams = await client.listDataStreams("properties/11");
    const enhanced = await client.getEnhancedMeasurementSettings(
      "properties/11/dataStreams/22",
    );
    const keyEvents = await client.listKeyEvents("properties/11");
    const dimensions = await client.listCustomDimensions("properties/11");
    const metrics = await client.listCustomMetrics("properties/11");

    expect(streams[0]?.webStreamData?.measurementId).toBe("G-ABC123");
    expect(enhanced.siteSearchEnabled).toBe(true);
    expect(keyEvents[0]?.eventName).toBe("purchase");
    expect(dimensions[0]?.parameterName).toBe("content_type");
    expect(metrics[0]?.parameterName).toBe("quality_score");
    expect(mocks.fetch.mock.calls.map((call) => requestUrl(call[0]))).toEqual([
      "https://analyticsadmin.googleapis.com/v1alpha/properties/11/dataStreams?pageSize=200",
      "https://analyticsadmin.googleapis.com/v1alpha/properties/11/dataStreams/22/enhancedMeasurementSettings",
      "https://analyticsadmin.googleapis.com/v1beta/properties/11/keyEvents?pageSize=200",
      "https://analyticsadmin.googleapis.com/v1beta/properties/11/customDimensions?pageSize=200",
      "https://analyticsadmin.googleapis.com/v1beta/properties/11/customMetrics?pageSize=200",
    ]);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("converts transport failures to a typed upstream error", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("connection reset"));

    await expect(
      createGa4AdminClient({
        userId: "u1",
        ga4AccountId: "google-sub-a",
      }).listProperties(),
    ).rejects.toMatchObject({ status: 0 });
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
    mocks.getAccessToken.mockResolvedValue({ accessToken: "token" });
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
      body: {
        providerId: "google-analytics",
        userId: "user_1",
        accountId: "account_1",
      },
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
