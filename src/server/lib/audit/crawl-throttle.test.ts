import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCrawlThrottle } from "@/server/lib/audit/crawl-throttle";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const URL_A = "https://example.com/a";
const URL_B = "https://example.com/b";
const URL_C = "https://example.com/c";
const URL_D = "https://example.com/d";

describe("createCrawlThrottle", () => {
  it("keeps oversized Retry-After values finite even with overlapping refusals", async () => {
    const throttle = createCrawlThrottle(90_000);
    await Promise.all([
      throttle.backoff(URL_A, "9".repeat(310)),
      throttle.backoff(URL_B, "60"),
    ]);
    expect(throttle.stopped).toBe(true);
    expect(
      Object.values(throttle.state)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite),
    ).toBe(true);
    expect(await throttle.ready()).toBe(false);
  });

  it("waits for cooldown persistence before allowing another request", async () => {
    let save: () => void = vi.fn();
    const throttle = createCrawlThrottle(
      90_000,
      undefined,
      () =>
        new Promise<void>((resolve) => {
          save = resolve;
        }),
    );
    const backoff = throttle.backoff(URL_A, "1");
    await vi.advanceTimersByTimeAsync(0);
    let started = false;
    const request = throttle.ready().then(() => {
      started = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(started).toBe(false);
    save();
    await backoff;
    await request;
    expect(started).toBe(true);
  });

  it("spaces simultaneous request starts instead of releasing a burst", async () => {
    const throttle = createCrawlThrottle(90_000);
    const starts: number[] = [];
    const requests = Promise.all(
      Array.from({ length: 5 }, async () => {
        if (await throttle.ready()) starts.push(Date.now());
      }),
    );
    await vi.runAllTimersAsync();
    await requests;
    expect(starts).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
  });

  it("pauses for thirty seconds on the first 429 and spaces retries", async () => {
    const throttle = createCrawlThrottle(90_000);
    expect(await throttle.ready()).toBe(true);
    expect(await throttle.backoff(URL_A, null)).toBe(true);
    const starts: number[] = [];
    const requests = Promise.all(
      Array.from({ length: 3 }, async () => {
        if (await throttle.ready()) starts.push(Date.now());
      }),
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(starts).toEqual([]);
    await vi.runAllTimersAsync();
    await requests;
    expect(starts).toEqual([30_000, 32_000, 34_000]);
  });

  it("rechecks a cooldown extended while requests are waiting", async () => {
    const throttle = createCrawlThrottle(90_000);
    await throttle.backoff(URL_A, "5");
    const starts: number[] = [];
    const request = throttle.ready().then(() => starts.push(Date.now()));
    await vi.advanceTimersByTimeAsync(4_000);
    await throttle.backoff(URL_B, "10");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(starts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await request;
    expect(starts).toEqual([14_000]);
  });

  it.each(["60", "Thu, 01 Jan 1970 00:01:00 GMT"])(
    "honors Retry-After: %s",
    async (header) => {
      const throttle = createCrawlThrottle(90_000);
      await throttle.backoff(URL_A, header);
      let started = false;
      const request = throttle.ready().then(() => {
        started = true;
      });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await request;
      expect(started).toBe(true);
    },
  );

  // Shopify's Retry-After outlasts most of a chunk, so the retry usually
  // happens in the next one, after other pages have been served in between.
  it("gives a URL one retry across chunks and served pages, then gives it up", async () => {
    let throttle = createCrawlThrottle(90_000);
    expect(await throttle.backoff(URL_A, "60")).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    throttle = createCrawlThrottle(Date.now() + 90_000, throttle.state);
    await throttle.recovered(URL_B);
    expect(await throttle.backoff(URL_A, "60")).toBe(false);
    expect(throttle.stopped).toBe(false);
  });

  it("stops after three URLs are given up on with nothing served between", async () => {
    const throttle = createCrawlThrottle(90_000);
    for (const url of [URL_A, URL_B]) {
      await throttle.refuse(url, "1");
      await vi.advanceTimersByTimeAsync(1_000);
    }
    await throttle.recovered(URL_C);
    for (const url of [URL_C, URL_D]) {
      await throttle.refuse(url, "1");
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(throttle.stopped).toBe(false);
    await throttle.refuse(URL_A, "1");
    expect(throttle.stopped).toBe(true);
  });

  it("returns to normal pacing after twenty served pages, counted across chunks", async () => {
    let throttle = createCrawlThrottle(90_000);
    for (const url of [URL_A, URL_B, URL_C, URL_D]) {
      await throttle.backoff(url, "1");
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(throttle.state.intervalMs).toBe(10_000);
    for (let i = 0; i < 9; i++) await throttle.recovered(URL_A);
    throttle = createCrawlThrottle(Date.now() + 90_000, throttle.state);
    for (let i = 0; i < 11; i++) await throttle.recovered(URL_A);
    expect(throttle.state.intervalMs).toBe(1_000);
  });

  it("defers a ten-minute wait without marking the audit stopped", async () => {
    const throttle = createCrawlThrottle(90_000);
    expect(await throttle.backoff(URL_A, "600")).toBe(true);
    expect(await throttle.ready()).toBe(false);
    expect(throttle.stopped).toBe(false);
    expect(throttle.state.pausedUntil).toBe(600_000);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    const resumed = createCrawlThrottle(690_000, throttle.state);
    expect(await resumed.ready()).toBe(true);
  });

  it("preserves request spacing across a chunk boundary", async () => {
    const first = createCrawlThrottle(90_000);
    await first.ready();
    const second = createCrawlThrottle(90_000, first.state);
    let startedAt = -1;
    const request = second.ready().then(() => {
      startedAt = Date.now();
    });
    await vi.runAllTimersAsync();
    await request;
    expect(startedAt).toBe(1_000);
  });

  it("does not label an ordinary chunk deadline as a rate-limit stop", async () => {
    const throttle = createCrawlThrottle(90_000);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(await throttle.ready()).toBe(false);
    expect(throttle.stopped).toBe(false);
  });

  it("stops once two hours of waiting have accrued, served pages included, without retrying early", async () => {
    let throttle = createCrawlThrottle(90_000);
    expect(await throttle.backoff(URL_A, "4000")).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000_000);
    await throttle.recovered(URL_A);
    throttle = createCrawlThrottle(Date.now() + 90_000, throttle.state);
    expect(await throttle.backoff(URL_B, "4000")).toBe(false);
    expect(await throttle.ready()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
