import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPagespeedLighthouse } from "./pagespeedLighthouse";
import { storedLighthousePayloadSchema } from "@/server/lib/lighthouseStoredPayload";

const JSON_HEADERS = { headers: { "content-type": "application/json" } };

const PSI_FIXTURE = {
  lighthouseResult: {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    lighthouseVersion: "12.0.0",
    categories: {
      performance: { score: 0.9 },
      accessibility: { score: 0.95 },
      "best-practices": { score: 1 },
      seo: { score: 0.5 },
    },
    audits: {},
  },
};

describe("fetchPagespeedLighthouse", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("maps a PSI report into a valid stored payload", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "fixture-key");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PSI_FIXTURE), {
          status: 200,
          ...JSON_HEADERS,
        }),
      );

    const payload = await fetchPagespeedLighthouse({
      url: "https://example.com/",
      strategy: "mobile",
    });

    expect(payload.source).toBe("pagespeed-insights");
    expect(payload.scores).toEqual({
      performance: 90,
      accessibility: 95,
      "best-practices": 100,
      seo: 50,
    });
    expect(payload.metadata).toMatchObject({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      strategy: "mobile",
      lighthouseVersion: "12.0.0",
      taskId: null,
      cost: null,
    });
    expect(storedLighthousePayloadSchema.safeParse(payload).success).toBe(true);

    const firstArg = fetchMock.mock.calls[0]?.[0];
    const requestedUrl = decodeURIComponent(
      typeof firstArg === "string" ? firstArg : "",
    );
    expect(requestedUrl).toContain("strategy=mobile");
    expect(requestedUrl).toContain("key=fixture-key");
    expect(requestedUrl).toContain("category=best-practices");
  });

  it("omits the key param when no API key is configured", async () => {
    vi.stubEnv("PAGESPEED_API_KEY", "");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(PSI_FIXTURE), {
          status: 200,
          ...JSON_HEADERS,
        }),
      );

    await fetchPagespeedLighthouse({
      url: "https://example.com/",
      strategy: "desktop",
    });

    const firstArg = fetchMock.mock.calls[0]?.[0];
    const requestedUrl = decodeURIComponent(
      typeof firstArg === "string" ? firstArg : "",
    );
    expect(requestedUrl).not.toContain("key=");
    expect(requestedUrl).toContain("strategy=desktop");
  });

  it("surfaces PSI API errors as upstream failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "Invalid URL", status: "INVALID_ARGUMENT" },
        }),
        { status: 400, ...JSON_HEADERS },
      ),
    );

    await expect(
      fetchPagespeedLighthouse({
        url: "https://example.com/",
        strategy: "mobile",
      }),
    ).rejects.toThrow(/PageSpeed Insights request failed.*Invalid URL/);
  });

  it("rejects a 200 response without lighthouseResult", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200, ...JSON_HEADERS }),
    );

    await expect(
      fetchPagespeedLighthouse({
        url: "https://example.com/",
        strategy: "mobile",
      }),
    ).rejects.toThrow(/missing lighthouseResult/);
  });
});
