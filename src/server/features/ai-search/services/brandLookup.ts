import { waitUntil } from "cloudflare:workers";
import { sortBy } from "remeda";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseoClient";
import {
  buildLlmTarget,
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
  type LlmPlatform,
} from "@/server/lib/dataforseoLlm";
import type {
  LlmAggregatedTotal,
  LlmMentionItem,
  LlmTopPagesItem,
} from "@/server/lib/dataforseoLlmSchemas";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import { safeHostname, safeHttpUrl } from "@/server/features/ai-search/safeUrl";
import {
  brandLookupResultSchema,
  type BrandLookupInput,
  type BrandLookupResult,
} from "@/types/schemas/ai-search";
import { detectTarget } from "@/server/features/ai-search/targetDetection";

/**
 * Brand Lookup is the AI-search analog of Domain Overview. The user types a
 * brand name or domain; we hit DataForSEO's LLM Mentions API across ChatGPT
 * (US-only) and Google AI Overview, then shape the response into something
 * the UI can render directly. Stateless — no DB writes, R2 caching only.
 */

/** Brand lookup data refreshes daily; underlying API is updated monthly. */
const BRAND_LOOKUP_TTL_SECONDS = 24 * 60 * 60;

const PLATFORMS: LlmPlatform[] = ["chat_gpt", "google"];

const TOP_PAGES_PER_PLATFORM = 10;
const TOP_QUERIES_PER_PLATFORM = 25;

