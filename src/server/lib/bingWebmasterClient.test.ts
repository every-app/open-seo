import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
}));

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

describe("bingWebmasterClient", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends the api key and unwraps the `d` envelope on GetUserSites", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ d: [{ Url: "https://example.com/" }] }),
    );
    const { createBingWebmasterClient } = await import("./bingWebmasterClient");
    const sites = await createBingWebmasterClient({
      apiKey: "secret-key",
    }).getUserSites();

    expect(sites).toEqual([{ Url: "https://example.com/" }]);
    const [url] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=secret-key",
    );
  });

  it("passes siteUrl as a query param on GetRankAndTrafficStats", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ d: [] }));
    const { createBingWebmasterClient } = await import("./bingWebmasterClient");
    await createBingWebmasterClient({ apiKey: "k" }).getRankAndTrafficStats(
      "https://example.com/",
    );

    const [url] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?apikey=k&siteUrl=https%3A%2F%2Fexample.com%2F",
    );
  });

  it("throws BingAuthError on 401/403 instead of a generic BingApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "denied" }, 401));
    const { createBingWebmasterClient, BingAuthError } =
      await import("./bingWebmasterClient");

    await expect(
      createBingWebmasterClient({ apiKey: "bad-key" }).getUserSites(),
    ).rejects.toBeInstanceOf(BingAuthError);
  });

  it("throws BingApiError with the status for other failures", async () => {
    mocks.fetch.mockResolvedValue(new Response("boom", { status: 500 }));
    const { createBingWebmasterClient, BingApiError } =
      await import("./bingWebmasterClient");

    const error = await createBingWebmasterClient({ apiKey: "k" })
      .getUserSites()
      .catch((e: unknown) => e);
    if (!(error instanceof BingApiError)) {
      throw new Error("expected a BingApiError");
    }
    expect(error.status).toBe(500);
  });

  it("throws when the response has no `d` envelope", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ unexpected: true }));
    const { createBingWebmasterClient, BingApiError } =
      await import("./bingWebmasterClient");

    await expect(
      createBingWebmasterClient({ apiKey: "k" }).getUserSites(),
    ).rejects.toBeInstanceOf(BingApiError);
  });
});
