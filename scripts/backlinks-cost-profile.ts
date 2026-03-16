import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { createBacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import type { BacklinksLookupInput } from "@/types/schemas/backlinks";

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));
const inMemoryCache = new Map<string, string>();
const service = createBacklinksService({
  async get(key) {
    const raw = inMemoryCache.get(key);
    return raw ? parseCachedValue(raw) : null;
  },
  async set(key, data) {
    inMemoryCache.set(key, JSON.stringify(data));
  },
});

await main();

async function main() {
  if (process.env.CI === "true" && args.allowCi !== "true") {
    printUsageAndExit(
      "Refusing to run live billing checks in CI without --allowCi=true.",
    );
  }

  if (args.confirmLive !== "true") {
    printUsageAndExit(
      "This command makes live, billable DataForSEO requests. Re-run with --confirmLive=true.",
    );
  }

  const input = buildInput(args);
  const repeat = parsePositiveInteger(args.repeat, 1);
  const includeTabs = parseBoolean(args.includeTabs, true);
  const runs = [];

  for (let index = 0; index < repeat; index += 1) {
    const overview = await service.profileOverview(input);
    const domains = includeTabs
      ? await service.profileReferringDomains(input)
      : null;
    const pages = includeTabs ? await service.profileTopPages(input) : null;

    runs.push({
      run: index + 1,
      overview: {
        fromCache: overview.billing.fromCache,
        totalCostUsd: overview.billing.totalCostUsd,
        calls: overview.billing.calls,
      },
      domainsTab: domains
        ? {
            fromCache: domains.billing.fromCache,
            totalCostUsd: domains.billing.totalCostUsd,
            calls: domains.billing.calls,
          }
        : null,
      pagesTab: pages
        ? {
            fromCache: pages.billing.fromCache,
            totalCostUsd: pages.billing.totalCostUsd,
            calls: pages.billing.calls,
          }
        : null,
      fullyExploredCostUsd: roundUsd(
        overview.billing.totalCostUsd +
          (domains?.billing.totalCostUsd ?? 0) +
          (pages?.billing.totalCostUsd ?? 0),
      ),
    });
  }

  console.log(
    JSON.stringify(
      {
        input,
        repeat,
        includeTabs,
        runs,
      },
      null,
      2,
    ),
  );
}

function buildInput(cliArgs: Record<string, string>): BacklinksLookupInput {
  const target = cliArgs.target;
  if (!target) {
    printUsageAndExit("Missing target.");
  }
  if (!process.env.DATAFORSEO_API_KEY) {
    printUsageAndExit("Missing DATAFORSEO_API_KEY.");
  }

  return {
    target,
    includeSubdomains: parseBoolean(cliArgs.subdomains, true),
    includeIndirectLinks: parseBoolean(cliArgs.indirect, true),
    excludeInternalBacklinks: parseBoolean(cliArgs.excludeInternal, true),
    status: parseStatus(cliArgs.status),
  };
}

function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const withoutPrefix = token.slice(2);
    const separatorIndex = withoutPrefix.indexOf("=");
    if (separatorIndex >= 0) {
      parsed[withoutPrefix.slice(0, separatorIndex)] = withoutPrefix.slice(
        separatorIndex + 1,
      );
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[withoutPrefix] = "true";
      continue;
    }

    parsed[withoutPrefix] = next;
    index += 1;
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  return value === "true";
}

function parseStatus(
  value: string | undefined,
): BacklinksLookupInput["status"] {
  if (value === "live" || value === "lost" || value === "all") {
    return value;
  }
  return "live";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadLocalEnv() {
  for (const path of [".env.local", ".env"]) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key]) continue;

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function roundUsd(value: number) {
  return Math.round(value * 100000) / 100000;
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error(
    "Usage: pnpm billing:backlinks --target=example.com --confirmLive=true [--status=live|lost|all] [--subdomains=true|false] [--indirect=true|false] [--excludeInternal=true|false] [--repeat=1] [--includeTabs=true|false] [--allowCi=true]",
  );
  process.exit(1);
}

function parseCachedValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
