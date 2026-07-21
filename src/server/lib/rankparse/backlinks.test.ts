import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getOptionalEnvValueMock } = vi.hoisted(() => ({
  getOptionalEnvValueMock: vi.fn(
    async (_name: string): Promise<string | undefined> => "test-api-key",
  ),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: getOptionalEnvValueMock,
}));

import {
  fetchBacklinksHistory,
  fetchBacklinksRows,
  fetchBacklinksSummary,
  fetchDomainPagesSummary,
  fetchReferringDomains,
} from "@/server/lib/rankparse/backlinks";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function calledUrl(): URL {
  const [firstCall] = vi.mocked(fetch).mock.calls;
  const requested = firstCall[0];
  if (!(requested instanceof URL)) {
    throw new Error("expected rankparseGet to call fetch with a URL");
  }
  return requested;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  getOptionalEnvValueMock.mockImplementation(async (name: string) =>
    name === "RANKPARSE_API_KEY" ? "test-api-key" : undefined,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchBacklinksSummary", () => {
  it("maps domain-authority + domain-rank responses into the shared summary schema", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (!(input instanceof URL)) {
        throw new Error("expected rankparseGet to call fetch with a URL");
      }
      const url = input;
      if (url.pathname === "/v1/domain-authority") {
        return jsonResponse({
          data: { score: 72, referring_domains: 480, total_host_count: 48000 },
          credits_used: 1,
          credits_remaining: 990,
        });
      }
      if (url.pathname === "/v1/domain-rank") {
        return jsonResponse({
          data: {
            inbound_edges: 5200,
            unique_domains: 480,
            avg_linking_host_count: 10.8,
          },
          credits_used: 2,
          credits_remaining: 988,
        });
      }
      throw new Error(`unexpected fetch to ${url.pathname}`);
    });

    const result = await fetchBacklinksSummary({ target: "example.com" });

    expect(result.data).toMatchObject({
      target: "example.com",
      rank: 72,
      backlinks: 5200,
      referring_domains: 480,
    });
    expect(result.billing).toEqual({
      path: ["v3", "backlinks", "rankparse", "summary"],
      costUsd: 0.03,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips the network call and returns no numeric fields for page-scope targets", async () => {
    const result = await fetchBacklinksSummary({
      target: "https://example.com/blog",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.data.target).toBe("https://example.com/blog");
    expect(result.data.rank).toBeUndefined();
    expect(result.data.backlinks).toBeUndefined();
    expect(result.billing.costUsd).toBe(0);
  });
});

describe("fetchBacklinksRows", () => {
  it("maps backlink items and forwards limit/offset/sort", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: [
          {
            from_domain: "techcrunch.com",
            from_url: "https://techcrunch.com/2026/01/review",
            to_url: "https://example.com",
            anchor_text: "Example Tool",
            rel: "nofollow",
            link_type: "hyperlink",
            domain_host_count: 8900,
            crawled_at: "2026-02-15T12:00:00Z",
          },
        ],
        total: 1,
        credits_used: 2,
      }),
    );

    const result = await fetchBacklinksRows({
      target: "example.com",
      limit: 50,
      offset: 10,
      orderBy: ["first_seen,desc"],
    });

    expect(result.data.items).toEqual([
      expect.objectContaining({
        domain_from: "techcrunch.com",
        url_from: "https://techcrunch.com/2026/01/review",
        url_to: "https://example.com",
        anchor: "Example Tool",
        item_type: "hyperlink",
        dofollow: false,
        domain_from_rank: 8900,
        first_seen: "2026-02-15T12:00:00Z",
      }),
    ]);
    // RankParse's envelope `total` is per-page, not a grand total, so the
    // fetcher discards it in favor of the pageSize-heuristic fallback.
    expect(result.data.totalCount).toBeNull();
    expect(result.billing.costUsd).toBe(0.02);
    expect(calledUrl().searchParams.get("limit")).toBe("50");
    expect(calledUrl().searchParams.get("offset")).toBe("10");
    expect(calledUrl().searchParams.get("sort")).toBe("recent");
  });

  it("forwards a domain_from equality filter as ?from_domain=", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ data: [], total: 0, credits_used: 2 }),
    );

    await fetchBacklinksRows({
      target: "example.com",
      filters: [
        ["domain_from", "=", "producthunt.com"],
        "and",
        ["rank", ">", 10],
      ],
    });

    expect(calledUrl().searchParams.get("from_domain")).toBe("producthunt.com");
  });

  it("skips the network call for page-scope targets", async () => {
    const result = await fetchBacklinksRows({
      target: "https://example.com/blog",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.data).toEqual({ items: [], totalCount: 0 });
  });
});

