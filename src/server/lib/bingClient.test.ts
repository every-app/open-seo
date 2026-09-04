/* eslint-disable max-lines-per-function -- one provider fixture suite exercises every bounded Bing endpoint */
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

/** Base64url-encoded JSON, the shape Bing's access tokens actually take. */
function accessToken(claims: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

describe("bingClient", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    mocks.getAccessToken.mockResolvedValue({ accessToken: "tok_bing" });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unwraps the `d` envelope and maps PascalCase sites with a bearer token", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [
          {
            __type: "Site:#Microsoft.Bing.Webmaster.Api",
            AuthenticationCode: "acct-code-1",
            DnsVerificationCode: "dns-1",
            IsVerified: true,
            Url: "https://example.com/",
          },
          {
            __type: "Site:#Microsoft.Bing.Webmaster.Api",
            AuthenticationCode: "acct-code-1",
            DnsVerificationCode: "dns-2",
            IsVerified: false,
            Url: "https://blog.example.com/",
          },
        ],
      }),
    );
    const { createBingClient } = await import("./bingClient");
    const sites = await createBingClient({ userId: "u1" }).listSites();

    expect(sites).toEqual([
      {
        url: "https://example.com/",
        isVerified: true,
        authenticationCode: "acct-code-1",
        dnsVerificationCode: "dns-1",
      },
      {
        url: "https://blog.example.com/",
        isVerified: false,
        authenticationCode: "acct-code-1",
        dnsVerificationCode: "dns-2",
      },
    ]);

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites",
    );
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok_bing" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("targets the selected Better Auth grant by webmasteruid", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ d: [] }));
    const { createBingClient } = await import("./bingClient");

    await createBingClient({
      userId: "u1",
      bingAccountId: "webmaster-uid-a",
    }).listSites();

    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: {
        providerId: "bing-webmaster",
        userId: "u1",
        accountId: "webmaster-uid-a",
      },
    });
  });

  it("omits accountId when no bingAccountId is given", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ d: [] }));
    const { createBingClient } = await import("./bingClient");

    await createBingClient({ userId: "u1" }).listSites();

    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: { providerId: "bing-webmaster", userId: "u1" },
    });
  });

  it("treats a 200 response missing `d` as a BingApiError, not an empty result", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ notD: [] }));
    const { createBingClient, BingApiError } = await import("./bingClient");
    await expect(
      createBingClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(BingApiError);
  });

  it("encodes the siteUrl and maps the verified rank/traffic row shape", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [
          {
            // Exactly what the live API returned on 2026-07-25, including the
            // __type marker and the timezone offset on the date.
            __type: "RankAndTrafficStats:#Microsoft.Bing.Webmaster.Api",
            Date: "/Date(1445558400000-0700)/",
            Clicks: 42,
            Impressions: 1000,
          },
        ],
      }),
    );
    const { createBingClient } = await import("./bingClient");
    const rows = await createBingClient({
      userId: "u1",
    }).getRankAndTrafficStats("https://example.com/");

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=https%3A%2F%2Fexample.com%2F",
    );
    expect(rows).toEqual([
      {
        date: new Date(1445558400000).toISOString(),
        clicks: 42,
        impressions: 1000,
      },
    ]);
  });

  it("maps 401 to a reconnect-flavoured BingApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    const { createBingClient, BingApiError } = await import("./bingClient");
    const error = await createBingClient({ userId: "u1" })
      .listSites()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BingApiError);
    if (!(error instanceof BingApiError)) throw error;
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/reconnect/i);
  });

  it("maps 403 to a reconnect-flavoured BingApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "forbidden" }, 403));
    const { createBingClient, BingApiError } = await import("./bingClient");
    const error = await createBingClient({ userId: "u1" })
      .listSites()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BingApiError);
    if (!(error instanceof BingApiError)) throw error;
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/revoked|reconnect/i);
  });

  it("maps 429 to a rate-limit BingApiError", async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: "slow down" }, 429));
    const { createBingClient } = await import("./bingClient");
    await expect(
      createBingClient({ userId: "u1" }).listSites(),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("fails closed before parsing an oversized response body", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array(1024 * 1024 + 1), { status: 200 }),
    );
    const { createBingClient, BingApiError } = await import("./bingClient");

    const error = await createBingClient({ userId: "u1" })
      .listSites()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BingApiError);
    if (!(error instanceof BingApiError)) throw error;
    expect(error.status).toBe(502);
    expect(error.message).toMatch(/too large/i);
  });

  it("maps an aborted request to a bounded timeout error", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.fetch.mockRejectedValue(timeout);
    const { createBingClient, BingApiError } = await import("./bingClient");

    const error = await createBingClient({ userId: "u1" })
      .listSites()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BingApiError);
    if (!(error instanceof BingApiError)) throw error;
    expect(error.status).toBe(504);
    expect(error.message).toMatch(/timed out/i);
  });

  it("does not copy a remote error body into its diagnostic message", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("s".repeat(1_000), { status: 500 }),
    );
    const { createBingClient, BingApiError } = await import("./bingClient");

    const error = await createBingClient({ userId: "u1" })
      .listSites()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BingApiError);
    if (!(error instanceof BingApiError)) throw error;
    expect(error.message).not.toContain("ssssssss");
  });

  it("maps Bing's sampled query rows without inventing a reporting window", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [
          {
            Query: "open source seo",
            Date: "/Date(1445558400000-0700)/",
            Clicks: 7,
            Impressions: 90,
            AvgClickPosition: 4.5,
            AvgImpressionPosition: 8.25,
          },
        ],
      }),
    );
    const { createBingClient } = await import("./bingClient");

    const rows = await createBingClient({ userId: "u1" }).getQueryStats(
      "https://example.com/",
    );

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=https%3A%2F%2Fexample.com%2F",
    );
    expect(rows).toEqual([
      {
        query: "open source seo",
        date: new Date(1445558400000).toISOString(),
        clicks: 7,
        impressions: 90,
        averageClickPosition: 4.5,
        averageImpressionPosition: 8.25,
      },
    ]);
  });

  it("maps Bing crawl statistics without inventing unparseable dates", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: [
          {
            Date: "/Date(1445558400000)/",
            AllOtherCodes: 1,
            BlockedByRobotsTxt: 2,
            Code2xx: 30,
            Code301: 3,
            Code302: 4,
            Code4xx: 5,
            Code5xx: 6,
            ContainsMalware: 0,
            CrawlErrors: 11,
            CrawledPages: 50,
            InIndex: 40,
            InLinks: 70,
          },
          {
            Date: "unknown",
            AllOtherCodes: 0,
            BlockedByRobotsTxt: 0,
            Code2xx: 0,
            Code301: 0,
            Code302: 0,
            Code4xx: 0,
            Code5xx: 0,
            ContainsMalware: 0,
            CrawlErrors: 0,
            CrawledPages: 0,
            InIndex: 0,
            InLinks: 0,
          },
        ],
      }),
    );
    const { createBingClient } = await import("./bingClient");

    const rows = await createBingClient({ userId: "u1" }).getCrawlStats(
      "https://example.com/",
    );

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetCrawlStats?siteUrl=https%3A%2F%2Fexample.com%2F",
    );
    expect(rows[0]).toEqual({
      date: new Date(1445558400000).toISOString(),
      allOtherCodes: 1,
      blockedByRobotsTxt: 2,
      code2xx: 30,
      code301: 3,
      code302: 4,
      code4xx: 5,
      code5xx: 6,
      containsMalware: 0,
      crawlErrors: 11,
      crawledPages: 50,
      inIndex: 40,
      inLinks: 70,
    });
    expect(rows[1]?.date).toBeNull();
  });

  it("maps a page of Bing inbound-link counts", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        d: {
          Links: [{ Url: "https://example.net/linking-page", Count: 12 }],
          TotalPages: 4,
        },
      }),
    );
    const { createBingClient } = await import("./bingClient");

    const result = await createBingClient({ userId: "u1" }).getLinkCounts(
      "https://example.com/",
      2,
    );

    expect(mocks.fetch.mock.calls[0][0]).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetLinkCounts?siteUrl=https%3A%2F%2Fexample.com%2F&page=2",
    );
    expect(result).toEqual({
      links: [{ url: "https://example.net/linking-page", count: 12 }],
      totalPages: 4,
    });
  });

  it("throws BingTokenError when no access token can be minted", async () => {
    mocks.getAccessToken.mockRejectedValue(new Error("revoked"));
    const { createBingClient, BingTokenError } = await import("./bingClient");
    await expect(
      createBingClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(BingTokenError);
  });

  it("throws BingTokenError when the token response has no accessToken", async () => {
    mocks.getAccessToken.mockResolvedValue({});
    const { createBingClient, BingTokenError } = await import("./bingClient");
    await expect(
      createBingClient({ userId: "u1" }).listSites(),
    ).rejects.toBeInstanceOf(BingTokenError);
  });

  describe("getConnectedEmail", () => {
    it("reads the email claim off the access token without a network call", async () => {
      mocks.getAccessToken.mockResolvedValue({
        accessToken: accessToken({
          webmasteruid: "uid-1",
          webmasteremail: "owner@example.com",
        }),
      });
      const { createBingClient } = await import("./bingClient");

      await expect(
        createBingClient({ userId: "u1" }).getConnectedEmail(),
      ).resolves.toBe("owner@example.com");
      // Bing has no userinfo endpoint — nothing should be fetched.
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("returns null when the token carries no email claim", async () => {
      mocks.getAccessToken.mockResolvedValue({
        accessToken: accessToken({ webmasteruid: "uid-1" }),
      });
      const { createBingClient } = await import("./bingClient");

      await expect(
        createBingClient({ userId: "u1" }).getConnectedEmail(),
      ).resolves.toBeNull();
    });

    it("returns null when the token cannot be decoded", async () => {
      mocks.getAccessToken.mockResolvedValue({ accessToken: "opaque-token" });
      const { createBingClient } = await import("./bingClient");

      await expect(
        createBingClient({ userId: "u1" }).getConnectedEmail(),
      ).resolves.toBeNull();
    });
  });
});

describe("parseWcfDate", () => {
  it("parses a real WCF /Date(ms)/ value", async () => {
    const { parseWcfDate } = await import("./bingClient");
    const date = parseWcfDate("/Date(1445558400000)/");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getTime()).toBe(1445558400000);
  });

  it("parses a WCF value carrying a timezone offset", async () => {
    const { parseWcfDate } = await import("./bingClient");
    const date = parseWcfDate("/Date(1445558400000+0000)/");
    expect(date?.getTime()).toBe(1445558400000);
  });

  it("returns null for junk and non-string input", async () => {
    const { parseWcfDate } = await import("./bingClient");
    expect(parseWcfDate("not a date")).toBeNull();
    expect(parseWcfDate("/Date(abc)/")).toBeNull();
    expect(parseWcfDate("2026-01-01")).toBeNull();
    expect(parseWcfDate(1445558400000)).toBeNull();
    expect(parseWcfDate(null)).toBeNull();
    expect(parseWcfDate(undefined)).toBeNull();
  });
});
