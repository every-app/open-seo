import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawledPageResult } from "@/server/lib/audit/types";

const mocks = vi.hoisted(() => ({
  claimChunk: vi.fn(),
  getStats:
    vi.fn<
      () => Promise<{ attempted: number; pending: number; seen: number }>
    >(),
  recordBatch: vi.fn(),
  releaseUrls: vi.fn<(urls: string[]) => Promise<void>>(),
  insertCrawledBatch: vi.fn(),
  pgStep: vi.fn(),
  sleepUntil: vi.fn(),
  getCrawlThrottle: vi.fn(),
  saveCrawlThrottle: vi.fn(),
  renderPage: vi.fn<typeof RenderedPageService.renderPage>(),
}));
vi.mock("cloudflare:workers", () => ({
  env: { CONTEXT_API_KEY: "context-test-key" },
}));
vi.mock("@/server/lib/audit/rendered-page", () => ({
  RenderedPageService: { renderPage: mocks.renderPage },
}));
vi.mock("cloudflare:workflows", () => ({
  NonRetryableError: class extends Error {},
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: () => mocks,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    insertCrawledBatch: mocks.insertCrawledBatch,
    updateAuditProgress: vi.fn(),
  },
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({
  AuditProgressKV: { pushCrawledUrls: vi.fn() },
}));
vi.mock("@/server/workflows/pgStep", () => ({ pgStep: mocks.pgStep }));
vi.mock("@/server/lib/audit/ids", () => ({
  deterministicAuditRowId: async (_auditId: string, url: string) => url,
  sha256Hex: async () => "content-hash",
}));

import { runCrawlPhase } from "@/server/workflows/siteAuditWorkflowCrawl";
import { parseRobotsTxt } from "@/server/lib/audit/discovery";
import type { RenderedPageService } from "@/server/lib/audit/rendered-page";

const ORIGIN = "https://example.com";
const HTML = "<html><title>A page</title><body><h1>A page</h1></body></html>";
let saved: CrawledPageResult[];
let urls: string[];
let renderUsage: { cloudflareAttempts: number; contextCredits: number };

beforeEach(async () => {
  // Load the lazy HTML parser before advancing the fake network clock.
  await import("@/server/lib/audit/page-analyzer");
  vi.useFakeTimers();
  vi.setSystemTime(0);
  saved = [];
  renderUsage = { cloudflareAttempts: 0, contextCredits: 0 };
  let checkpoint: unknown;
  mocks.getCrawlThrottle.mockImplementation(async () =>
    structuredClone(checkpoint),
  );
  mocks.saveCrawlThrottle.mockImplementation(async (state) => {
    checkpoint = structuredClone(state);
  });
  mocks.pgStep.mockImplementation((_step, _name, _config, fn: () => unknown) =>
    fn(),
  );
  mocks.sleepUntil.mockImplementation(async (_name, at: number) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, at - Date.now())),
    );
  });
  mocks.claimChunk.mockImplementation(
    async (_chunk: number, limit: number) => ({
      urls: urls
        .filter((url) => !saved.some((page) => page.url === url))
        .slice(0, limit)
        .map((url) => ({
          url,
          depth: 0,
          inSitemap: true,
        })),
      isRetry: false,
    }),
  );
  mocks.getStats.mockImplementation(async () => ({
    attempted: saved.length,
    pending: urls.length - saved.length,
    seen: urls.length,
  }));
  mocks.recordBatch.mockImplementation(() => mocks.getStats());
  mocks.insertCrawledBatch.mockImplementation(
    async (_audit, pages: CrawledPageResult[]) => {
      saved.push(...pages);
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
});

function crawl(maxPages = 100, renderJavaScript = false) {
  urls = Array.from({ length: maxPages }, (_, i) => `${ORIGIN}/${i}`);
  return runCrawlPhase(
    {
      do: vi.fn(),
      sleep: vi.fn(),
      sleepUntil: mocks.sleepUntil,
      waitForEvent: vi.fn(),
    },
    {
      auditId: "audit",
      workflowInstanceId: "workflow",
      origin: ORIGIN,
      maxPages,
      seededCount: maxPages,
      renderJavaScript,
      robots: parseRobotsTxt(ORIGIN, ""),
      renderUsage,
    },
  );
}

function serve(status: (now: number) => number, retryAfter?: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    // Network responses settle after all requests in the window are launched.
    await new Promise((resolve) => setTimeout(resolve, 1));
    return new Response(HTML, {
      status: status(Date.now()),
      headers: {
        "content-type": "text/html",
        ...(retryAfter ? { "retry-after": retryAfter } : {}),
      },
    });
  });
}