export async function getBrandLookup(
  input: BrandLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<BrandLookupResult> {
  const detected = detectTarget(input.query);

  const cacheKey = await buildCacheKey("ai-search:brand-lookup", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    targetType: detected.type,
    targetValue: detected.value,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = brandLookupResultSchema.safeParse(await getCached(cacheKey));
  if (cached.success) return cached.data;

  const dataforseo = createDataforseoClient(billingCustomer);

  // Settle each platform independently so a failure in one doesn't discard
  // the other (which the caller already paid for via meterDataforseoCall).
  const settled = await Promise.allSettled(
    PLATFORMS.map((platform) =>
      fetchPlatformData(platform, detected, input, dataforseo),
    ),
  );

  rethrowIfBlockingAiSearchError(settled);

  const platformBundles: PlatformOutcome[] = settled.map((settledResult, i) => {
    const platform = PLATFORMS[i];
    if (settledResult.status === "fulfilled") {
      return { platform, status: "success", bundle: settledResult.value };
    }
    console.error(
      `ai-search.brand-lookup.${platform}.error:`,
      settledResult.reason,
    );
    return { platform, status: "error", bundle: null };
  });

  const result = shapeResult({
    query: input.query,
    detected,
    platformBundles,
    userLocationCode: input.locationCode,
    userLanguageCode: input.languageCode,
  });

  // Only cache when every platform succeeded — otherwise users would see a
  // stale partial result for 24h and have no way to retry without busting it.
  const allSucceeded = platformBundles.every((b) => b.status === "success");
  if (allSucceeded && result.hasData) {
    waitUntil(
      setCached(cacheKey, result, BRAND_LOOKUP_TTL_SECONDS).catch((err) => {
        console.error("ai-search.brand-lookup.cache-write failed:", err);
      }),
    );
  }

  return result;
}

type PlatformFetchInput = Pick<
  BrandLookupInput,
  "locationCode" | "languageCode"
>;

type PlatformBundle = {
  aggregated: LlmAggregatedTotal;
  topPages: LlmTopPagesItem[];
  mentions: LlmMentionItem[];
};

type PlatformOutcome = {
  platform: LlmPlatform;
  status: "success" | "error";
  bundle: PlatformBundle | null;
};

async function fetchPlatformData(
  platform: LlmPlatform,
  detected: ReturnType<typeof detectTarget>,
  input: PlatformFetchInput,
  dataforseo: ReturnType<typeof createDataforseoClient>,
): Promise<PlatformBundle> {
  const target = buildLlmTarget({
    type: detected.type,
    value: detected.value,
  });

  // ChatGPT mentions DB only contains US/en data per DataForSEO docs.
  const locationCode =
    platform === "chat_gpt" ? CHATGPT_LOCATION_CODE : input.locationCode;
  const languageCode =
    platform === "chat_gpt" ? CHATGPT_LANGUAGE_CODE : input.languageCode;

  // `allSettled` so one sub-call failing doesn't discard the other two we
  // already paid for. Each sub-call is metered independently upstream.
  const [aggregated, topPages, mentions] = await Promise.allSettled([
    dataforseo.aiSearch.aggregatedMetrics({
      target,
      platform,
      locationCode,
      languageCode,
      internalListLimit: 20,
    }),
    dataforseo.aiSearch.topPages({
      target,
      platform,
      locationCode,
      languageCode,
      itemsListLimit: TOP_PAGES_PER_PLATFORM,
    }),
    dataforseo.aiSearch.mentionsSearch({
      target,
      platform,
      locationCode,
      languageCode,
      limit: TOP_QUERIES_PER_PLATFORM,
    }),
  ]);

  rethrowIfBlockingAiSearchError([aggregated, topPages, mentions]);

  // If every sub-call failed we have nothing to render for this platform —
  // reject so the outer `allSucceeded` gate refuses to cache a blank result.
  const allRejected =
    aggregated.status === "rejected" &&
    topPages.status === "rejected" &&
    mentions.status === "rejected";
  if (allRejected) throw aggregated.reason;

  return {
    aggregated: fulfilledOr(aggregated, () => ({}), platform, "aggregated"),
    topPages: fulfilledOr(topPages, () => [], platform, "topPages"),
    mentions: fulfilledOr(mentions, () => [], platform, "mentions"),
  };
}

function rethrowIfBlockingAiSearchError(
  results: Array<PromiseSettledResult<unknown>>,
): void {
  for (const result of results) {
    if (
      result.status === "rejected" &&
      result.reason instanceof AppError &&
      (result.reason.code === "INSUFFICIENT_CREDITS" ||
        result.reason.code === "AI_SEARCH_NOT_ENABLED" ||
        result.reason.code === "AI_SEARCH_BILLING_ISSUE")
    ) {
      throw result.reason;
    }
  }
}

function fulfilledOr<T>(
  result: PromiseSettledResult<T>,
  fallback: () => T,
  platform: LlmPlatform,
  label: string,
): T {
  if (result.status === "fulfilled") return result.value;
  console.error(
    `ai-search.brand-lookup.${platform}.${label}.error:`,
    result.reason,
  );
  return fallback();
}

type ShapeArgs = {
  query: string;
  detected: ReturnType<typeof detectTarget>;
  platformBundles: PlatformOutcome[];
  userLocationCode: number;
  userLanguageCode: string;
};

function shapeResult(args: ShapeArgs): BrandLookupResult {
  const successfulBundles = args.platformBundles.filter(
    (b): b is PlatformOutcome & { bundle: PlatformBundle } =>
      b.status === "success" && b.bundle !== null,
  );

  // ChatGPT data is always fetched US/en (DataForSEO only indexes that
  // locale), so when the user picks a non-US/en locale we must not fold its
  // numbers into cross-platform totals or the monthly trend — doing so would
  // mix two different datasets under one locale label. Per-platform rows
  // still render ChatGPT separately with the "US-only" tooltip.
  // Match the primary subtag so "en-US"/"en_US" still count as English.
  const primaryLanguage = args.userLanguageCode.toLowerCase().split(/[-_]/)[0];
  const chatGptLocaleMatches =
    args.userLocationCode === CHATGPT_LOCATION_CODE &&
    primaryLanguage === CHATGPT_LANGUAGE_CODE;

  const perPlatform = args.platformBundles.map((outcome) => {
    if (outcome.status === "error" || !outcome.bundle) {
      return {
        platform: outcome.platform,
        status: "error" as const,
        mentions: null,
        aiSearchVolume: null,
        impressions: null,
      };
    }
    const platformGroup = outcome.bundle.aggregated.platform?.find(
      (entry) => entry.key === outcome.platform,
    );
    return {
      platform: outcome.platform,
      status: "success" as const,
      mentions: roundOrNull(platformGroup?.mentions),
      aiSearchVolume: roundOrNull(platformGroup?.ai_search_volume),
      impressions: roundOrNull(platformGroup?.impressions),
    };
  });

  const aggregatablePlatforms = perPlatform.filter(
    (p) => chatGptLocaleMatches || p.platform !== "chat_gpt",
  );
  const totalMentions = sumNullable(
    aggregatablePlatforms.map((p) => p.mentions),
  );
  const totalAiSearchVolume = sumNullable(
    aggregatablePlatforms.map((p) => p.aiSearchVolume),
  );
  const totalImpressions = sumNullable(
    aggregatablePlatforms.map((p) => p.impressions),
  );

  const topPages = sortBy(
    successfulBundles.flatMap((bundle) =>
      bundle.bundle.topPages
        .map((page) => {
          const safeUrl = safeHttpUrl(page.key);
          if (!safeUrl) return null;
          return {
            url: safeUrl,
            domain: safeHostname(safeUrl),
            mentions: roundOrNull(
              page.platform?.find((entry) => entry.key === bundle.platform)
                ?.mentions,
            ),
            platform: bundle.platform,
          };
        })
        .filter((page): page is NonNullable<typeof page> => page !== null),
    ),
    [(page) => page.mentions ?? 0, "desc"],
  ).slice(0, 20);

  const topQueries = sortBy(
    successfulBundles.flatMap((bundle) =>
      bundle.bundle.mentions
        .filter(
          (item): item is LlmMentionItem & { question: string } =>
            typeof item.question === "string" && item.question.length > 0,
        )
        .map((item) => ({
          question: item.question,
          platform: bundle.platform,
          aiSearchVolume: roundOrNull(item.ai_search_volume),
          firstSeenAt: item.first_response_at ?? null,
          lastSeenAt: item.last_response_at ?? null,
          citedSources: (item.sources ?? [])
            .map((src) => {
              const safeUrl = safeHttpUrl(src.url);
              if (!safeUrl) return null;
              return {
                url: safeUrl,
                domain: src.domain ?? safeHostname(safeUrl),
                title: src.title ?? null,
              };
            })
            .filter((src): src is NonNullable<typeof src> => src !== null)
            .slice(0, 10),
          brandsMentioned: (item.brand_entities ?? [])
            .map((entity) => entity.title ?? "")
            .filter((title) => title.length > 0)
            .slice(0, 20),
        })),
    ),
    [(query) => query.aiSearchVolume ?? 0, "desc"],
  ).slice(0, 50);

  const trendBundles = chatGptLocaleMatches
    ? successfulBundles
    : successfulBundles.filter((b) => b.platform !== "chat_gpt");
  const monthlyVolume = aggregateMonthlyVolume(trendBundles);

  const hasData =
    (totalMentions ?? 0) > 0 ||
    topPages.length > 0 ||
    topQueries.length > 0 ||
    monthlyVolume.length > 0;

  return {
    query: args.query,
    detectedTargetType: args.detected.type,
    resolvedTarget: args.detected.value,
    fetchedAt: new Date().toISOString(),
    hasData,
    totalMentions,
    totalAiSearchVolume,
    totalImpressions,
    perPlatform,
    topPages,
    topQueries,
    monthlyVolume,
  };
}

function sumNullable(values: Array<number | null>): number | null {
  let total = 0;
  let hasValue = false;
  for (const value of values) {
    if (value != null) {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function roundOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Math.round(value);
}

/**
 * Sum monthly mention volume across all returned mention items, regardless of
 * platform. Returns the most recent 12 months in chronological order.
 */
function aggregateMonthlyVolume(
  bundles: Array<PlatformOutcome & { bundle: PlatformBundle }>,
): BrandLookupResult["monthlyVolume"] {
  const totals = new Map<string, number>();

  for (const outcome of bundles) {
    for (const mention of outcome.bundle.mentions) {
      for (const monthly of mention.monthly_searches ?? []) {
        if (monthly.search_volume == null) continue;
        const key = `${monthly.year}-${monthly.month}`;
        totals.set(key, (totals.get(key) ?? 0) + monthly.search_volume);
      }
    }
  }

  const entries = Array.from(totals.entries()).map(([key, volume]) => {
    const [yearStr, monthStr] = key.split("-");
    return {
      year: Number(yearStr),
      month: Number(monthStr),
      volume: Math.round(volume),
    };
  });

  return sortBy(
    entries,
    [(entry) => entry.year, "asc"],
    [(entry) => entry.month, "asc"],
  ).slice(-12);
}
