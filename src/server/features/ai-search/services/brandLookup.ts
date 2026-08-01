import { waitUntil } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  buildLlmTarget,
  CHATGPT_LANGUAGE_CODE,
  CHATGPT_LOCATION_CODE,
  type LlmPlatform,
} from "@/server/lib/dataforseo";
import type { LlmCrossAggregatedItem } from "@/server/lib/dataforseoLlmSchemas";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  resolveCompetitorGroups,
  type CompetitorGroup,
  type CrossOutcome,
} from "@/server/features/ai-search/services/shareOfVoice";
import {
  shapeResult,
  type PlatformBundle,
  type PlatformOutcome,
} from "@/server/features/ai-search/services/brandLookupShaping";
import {
  brandLookupResultSchema,
  type BrandLookupInput,
  type BrandLookupResult,
} from "@/types/schemas/ai-search";
import { detectTarget } from "@/shared/targetDetection";

/**
 * Brand Lookup is the AI-search analog of Domain Overview. The user types a
 * brand name or domain; we hit DataForSEO's LLM Mentions API across ChatGPT
 * (US-only) and Google AI Overview, then shape the response into something
 * the UI can render directly. Stateless — no DB writes, R2 caching only.
 */

/** Brand lookup data refreshes daily; underlying API is updated monthly. */
const BRAND_LOOKUP_TTL_SECONDS = 24 * 60 * 60;

const PLATFORMS: LlmPlatform[] = ["chat_gpt", "google"];

// Prompt rows supply explainable examples for cited pages. Ranked source rows
// come from top_pages so the table is not limited to this sample.
const MENTIONS_PER_PLATFORM = 100;
const TOP_SOURCES_PER_PLATFORM = 10;

export async function getBrandLookup(
  input: BrandLookupInput,
  billingCustomer: BillingCustomerContext,
): Promise<BrandLookupResult> {
  const detected = detectTarget(input.query);
  const competitorGroups = resolveCompetitorGroups(
    detected.value,
    input.competitors,
  );

  // Changing this key's param set orphans every pre-deploy cache entry; with a
  // 24h TTL that's at most one re-charged lookup per cached target — accepted
  // rather than maintaining parallel legacy-shape parsing.
  const cacheKey = await buildCacheKey("ai-search:brand-lookup", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    targetType: detected.type,
    // Values are lowercased for DataForSEO's matching semantics. Competitors
    // are canonical detected values too, so equivalent casing/order shares one
    // paid cache entry.
    targetValue: detected.value.toLowerCase(),
    competitors: competitorGroups
      .map((g) => g.detected.value.toLowerCase())
      .toSorted()
      .join("|"),
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cached = brandLookupResultSchema.safeParse(await getCached(cacheKey));
  if (cached.success) {
    return {
      ...cached.data,
      query: input.query,
      resolvedTarget: detected.value,
    };
  }

  const dataforseo = createDataforseoClient(billingCustomer);

  // Settle each platform independently so a failure in one doesn't discard the
  // other. Keep the metered DataForSEO calls sequenced: in hosted mode each
  // call checks balance before execution and records spend after, so parallel
  // fan-out can overrun a low remaining balance.
  const settled: Array<PromiseSettledResult<PlatformBundle>> = [];
  for (const platform of PLATFORMS) {
    settled.push(
      await settle(() =>
        fetchPlatformData(platform, detected, input, dataforseo),
      ),
    );
  }

  rethrowIfBlockingAiSearchError(settled);

  const crossSettled =
    competitorGroups.length > 0
      ? await settle(() =>
          fetchCrossAggregated(detected, competitorGroups, input, dataforseo),
        )
      : ({ status: "fulfilled", value: [] } as PromiseFulfilledResult<
          CrossOutcome[]
        >);
  if (crossSettled.status === "rejected") throw crossSettled.reason;
  const crossOutcomes = crossSettled.value;

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
    crossOutcomes,
    competitorKeys: competitorGroups.map((g) => g.label),
    userLocationCode: input.locationCode,
    userLanguageCode: input.languageCode,
  });

  // Only cache when every call succeeded — a platform bundle that swallowed a
  // failed sub-call into empty fallback data is renderable but must not be
  // frozen for 24h with no way to retry; same for a partial SoV miss when
  // competitors were requested.
  const allSucceeded =
    platformBundles.every(
      (b) => b.status === "success" && b.bundle?.complete,
    ) && crossOutcomes.every((c) => c.status === "success");
  if (allSucceeded && result.hasData) {
    waitUntil(
      setCached(cacheKey, result, BRAND_LOOKUP_TTL_SECONDS).catch((err) => {
        console.error("ai-search.brand-lookup.cache-write failed:", err);
      }),
    );
  }

  return result;
}

