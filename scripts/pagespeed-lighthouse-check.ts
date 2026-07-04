import process from "node:process";
import { fetchPagespeedLighthouse } from "@/server/lib/pagespeedLighthousePayload";
import { loadLocalEnv, parseArgs } from "./cli-utils";

/**
 * Exercises the PageSpeed Insights Lighthouse path exactly as the site audit
 * does (same module, same concurrency queue, same parsing), without running a
 * crawl or touching DataForSEO.
 *
 * Usage:
 *   pnpm pagespeed:check --url=https://openseo.so
 *   pnpm pagespeed:check --url=https://openseo.so/,https://openseo.so/docs/skills
 *   pnpm pagespeed:check --url=https://openseo.so --strategy=mobile
 *   pnpm pagespeed:check --url=... --sequential=true   # one run at a time
 *
 * By default every URL runs on both strategies, all fired at once, which is
 * the same burst shape as an audit's Lighthouse batch, and each run retries
 * up to 3 attempts with backoff exactly like the audit does (PSI is slow and
 * occasionally errors under load; pass --attempts=1 to see raw single-shot
 * behavior). Requires PAGESPEED_API_KEY in the environment or .env.local /
 * .env (free key:
 * https://developers.google.com/speed/docs/insights/v5/get-started).
 */

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));

await main();

async function main() {
  if (!process.env.PAGESPEED_API_KEY?.trim()) {
    printUsageAndExit(
      "PAGESPEED_API_KEY is not set. Add it to .env.local (free key: https://developers.google.com/speed/docs/insights/v5/get-started).",
    );
  }

  const urls = (args.url ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    printUsageAndExit("Pass at least one URL via --url=https://example.com");
  }

  const strategies: Array<"mobile" | "desktop"> =
    args.strategy === "mobile"
      ? ["mobile"]
      : args.strategy === "desktop"
        ? ["desktop"]
        : ["mobile", "desktop"];

  const runs = urls.flatMap((url) =>
    strategies.map((strategy) => ({ url, strategy })),
  );
  console.log(
    `Running ${runs.length} Lighthouse check(s) via PageSpeed Insights` +
      `${args.sequential === "true" ? " (sequential)" : ""}...\n`,
  );

  const startedAt = Date.now();
  let results: Array<{ ok: boolean; line: string }>;
  if (args.sequential === "true") {
    results = [];
    for (const run of runs) {
      results.push(await checkOne(run));
    }
  } else {
    // Fire everything at once: the module's internal queue caps how many
    // requests actually reach PSI in parallel, mirroring an audit batch.
    results = await Promise.all(runs.map((run) => checkOne(run)));
  }

  console.log(`\n${"-".repeat(72)}`);
  const failed = results.filter((result) => !result.ok).length;
  console.log(
    `${results.length - failed}/${results.length} succeeded in ${elapsedSince(startedAt)}.`,
  );
  if (failed > 0) {
    console.log(
      "PSI occasionally fails individual runs; the audit retries each URL up to 3 times with backoff.",
    );
    process.exitCode = 1;
  }
}

async function checkOne(run: {
  url: string;
  strategy: "mobile" | "desktop";
}): Promise<{ ok: boolean; line: string }> {
  // Same retry shape as the audit's Lighthouse phase: up to 3 attempts with
  // 2s/4s backoff, so the result reflects what an audit would actually get.
  const maxAttempts = Math.max(1, Number(args.attempts ?? "3") || 3);
  const startedAt = Date.now();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 2000 * Math.pow(2, attempt - 2)),
      );
    }
    try {
      const payload = await fetchPagespeedLighthouse(run);
      const { performance, accessibility, seo } = payload.scores;
      const bestPractices = payload.scores["best-practices"];
      const line =
        `OK   ${run.strategy.padEnd(7)} ${run.url} ` +
        `perf=${performance} a11y=${accessibility} bp=${bestPractices} seo=${seo} ` +
        `(${elapsedSince(startedAt)}, attempt ${attempt}/${maxAttempts}, lighthouse ${payload.metadata.lighthouseVersion ?? "?"})`;
      console.log(line);
      return { ok: true, line };
    } catch (error) {
      lastError = error;
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  const line = `FAIL ${run.strategy.padEnd(7)} ${run.url} (${elapsedSince(startedAt)}, ${maxAttempts} attempts) ${message}`;
  console.log(line);
  return { ok: false, line };
}

function elapsedSince(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function printUsageAndExit(message: string): never {
  console.error(`\n${message}\n`);
  console.error(
    "Usage: pnpm pagespeed:check --url=https://example.com[,https://example.com/page] [--strategy=mobile|desktop] [--sequential=true] [--attempts=1]",
  );
  process.exit(1);
}
