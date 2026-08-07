import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("bingClient", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    mocks.getAccessToken.mockResolvedValue({ accessToken: "tok_123" });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists sites through the OAuth grant and unwraps the OData envelope", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: {
          results: [{ Url: "https://example.com/" }],
        },
      }),
    );
    const { createBingClient } = await import("./bingClient");
    const sites = await createBingClient({
      userId: "u1",
      bingAccountId: "microsoft-sub",
    }).listSites();

    expect(sites).toEqual([{ Url: "https://example.com/" }]);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: {
        providerId: "bing-webmaster",
        userId: "u1",
        accountId: "microsoft-sub",
      },
    });
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites",
    );
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_123" });
  });

  it("calls visibility and crawl issue endpoints with an encoded site URL", async () => {
    mocks.fetch
      .mockResolvedValueOnce(jsonResponse({ d: { Clicks: 4 } }))
      .mockResolvedValueOnce(jsonResponse({ d: [{ Issue: "timeout" }] }));
    const { createBingClient } = await import("./bingClient");
    const client = createBingClient({ userId: "u1" });

    await expect(client.getVisibility("https://example.com/")).resolves.toEqual(
      { Clicks: 4 },
    );
    await expect(
      client.getCrawlIssues("https://example.com/"),
    ).resolves.toEqual([{ Issue: "timeout" }]);

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=https%3A%2F%2Fexample.com%2F",
    );
    expect(mocks.fetch.mock.calls[1][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetCrawlIssues?siteUrl=https%3A%2F%2Fexample.com%2F",
    );
  });

  it("uses the self-hosted API-key flow without minting an OAuth token", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ d: [] }));
    const { createBingClient } = await import("./bingClient");
    await createBingClient({
      userId: "u1",
      apiKey: "key_123",
    }).listSites();

    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=key_123",
    );
  });

  it("maps access failures to BingApiError and token failures to BingTokenError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "forbidden" }, 403));
    const { BingApiError, createBingClient, BingTokenError } =
      await import("./bingClient");
    await expect(
      createBingClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(BingApiError);

    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    await expect(
      createBingClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(BingTokenError);
  });
});