describe("crawl pacing and cooldowns", () => {
  it("spaces a fast site's requests across chunks", async () => {
    const starts: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      starts.push(Date.now());
      return new Response(HTML, { headers: { "content-type": "text/html" } });
    });
    const result = crawl(210);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ pagesCrawled: 210, completed: true });
    expect(starts).toHaveLength(210);
    expect(starts.slice(1).every((at, i) => at - starts[i] >= 1_000)).toBe(
      true,
    );
    expect(mocks.claimChunk.mock.calls.length).toBeGreaterThan(1);
  });

  it("never has more than two fetches in flight on a slow site", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      inFlight -= 1;
      return new Response(HTML, { headers: { "content-type": "text/html" } });
    });
    const result = crawl(10);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ pagesCrawled: 10, completed: true });
    expect(peak).toBe(2);
  });

  it("retains slower pacing across chunks after recovering from the first 429", async () => {
    const starts: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      starts.push(Date.now());
      return new Response(HTML, {
        status: starts.length === 1 ? 429 : 200,
        headers: { "content-type": "text/html" },
      });
    });
    const result = crawl(100);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ pagesCrawled: 100, completed: true });
    expect(starts[1]).toBe(30_000);
    expect(starts.slice(2).every((at, i) => at - starts[i + 1] >= 2_000)).toBe(
      true,
    );
    expect(saved.every((page) => page.fetchClass === "ok")).toBe(true);
    expect(mocks.claimChunk.mock.calls.length).toBeGreaterThan(1);
  });

  it("sleeps durably for ten minutes then retries the deferred URL", async () => {
    const fetchMock = serve((now) => (now < 600_000 ? 429 : 200), "600");
    const result = crawl(10);
    await vi.advanceTimersByTimeAsync(599_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);
    expect(mocks.releaseUrls.mock.calls[0][0]).toHaveLength(10);
    expect(mocks.sleepUntil).toHaveBeenCalledWith("crawl-cooldown-1", 600_001);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ pagesCrawled: 10, completed: true });
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(new Set(saved.map((page) => page.url)).size).toBe(10);
    expect(saved.every((page) => page.fetchClass === "ok")).toBe(true);
  });

  it("replays the same durable cooldown after a workflow restart", async () => {
    const cache = new Map<string, unknown>();
    mocks.pgStep.mockImplementation(
      async (_step, name: string, _config, fn: () => Promise<unknown>) => {
        if (!cache.has(name)) cache.set(name, await fn());
        return cache.get(name);
      },
    );
    mocks.sleepUntil.mockRejectedValueOnce(new Error("isolate restarted"));
    const fetchMock = serve((now) => (now < 600_000 ? 429 : 200), "600");
    const first = expect(crawl(10)).rejects.toThrow("isolate restarted");
    await vi.advanceTimersByTimeAsync(1_000);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Resume after the timestamp has passed: the same sleep must still replay.
    vi.setSystemTime(700_000);
    const resumed = crawl(10);
    await vi.runAllTimersAsync();
    expect(await resumed).toEqual({ pagesCrawled: 10, completed: true });
    expect(mocks.sleepUntil.mock.calls).toEqual([
      ["crawl-cooldown-1", 600_001],
      ["crawl-cooldown-1", 600_001],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(new Set(saved.map((page) => page.url)).size).toBe(10);
  });

  it("honors the saved cooldown when the chunk fails before returning", async () => {
    mocks.releaseUrls.mockRejectedValueOnce(
      new Error("scratchpad unavailable"),
    );
    mocks.pgStep.mockImplementation(
      async (_step, _name, _config, fn: () => Promise<unknown>) => {
        try {
          return await fn();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          return fn();
        }
      },
    );
    const fetchMock = serve((now) => (now < 600_000 ? 429 : 200), "600");
    const result = crawl(10);
    await vi.advanceTimersByTimeAsync(599_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ pagesCrawled: 10, completed: true });
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(new Set(saved.map((page) => page.url)).size).toBe(10);
  });

  it("fails without more requests if a cooldown cannot be checkpointed", async () => {
    mocks.saveCrawlThrottle.mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    const fetchMock = serve(() => 429, "600");
    const result = expect(crawl(10)).rejects.toThrow(
      "Unable to save the site's crawl cooldown.",
    );
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops a permanently limited site after four refusals across chunks", async () => {
    const fetchMock = serve(() => 429);
    const result = crawl();
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ completed: false, rateLimited: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(saved).toHaveLength(1);
    expect(saved[0].fetchClass).toBe("rate_limited");
    expect(mocks.sleepUntil.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.releaseUrls).toHaveBeenCalled();
  });

  it("stops without sleeping or retrying early when Retry-After exceeds the cooldown budget", async () => {
    const fetchMock = serve(() => 429, "3600");
    const result = crawl();
    await vi.runAllTimersAsync();
    expect(await result).toEqual({
      pagesCrawled: 1,
      completed: false,
      rateLimited: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.sleepUntil).not.toHaveBeenCalled();
    expect(mocks.releaseUrls.mock.calls[0][0]).toHaveLength(99);
  });

  it("stops at the platform subrequest limit and releases the frontier", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Too many subrequests."));
    const result = crawl(100);
    await vi.runAllTimersAsync();

    expect(await result).toEqual({
      pagesCrawled: 0,
      completed: false,
      subrequestLimited: true,
    });
    // The budget is shared by the whole invocation, so a second chunk would
    // fail the same way: stop after the first chunk's initial window.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.claimChunk).toHaveBeenCalledTimes(1);
    // Unfetched URLs are not recorded as site errors.
    expect(saved).toHaveLength(0);
    expect(mocks.releaseUrls.mock.calls[0][0]).toHaveLength(100);
  });

  it("keeps ordinary fetch failures as recorded site errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed"),
    );
    const result = crawl(10);
    await vi.runAllTimersAsync();

    expect(await result).toEqual({ pagesCrawled: 10, completed: true });
    expect(saved).toHaveLength(10);
    expect(saved.every((page) => page.fetchClass === "error")).toBe(true);
    expect(mocks.releaseUrls).not.toHaveBeenCalled();
  });
});

describe("rendering usage", () => {
  it("sums what every chunk rendered for the audit's one settlement", async () => {
    serve(() => 200);
    mocks.renderPage.mockImplementation(async (_url, { usage }) => {
      usage.cloudflareAttempts += 1;
      usage.contextCredits += 1;
      return { html: HTML, status: 200 };
    });
    // 250 pages take two chunks of at most 200.
    const run = crawl(250, true);
    await vi.runAllTimersAsync();
    await run;
    expect(renderUsage).toEqual({
      cloudflareAttempts: 250,
      contextCredits: 250,
    });
  });
});
