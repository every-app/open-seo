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

/**
 * Supervise the local preview. The scheduler is optional: when it stops, the
 * preview keeps serving, because the preview is what runs the app. Killing the
 * preview here would restart the container and take the app offline.
 * @param {{
 *   port?: string | number,
 *   spawnPreview?: (command: string, args: string[], options: { stdio: "inherit" }) => NodeJS.EventEmitter & { kill: (signal?: NodeJS.Signals) => boolean },
 *   runScheduler?: (options: { port: string | number, signal: AbortSignal }) => Promise<void>,
 *   log?: (message: string) => void,
 * }} [options]
 */
export async function serveWithScheduler(options = {}) {
  const {
    port = process.env.PORT ?? "3001",
    spawnPreview = spawn,
    runScheduler = runSelfhostScheduler,
    log = console.error,
  } = options;
  scheduledUrl(port); // Validate before spawning anything.
  const stop = new AbortController();
  const preview = spawnPreview(
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
  const exited = new Promise((resolve) => {
    preview.once("exit", (code) => {
      stop.abort();
      process.exitCode = process.exitCode || code || 0;
      resolve(code);
    });
    preview.once("error", () => {
      log("[scheduler] Could not start local preview.");
      process.exitCode = 1;
      stop.abort();
      resolve();
    });
  });
  try {
    await runScheduler({ port, signal: stop.signal });
  } catch {
    if (!stop.signal.aborted)
      log(
        "[scheduler] Local scheduler stopped unexpectedly; the preview keeps serving.",
      );
  }
  await exited;
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
