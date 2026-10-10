import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BingApiError,
  BingAuthError,
  BingThrottleError,
  createBingClient,
} from "./bingClient";

const mocks = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

describe("bingClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists sites from the JSON envelope, passing the API key as a query param", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [{ Url: "https://example.com/", IsVerified: true }],
      }),
    );

    const sites = await createBingClient({ apiKey: "key_123" }).listSites();

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=key_123",
    );
    expect(sites).toEqual([{ url: "https://example.com/", isVerified: true }]);
  });

  it("sends OAuth tokens as a Bearer header to the ssl host, with no key param", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [{ Url: "https://example.com/", IsVerified: true }],
      }),
    );

    const sites = await createBingClient({
      accessToken: "oauth-token",
    }).listSites();

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites",
    );
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer oauth-token",
    });
    expect(sites).toEqual([{ url: "https://example.com/", isVerified: true }]);
  });

  it("classifies Bing's ThrottleIP body as a throttle, not a rejected key", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ ErrorCode: 17, Message: "ERROR!!! ThrottleIP" }, 400),
    );

    await expect(
      createBingClient({ apiKey: "key_123" }).listSites(),
    ).rejects.toBeInstanceOf(BingThrottleError);
  });

  it("classifies a 400 InvalidToken body as an auth failure, not a bad request", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ ErrorCode: 18, Message: "ERROR!!! InvalidToken" }, 400),
    );

    await expect(
      createBingClient({ accessToken: "expired" }).listSites(),
    ).rejects.toBeInstanceOf(BingAuthError);
  });

  it("normalizes query rows: key from Query, WCF date, impression position", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [
          {
            Query: "seo tools",
            Date: "/Date(1717027200000)/",
            Clicks: 12,
            Impressions: 300,
            AvgClickPosition: 75,
            AvgImpressionPosition: 3,
          },
        ],
      }),
    );

    const rows = await createBingClient({ apiKey: "key_123" }).queryStats(
      "https://example.com/",
    );

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=key_123&siteUrl=https%3A%2F%2Fexample.com%2F",
    );
    expect(rows).toEqual([
      {
        key: "seo tools",
        date: "2024-05-30",
        clicks: 12,
        impressions: 300,
        position: 3,
      },
    ]);
  });

  it("drops Bing's -1 position sentinel rather than passing it through", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [
          {
            Query: "no clicks",
            Impressions: 4,
            AvgClickPosition: -1,
            AvgImpressionPosition: -1,
          },
        ],
      }),
    );

    const rows = await createBingClient({ apiKey: "key_123" }).queryStats(
      "https://example.com/",
    );

    expect(rows[0]?.position).toBeUndefined();
  });

  it("reads the page key from Page for page stats", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [{ Page: "https://example.com/post", Clicks: 3, Impressions: 40 }],
      }),
    );

    const rows = await createBingClient({ apiKey: "key_123" }).pageStats(
      "https://example.com/",
    );

    expect(rows[0]).toMatchObject({
      key: "https://example.com/post",
      clicks: 3,
      impressions: 40,
    });
  });

  it("maps 401 to BingAuthError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ message: "no" }, 401));

    await expect(
      createBingClient({ apiKey: "key_123" }).listSites(),
    ).rejects.toBeInstanceOf(BingAuthError);
  });

  it("maps 500 to BingApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ message: "boom" }, 500));

    await expect(
      createBingClient({ apiKey: "key_123" }).listSites(),
    ).rejects.toMatchObject({ status: 500 });
    await expect(
      createBingClient({ apiKey: "key_123" }).listSites(),
    ).rejects.toBeInstanceOf(BingApiError);
  });

  it("parses GetUrlInfo and treats HTTP status 0 as not reported", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: {
          Url: "https://example.com/a",
          HttpStatus: 0,
          IsPage: true,
          LastCrawledDate: "/Date(1717027200000)/",
          AnchorCount: 5,
        },
      }),
    );

    const info = await createBingClient({ apiKey: "key_123" }).urlInfo(
      "https://example.com/",
      "https://example.com/a",
    );

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUrlInfo?apikey=key_123&siteUrl=https%3A%2F%2Fexample.com%2F&url=https%3A%2F%2Fexample.com%2Fa",
    );
    expect(info).toMatchObject({
      url: "https://example.com/a",
      httpStatusReported: false,
      isPage: true,
      lastCrawledDate: "2024-05-30",
      anchorCount: 5,
    });
    expect(info).not.toHaveProperty("httpStatus");
  });

  it("reports a real HTTP status from GetUrlInfo", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ d: { HttpStatus: 404 } }));

    const info = await createBingClient({ apiKey: "key_123" }).urlInfo(
      "https://example.com/",
      "https://example.com/missing",
    );

    expect(info).toMatchObject({
      url: "https://example.com/missing",
      httpStatusReported: true,
      httpStatus: 404,
    });
  });
});
