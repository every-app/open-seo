import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 150_000;

/** @param {string | number} port */
export function scheduledUrl(port) {
  if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  const url = new URL(
    `http://127.0.0.1:${Number(port)}/cdn-cgi/handler/scheduled`,
  );
  url.searchParams.set("cron", "*/5 * * * *");
  url.searchParams.set("format", "json");
  return url;
}

/**
 * One call only. A timeout may have reached the handler, so do not retry it
 * immediately. The application's durable run guards protect scheduled work.
 * @param {string | number} port
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [options]
 */
export async function triggerScheduled(port, options = {}) {
  const url = scheduledUrl(port);
  const signal = options.signal ?? new AbortController().signal;
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      redirect: "manual",
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    /** @type {unknown} */
    const result = await response.json();
    return (
      typeof result === "object" &&
      result !== null &&
      "outcome" in result &&
      result.outcome === "ok"
    );
  } catch {
    return false;
  }
}

/** @param {number} ms @param {AbortSignal} signal */
async function sleep(ms, signal) {
  await delay(ms, undefined, { signal });
}

/**
 * Serial loop: never starts a second request while one is outstanding.
 * @param {{port: string | number, signal: AbortSignal, fetchImpl?: typeof fetch,
 * sleepImpl?: typeof sleep, log?: (message: string) => void}} options
 */
export async function runSelfhostScheduler(options) {
  const {
    port,
    signal,
    fetchImpl = fetch,
    sleepImpl = sleep,
    log = console.warn,
  } = options;
  const health = new URL("/api/health", scheduledUrl(port));
  let ready = false;
  for (let attempt = 0; attempt < 30 && !signal.aborted; attempt++) {
    try {
      const response = await fetchImpl(health, {
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });
      ready = response.ok;
      await response.body?.cancel().catch(() => undefined);
    } catch {
      /* Preview may still be starting. */
    }
    if (ready) break;
    await sleepImpl(2000, signal);
  }
  if (signal.aborted) return;
  if (!ready)
    throw new Error("Local preview did not become ready for scheduled work.");
  while (!signal.aborted) {
    const nextTick = Date.now() + INTERVAL_MS;
    const ok = await triggerScheduled(port, { signal, fetchImpl });
    if (!ok && !signal.aborted)
      log(
        "[scheduler] Local scheduled handler failed; retrying at the next five-minute tick.",
      );
    if (!signal.aborted)
      await sleepImpl(Math.max(0, nextTick - Date.now()), signal);
  }
}

async function serveWithScheduler() {
  const port = process.env.PORT ?? "3001";
  scheduledUrl(port); // Validate before spawning anything.
  const stop = new AbortController();
  const preview = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "0.0.0.0",
      "--port",
      port,
      "--strictPort",
    ],
    { stdio: "inherit" },
  );
  const shutdown = () => {
    stop.abort();
    preview.kill("SIGTERM");
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  preview.once("error", () => {
    console.error("[scheduler] Could not start local preview.");
    process.exitCode = 1;
    stop.abort();
  });
  preview.once("exit", (code) => {
    stop.abort();
    process.exitCode = process.exitCode || code || 0;
  });
  try {
    await runSelfhostScheduler({ port, signal: stop.signal });
  } catch {
    if (!stop.signal.aborted) {
      console.error("[scheduler] Local scheduler stopped unexpectedly.");
      process.exitCode = 1;
      shutdown();
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  serveWithScheduler().catch(() => {
    console.error("[scheduler] Could not start the local scheduler.");
    process.exitCode = 1;
  });
}
