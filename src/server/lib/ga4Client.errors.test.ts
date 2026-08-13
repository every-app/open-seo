import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGa4DataClient } from "./ga4Client";
import { Ga4DataApiError, Ga4MalformedResponseError } from "./ga4Errors";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
}));

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

function dataClient(propertyId = "properties/123") {
  return createGa4DataClient({
    userId: "user_1",
    ga4AccountId: "account_1",
    propertyId,
  });
}

describe("ga4Client data API errors", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue({ accessToken: "token" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("classifies quota failures and retains a safe retry delay", async () => {
    mocks.fetch.mockResolvedValue(
      new Response('{"error":{"message":"private upstream detail"}}', {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    );
    const promise = dataClient().runReport(reportRequest);

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

    await expect(dataClient().runReport(reportRequest)).rejects.toMatchObject({
      status: 403,
      upstreamReason: "SERVICE_DISABLED",
    });
  });

  it("rejects malformed successful responses", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ rows: "not-an-array" }));

    await expect(dataClient().runReport(reportRequest)).rejects.toBeInstanceOf(
      Ga4MalformedResponseError,
    );
  });

  it("rejects a non-canonical property identifier before fetching", () => {
    expect(() => dataClient("123")).toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("converts transport failures to a typed upstream error", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("DNS failure"));

    await expect(dataClient().runReport(reportRequest)).rejects.toMatchObject({
      status: 0,
    });
  });
});