describe("fetchReferringDomains", () => {
  it("maps referring-domain items using total_links (verified against the live API; dofollow_links/nofollow_links are unpopulated)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: [
          {
            from_domain: "producthunt.com",
            total_links: 8900,
            dofollow_links: 0,
            nofollow_links: 0,
          },
        ],
        total: 1,
        credits_used: 2,
      }),
    );

    const result = await fetchReferringDomains({ target: "example.com" });

    expect(result.data.items).toEqual([
      expect.objectContaining({
        domain: "producthunt.com",
        backlinks: 8900,
      }),
    ]);
    expect(calledUrl().pathname).toBe("/v1/referring-domains");
  });
});

describe("fetchDomainPagesSummary", () => {
  it("maps top-pages items into the domain-pages-summary schema", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        data: [
          {
            url: "https://example.com/page",
            inbound_links: 500,
            referring_domains: 120,
            status_code: 200,
            mime: "text/html",
          },
        ],
        total: 1,
        credits_used: 2,
      }),
    );

    const result = await fetchDomainPagesSummary({ target: "example.com" });

    expect(result.data.items).toEqual([
      expect.objectContaining({
        page: "https://example.com/page",
        url: "https://example.com/page",
        backlinks: 500,
        referring_domains: 120,
      }),
    ]);
    expect(calledUrl().pathname).toBe("/v1/top-pages");
  });
});

describe("fetchBacklinksHistory", () => {
  it("returns an empty series with no network call", async () => {
    const result = await fetchBacklinksHistory({
      target: "example.com",
      dateFrom: "2025-01-01",
      dateTo: "2025-12-31",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
    expect(result.billing.costUsd).toBe(0);
  });
});

describe("RankParse error mapping", () => {
  // fetchBacklinksSummary now issues two parallel requests (domain-authority +
  // domain-rank); mockResolvedValue would hand both calls the same Response
  // instance, whose body can only be read once. mockImplementation returns a
  // fresh Response per call.

  it("maps 402 insufficient_credits to BACKLINKS_BILLING_ISSUE", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(
        {
          error: "Payment Required",
          code: "insufficient_credits",
          message: "Add credits at https://rankparse.com/pricing",
        },
        402,
      ),
    );

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "BACKLINKS_BILLING_ISSUE" });
  });

  it("maps 401 invalid_api_key to RANKPARSE_AUTH_FAILED", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(
        {
          error: "Unauthorized",
          code: "invalid_api_key",
          message: "Invalid key",
        },
        401,
      ),
    );

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "RANKPARSE_AUTH_FAILED" });
  });

  it("maps 429 rate_limited to RATE_LIMITED", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(
        {
          error: "Too Many Requests",
          code: "rate_limited",
          message: "Slow down",
        },
        429,
      ),
    );

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps 400 invalid_domain to VALIDATION_ERROR", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(
        {
          error: "Bad Request",
          code: "invalid_domain",
          message: "Valid domain required",
        },
        400,
      ),
    );

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("throws RANKPARSE_AUTH_FAILED without hitting the network when RANKPARSE_API_KEY is unset", async () => {
    getOptionalEnvValueMock.mockResolvedValue(undefined);

    await expect(
      fetchBacklinksSummary({ target: "example.com" }),
    ).rejects.toMatchObject({ code: "RANKPARSE_AUTH_FAILED" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
