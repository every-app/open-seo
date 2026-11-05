import { waitUntil } from "cloudflare:workers";
import { SERP_ANALYSIS_DEPTH } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { SerpResultItem } from "@/types/keywords";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { normalizeKeyword } from "./helpers";
import { assertLocalResearchLocation } from "./local-volume";
import { readMergedSerps, type MergedSerpItem } from "./serpReads";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

type SerpAnalysisReason = "no_organic_results";

type SerpAnalysisResult = {
  requestedKeyword: string;
  items: SerpResultItem[];
  /** SERP depth this snapshot was crawled at — how deep the results go. */
  depth: number;
  reason?: SerpAnalysisReason;
};

const serpResultItemSchema = z.object({
  rank: z.number().int(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  description: z.string(),
  etv: z.number().nullable(),
  estimatedPaidTrafficCost: z.number().nullable(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  isNew: z.boolean(),
  rankChange: z.number().nullable(),
});

const serpCacheSchema = z.object({
  requestedKeyword: z.string(),
  items: z.array(serpResultItemSchema),
  // Entries written before depth was tracked don't say how deep they went, so
  // they're treated as the shallow floor: worst case a user re-buys a deeper
  // crawl once, rather than being shown a shallow list as if it went to 100.
  depth: z.number().int().default(SERP_ANALYSIS_DEPTH),
  reason: z.enum(["no_organic_results"]).optional(),
});

function mapOrganicSerpItems(items: MergedSerpItem[]): SerpResultItem[] {
  return items
    .filter((item) => item.type === "organic")
    .map((item, index) => ({
      // The merged order: the panel doesn't surface the separate reads.
      rank: index + 1,
      title: item.title ?? "",
      url: item.url ?? "",
      domain: item.domain ?? "",
      description: item.description ?? "",
      etv: item.etv ?? null,
      estimatedPaidTrafficCost: item.estimated_paid_traffic_cost ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      isNew: false,
      rankChange: null,
    }));
}

async function getSerpLiveAnalysis(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth: number;
    locationName?: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpAnalysisResult> {
  const keyword = normalizeKeyword(input.keyword);
  const { depth } = input;
  if (input.locationName) {
    await assertLocalResearchLocation(input.locationCode, input.locationName);
  }

  const cacheKey = await buildCacheKey("serp:analysis", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    locationName: input.locationName,
  });

  // Depth lives in the cached value, not the key: DataForSEO has no offset, so
  // a deeper crawl re-fetches the head too. A depth-100 snapshot therefore also
  // answers shallower requests, and a deeper request replaces the entry rather
  // than appending to it.
  const cachedRaw = await getCached(cacheKey);
  const cached = serpCacheSchema.safeParse(cachedRaw);
  if (cached.success && cached.data.depth >= depth) {
    return cached.data;
  }

  const [outcome] = await readMergedSerps(billingCustomer, [
    {
      query: {
        keyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        locationName: input.locationName,
        depth,
      },
      receiptKey: await buildCacheKey("serp:analysis-reads", {
        organizationId: billingCustomer.organizationId,
        projectId: input.projectId,
        keyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        locationName: input.locationName,
        depth,
      }),
    },
  ]);
  if (outcome.status === "failed") throw outcome.error;
  if (outcome.status === "processing") {
    // Retrying collects the same reads at no charge.
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "These search results are taking longer than usual.",
    );
  }

  const items = mapOrganicSerpItems(outcome.items);
  const result: SerpAnalysisResult = {
    requestedKeyword: keyword,
    items,
    depth,
  };
  if (items.length === 0) {
    result.reason = "no_organic_results";
  }

  // DataForSEO reports "no results" transiently, and a deeper crawl overwrites
  // the same key. Without this guard one empty re-crawl would evict a good
  // snapshot and, being the deeper entry, answer every shallower request with
  // nothing for the rest of the TTL.
  if (items.length === 0 && cached.success && cached.data.items.length > 0) {
    return result;
  }

  // waitUntil, not void: workerd cancels unregistered pending I/O once the
  // response is sent, so a fire-and-forget put never persists the cache.
  waitUntil(
    setCached(cacheKey, result, SERP_CACHE_TTL_SECONDS).catch((error) => {
      console.error("keywords.serp.cache-write failed:", error);
    }),
  );

  return result;
}

export const getSerpAnalysis = getSerpLiveAnalysis;
