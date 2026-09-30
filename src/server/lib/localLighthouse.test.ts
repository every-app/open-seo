import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalLighthouse } from "./localLighthouse";

afterEach(() => vi.unstubAllGlobals());

describe("fetchLocalLighthouse", () => {
  it("posts a run and stores real Lighthouse scores", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          lighthouseResult: {
            requestedUrl: "https://example.com/",
            finalUrl: "https://example.com/",
            lighthouseVersion: "12.0.0",
            categories: {
              performance: { score: 0.82, auditRefs: [] },
              accessibility: { score: 0.95, auditRefs: [] },
              "best-practices": { score: 0.91, auditRefs: [] },
              seo: { score: 1, auditRefs: [] },
            },
            audits: {
              "largest-contentful-paint": { numericValue: 1700 },
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const report = await fetchLocalLighthouse({
      url: "https://example.com/",
      strategy: "mobile",
      runnerUrl: "http://lighthouse-runner:4181",
    });

    const [requestedUrl, options] = fetchMock.mock.calls[0];
    if (!(requestedUrl instanceof URL)) {
      throw new Error("Expected the runner URL");
    }
    expect(requestedUrl.href).toBe("http://lighthouse-runner:4181/run");
    if (typeof options?.body !== "string") {
      throw new Error("Expected a JSON request body");
    }
    expect(JSON.parse(options.body)).toEqual({
      url: "https://example.com/",
      strategy: "mobile",
    });
    expect(report.source).toBe("local-lighthouse");
    expect(report.scores.performance).toBe(82);
    expect(report.metrics.largestContentfulPaint.numericValue).toBe(1700);
    expect(report.metadata.cost).toBe(0);
  });

  it("does not fabricate results when Lighthouse returns no scores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            lighthouseResult: {
              categories: {},
              audits: {},
            },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      fetchLocalLighthouse({
        url: "https://example.com/",
        strategy: "desktop",
        runnerUrl: "http://lighthouse-runner:4181",
      }),
    ).rejects.toThrow("no scores");
  });
});