async function settle<T>(
  execute: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await execute() };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

type PlatformFetchInput = Pick<
  BrandLookupInput,
  "locationCode" | "languageCode"
>;

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

  // Settle sub-calls independently so one failure doesn't discard the others we
  // already paid for, but keep them sequenced for hosted billing checks.
  const aggregated = await settle(() =>
    dataforseo.aiSearch.aggregatedMetrics({
      target,
      platform,
      locationCode,
      languageCode,
      internalListLimit: 20,
    }),
  );
  const topPages = await settle(() =>
    dataforseo.aiSearch.topPages({
      target,
      platform,
      locationCode,
      languageCode,
      itemsListLimit: TOP_SOURCES_PER_PLATFORM,
    }),
  );
  const mentions = await settle(() =>
    dataforseo.aiSearch.mentionsSearch({
      target,
      platform,
      locationCode,
      languageCode,
      limit: MENTIONS_PER_PLATFORM,
    }),
  );

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
    complete:
      aggregated.status === "fulfilled" &&
      topPages.status === "fulfilled" &&
      mentions.status === "fulfilled",
  };
}

/**
 * One cross_aggregated_metrics call per platform (ChatGPT forced to US/en),
 * each comparing the target against the competitors. Settled per-platform so a
 * single failure doesn't discard the other — matching the per-platform
 * fan-out in {@link getBrandLookup}. The target's aggregation_key is the
 * resolved target value so SoV can flag the target row.
 */
async function fetchCrossAggregated(
  detected: ReturnType<typeof detectTarget>,
  competitors: CompetitorGroup[],
  input: PlatformFetchInput,
  dataforseo: ReturnType<typeof createDataforseoClient>,
): Promise<CrossOutcome[]> {
  const groups = [
    {
      key: detected.value,
      target: buildLlmTarget({ type: detected.type, value: detected.value }),
    },
    ...competitors.map((competitor) => ({
      key: competitor.label,
      target: buildLlmTarget({
        type: competitor.detected.type,
        value: competitor.detected.value,
      }),
    })),
  ];

  const settled: Array<PromiseSettledResult<LlmCrossAggregatedItem[]>> = [];
  for (const platform of PLATFORMS) {
    settled.push(
      await settle(() =>
        dataforseo.aiSearch.crossAggregatedMetrics({
          groups,
          platform,
          // ChatGPT mentions DB only contains US/en data per DataForSEO docs.
          locationCode:
            platform === "chat_gpt"
              ? CHATGPT_LOCATION_CODE
              : input.locationCode,
          languageCode:
            platform === "chat_gpt"
              ? CHATGPT_LANGUAGE_CODE
              : input.languageCode,
        }),
      ),
    );
  }

  rethrowIfBlockingAiSearchError(settled);

  return settled.map((result, i) => {
    const platform = PLATFORMS[i];
    if (result.status === "fulfilled") {
      return { platform, status: "success" as const, items: result.value };
    }
    console.error(
      `ai-search.brand-lookup.${platform}.cross-aggregated.error:`,
      result.reason,
    );
    return { platform, status: "error" as const, items: [] };
  });
}

function rethrowIfBlockingAiSearchError(
  results: Array<PromiseSettledResult<unknown>>,
): void {
  for (const result of results) {
    if (
      result.status === "rejected" &&
      result.reason instanceof AppError &&
      (result.reason.code === "INSUFFICIENT_CREDITS" ||
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
