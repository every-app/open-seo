import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runSelfhostScheduler,
  scheduledUrl,
  triggerScheduled,
} from "../../../scripts/selfhost-scheduler.mjs";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("Docker local scheduler", () => {
  it("targets only the configured loopback port and app cron without overriding time", () => {
    const url = scheduledUrl("3001");
    expect(url.origin).toBe("http://127.0.0.1:3001");
    expect(url.pathname).toBe("/cdn-cgi/handler/scheduled");
    expect(url.searchParams.get("cron")).toBe("*/5 * * * *");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.has("time")).toBe(false);
    for (const port of [
      "3001/elsewhere",
      "https://external.test",
      "0",
      "65536",
      "-1",
    ])
      expect(() => scheduledUrl(port)).toThrow("PORT must be an integer");
  });
  it("does not follow redirects or accept HTTP200 without a successful scheduled outcome", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302 }))
      .mockResolvedValueOnce(Response.json({ outcome: "exception" }))
      .mockResolvedValueOnce(Response.json({ outcome: "ok", noRetry: false }));
    expect(await triggerScheduled(3001, { fetchImpl })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("manual");
    expect(await triggerScheduled(3001, { fetchImpl })).toBe(false);
    expect(await triggerScheduled(3001, { fetchImpl })).toBe(true);
  });
  it("waits for preview readiness before starting any scheduled work", async () => {
    const stop = new AbortController();
    const sleepImpl = vi.fn(async (ms: number) => {
      if (ms === 300000) stop.abort();
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("starting"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ outcome: "ok" }));
    await runSelfhostScheduler({
      port: 3001,
      signal: stop.signal,
      fetchImpl,
      sleepImpl,
    });
    const paths = fetchImpl.mock.calls.map(([url]) =>
      url instanceof URL ? url.pathname : "invalid",
    );
    expect(paths).toEqual([
      "/api/health",
      "/api/health",
      "/api/health",
      "/cdn-cgi/handler/scheduled",
    ]);
    expect(sleepImpl.mock.calls.map(([ms]) => ms)).toEqual([
      2000, 2000, 300000,
    ]);
  });
  it("keeps one scheduled request in flight and retries failures only at the next tick", async () => {
    const stop = new AbortController();
    let finish: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockReturnValueOnce(pending);
    const sleepImpl = vi.fn(async () => {
      stop.abort();
    });
    const log = vi.fn();
    const running = runSelfhostScheduler({
      port: 3001,
      signal: stop.signal,
      fetchImpl,
      sleepImpl,
      log,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(sleepImpl).not.toHaveBeenCalled();
    finish?.(new Response("provider-secret", { status: 500 }));
    await running;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[scheduler] Local scheduled handler failed; retrying at the next five-minute tick.",
    );
  });
  it("bounds startup retries and stops immediately on cancellation", async () => {
    const stop = new AbortController();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private env details"));
    const sleepImpl = vi.fn(async () => {});
    await expect(
      runSelfhostScheduler({
        port: 3001,
        signal: stop.signal,
        fetchImpl,
        sleepImpl,
      }),
    ).rejects.toThrow("Local preview did not become ready");
    expect(fetchImpl).toHaveBeenCalledTimes(30);
    stop.abort();
    fetchImpl.mockClear();
    await runSelfhostScheduler({
      port: 3001,
      signal: stop.signal,
      fetchImpl,
      sleepImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
