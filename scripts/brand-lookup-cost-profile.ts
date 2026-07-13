import process from "node:process";
import {
  fetchLlmAggregatedMetrics,
  fetchLlmCrossAggregatedMetrics,
  fetchLlmMentionsSearch,
  fetchLlmTopPages,
} from "@/server/lib/dataforseo/ai";
import {
  buildLlmTarget,
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
  type LlmPlatform,
} from "@/server/lib/dataforseo/shared";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { resolveCompetitorGroups } from "@/server/features/ai-search/services/shareOfVoice";
import { parseCompetitorList } from "@/types/schemas/ai-search";
import { loadLocalEnv, parseArgs } from "./cli-utils";

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));

await main();

/**
 * Confirm what a single Brand Lookup actually costs against DataForSEO.
 * Mirrors `backlinks-cost-profile.ts` but reports per-call USD cost so we can
 * verify the on-screen "Est. $X" against reality.
 */
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

  if (!process.env.DATAFORSEO_API_KEY) {
    printUsageAndExit("Missing DATAFORSEO_API_KEY.");
  }

  const target = args.target;
  if (!target) {
    printUsageAndExit("Missing --target.");
  }

  const targetType = parseTargetType(args.targetType);
  const userLocationCode = parsePositiveInteger(args.locationCode, 2840);
  const userLanguageCode = args.languageCode ?? "en";
  const repeat = parsePositiveInteger(args.repeat, 1);
  // Optional comma-separated competitors — adds the Share of Voice
  // cross_aggregated_metrics call per platform, mirroring the service.
  const competitors = parseCompetitorList(args.competitors ?? "");
  const competitorGroups = resolveCompetitorGroups(target, competitors);

  const llmTarget = buildLlmTarget({ type: targetType, value: target });
  const crossGroups = [
    { key: target, target: llmTarget },
    ...competitorGroups.map((competitor) => {
      const detected = competitor.detected;
      return {
        key: competitor.label,
        target: buildLlmTarget({ type: detected.type, value: detected.value }),
      };
    }),
  ];
  const platforms: LlmPlatform[] = ["chat_gpt", "google"];

  const allRuns: RunSummary[] = [];

  for (let runIndex = 0; runIndex < repeat; runIndex += 1) {
    const calls: CallRecord[] = [];

    for (const platform of platforms) {
      // ChatGPT data is only indexed for US/en, mirroring the production
      // brandLookup service.
      const locationCode =
        platform === "chat_gpt" ? CHATGPT_LOCATION_CODE : userLocationCode;
      const languageCode =
        platform === "chat_gpt" ? CHATGPT_LANGUAGE_CODE : userLanguageCode;

      const aggregated = await fetchLlmAggregatedMetrics({
        target: llmTarget,
        platform,
        locationCode,
        languageCode,
        internalListLimit: 20,
      });
      calls.push(toRecord(platform, "aggregated_metrics", aggregated.billing));

      const topPages = await fetchLlmTopPages({
        target: llmTarget,
        platform,
        locationCode,
        languageCode,
        itemsListLimit: 10,
      });
      calls.push(toRecord(platform, "top_pages", topPages.billing));

      // Prompt rows provide examples for the cited-source table.
      const mentions = await fetchLlmMentionsSearch({
        target: llmTarget,
        platform,
        locationCode,
        languageCode,
        limit: 100,
      });
      calls.push(toRecord(platform, "mentions_search", mentions.billing));

      if (competitorGroups.length > 0) {
        const cross = await fetchLlmCrossAggregatedMetrics({
          groups: crossGroups,
          platform,
          locationCode,
          languageCode,
        });
        calls.push(
          toRecord(platform, "cross_aggregated_metrics", cross.billing),
        );
      }
    }

    const totalRawUsd = sum(calls.map((c) => c.rawUsd));
    const crossRawUsd = sum(
      calls
        .filter((c) => c.endpoint === "cross_aggregated_metrics")
        .map((c) => c.rawUsd),
    );
    allRuns.push({
      run: runIndex + 1,
      calls,
      // Split out so the base "Est. $X" and the "+$Y to compare competitors"
      // UI constants can each be checked against reality.
      baseRawUsd: round(totalRawUsd - crossRawUsd),
      crossRawUsd: round(crossRawUsd),
      totalRawUsd: round(totalRawUsd),
      totalBilledUsd: applyBillingMarkupUsd(totalRawUsd),
    });
  }

  const aggregateRawUsd = sum(allRuns.map((r) => r.totalRawUsd));
  const aggregateBilledUsd = applyBillingMarkupUsd(aggregateRawUsd);

  console.log(
    JSON.stringify(
      {
        input: {
          target,
          targetType,
          userLocationCode,
          userLanguageCode,
          competitors: competitorGroups.map((group) => group.label),
          repeat,
        },
        runs: allRuns,
        aggregate: {
          totalRawUsd: round(aggregateRawUsd),
          totalBilledUsd: aggregateBilledUsd,
          avgRawPerLookupUsd: round(aggregateRawUsd / allRuns.length),
          avgBilledPerLookupUsd: round(aggregateBilledUsd / allRuns.length),
        },
      },
      null,
      2,
    ),
  );
}

type CallRecord = {
  platform: LlmPlatform;
  endpoint: string;
  path: string;
  rawUsd: number;
  billedUsd: number;
};

type RunSummary = {
  run: number;
  calls: CallRecord[];
  baseRawUsd: number;
  crossRawUsd: number;
  totalRawUsd: number;
  totalBilledUsd: number;
};

function toRecord(
  platform: LlmPlatform,
  endpoint: string,
  billing: { costUsd: number; path: string[] },
): CallRecord {
  return {
    platform,
    endpoint,
    path: billing.path.join("/"),
    rawUsd: round(billing.costUsd),
    billedUsd: applyBillingMarkupUsd(billing.costUsd),
  };
}

function parseTargetType(value: string | undefined): "domain" | "keyword" {
  if (!value || value === "domain") return "domain";
  if (value === "keyword") return "keyword";
  printUsageAndExit(
    `Invalid --targetType: ${value}. Expected domain or keyword.`,
  );
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error(
    "Usage: pnpm billing:brand-lookup --target=example.com --confirmLive=true [--targetType=domain|keyword] [--competitors=a.com,b.com] [--locationCode=2840] [--languageCode=en] [--repeat=1] [--allowCi=true]",
  );
  process.exit(1);
}
