import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CLOUDFLARE_CRAWLER_QUERY,
  CLOUDFLARE_MAX_RESPONSE_BYTES,
  CLOUDFLARE_SECURITY_QUERY,
  CLOUDFLARE_TRAFFIC_QUERY,
  createCloudflareAnalyticsClient,
} from "./CloudflareAnalyticsClient";
import { CLOUDFLARE_MAX_RETRY_AFTER_SECONDS } from "./CloudflareAnalyticsError";

function mockFetch(response: () => Response): typeof fetch {
  return vi.fn(async () => response());
}

const request = {
  apiToken: "secret-token",
  zoneId: "a".repeat(32),
  from: "2026-09-04T09:00:00.000Z",
  to: "2026-09-04T11:00:00.000Z",
};

describe("CloudflareAnalyticsClient", () => {
  it("parses aggregates, accepts errors:null, and keeps the token out of the body", async () => {
    const fetcher = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                zones: [
                  {
                    httpRequestsAdaptiveGroups: [
                      {
                        count: "12",
                        dimensions: { edgeResponseStatus: 200 },
                        sum: { edgeResponseBytes: "450", visits: 3 },
                      },
                    ],
                  },
                ],
              },
            },
            errors: null,
          }),
        ),
    );
    const result =
      await createCloudflareAnalyticsClient(fetcher).traffic(request);

    expect(
      result.data?.viewer.zones[0]?.httpRequestsAdaptiveGroups[0]?.count,
    ).toBe(12);
    const init = vi.mocked(fetcher).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer secret-token",
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    if (typeof init?.body !== "string") throw new Error("Expected JSON body");
    expect(init.body).not.toContain("secret-token");
    expect(result.errors).toEqual([]);
  });

  it("keeps valid partial data and errors from HTTP 200", async () => {
    const client = createCloudflareAnalyticsClient(
      mockFetch(
        () =>
          new Response(
            JSON.stringify({
              data: {
                viewer: { zones: [{ httpRequestsAdaptiveGroups: [] }] },
              },
              errors: [{ message: "optional field unavailable" }],
            }),
          ),
      ),
    );

    await expect(client.traffic(request)).resolves.toEqual({
      data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [] }] } },
      errors: ["optional field unavailable"],
    });
  });

  it.each([
    [401, "authentication_failed"],
    [403, "authentication_failed"],
    [429, "rate_limited"],
    [500, "upstream_unavailable"],
    [503, "upstream_unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const client = createCloudflareAnalyticsClient(
      mockFetch(
        () =>
          new Response("provider details", {
            status,
            headers: status === 429 ? { "retry-after": "42" } : undefined,
          }),
      ),
    );
    await expect(client.traffic(request)).rejects.toMatchObject({ code });
  });

  it("bounds Retry-After before returning it to callers", async () => {
    const client = createCloudflareAnalyticsClient(
      mockFetch(
        () =>
          new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "999999" },
          }),
      ),
    );

    await expect(client.traffic(request)).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: CLOUDFLARE_MAX_RETRY_AFTER_SECONDS,
    });
  });

  it.each([
    ["cannot request data older than 2678400s", "dataset_unavailable"],
    ["unknown field sampleInterval on type Query", "invalid_response"],
  ] as const)("classifies HTTP 400 errors", async (message, code) => {
    const client = createCloudflareAnalyticsClient(
      mockFetch(
        () =>
          new Response(JSON.stringify({ data: null, errors: [{ message }] }), {
            status: 400,
          }),
      ),
    );
    await expect(client.traffic(request)).rejects.toMatchObject({
      code,
      providerErrors: [message],
    });
  });

  it("uses verified bot IDs without a User-Agent fallback", async () => {
    const fetcher = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            data: { viewer: { zones: [{ googlebot: [], bingbot: [] }] } },
          }),
        ),
    );
    await createCloudflareAnalyticsClient(fetcher).crawlerAccess(request);
    const rawBody = vi.mocked(fetcher).mock.calls[0]?.[1]?.body;
    if (typeof rawBody !== "string") throw new Error("Expected JSON body");
    const body = z
      .object({
        variables: z.object({
          googleFilter: z.object({
            botDetectionIds_hasany: z.array(z.number()),
          }),
          bingFilter: z.object({
            botDetectionIds_hasany: z.array(z.number()),
          }),
        }),
      })
      .parse(JSON.parse(rawBody));
    expect(body.variables.googleFilter.botDetectionIds_hasany).toEqual([
      120_623_194, 33_554_459,
    ]);
    expect(body.variables.bingFilter.botDetectionIds_hasany).toEqual([
      117_479_730, 33_554_461,
    ]);
    expect(JSON.stringify(body)).not.toMatch(/userAgent/i);
  });

  it("never requests IP, query-string, or raw user-agent dimensions", () => {
    const queries = [
      CLOUDFLARE_TRAFFIC_QUERY,
      CLOUDFLARE_SECURITY_QUERY,
      CLOUDFLARE_CRAWLER_QUERY,
    ].join("\n");
    expect(queries).not.toMatch(
      /clientIP|clientRequestQuery|clientRequestUserAgent|\buserAgent\b/i,
    );
    expect(CLOUDFLARE_SECURITY_QUERY).toMatch(/orderBy:\s*\[count_DESC\]/);
  });

  it("rejects oversized and invalid JSON responses", async () => {
    const oversized = createCloudflareAnalyticsClient(
      mockFetch(
        () =>
          new Response("{}", {
            headers: {
              "content-length": String(CLOUDFLARE_MAX_RESPONSE_BYTES + 1),
            },
          }),
      ),
    );
    await expect(oversized.traffic(request)).rejects.toMatchObject({
      code: "invalid_response",
    });

    const invalid = createCloudflareAnalyticsClient(
      mockFetch(() => new Response("not-json")),
    );
    await expect(invalid.traffic(request)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("classifies timeouts and network failures as upstream unavailable", async () => {
    const fetcher: typeof fetch = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    });
    await expect(
      createCloudflareAnalyticsClient(fetcher).traffic(request),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
  });
});
