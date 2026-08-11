import { type SerpLiveItem } from "@/server/lib/dataforseo";
import type { SerpResultItem } from "@/types/keywords";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getSeoDataRouter } from "@/server/lib/seo-data";
import { normalizeKeyword } from "./helpers";

type SerpAnalysisReason = "no_organic_results";

type SerpAnalysisResult = {
  requestedKeyword: string;
  items: SerpResultItem[];
  reason?: SerpAnalysisReason;
};

function mapOrganicSerpItems(items: SerpLiveItem[]): SerpResultItem[] {
  return items
    .filter((item) => item.type === "organic")
    .map((item) => ({
      rank: item.rank_group ?? item.rank_absolute ?? 0,
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
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpAnalysisResult> {
  const keyword = normalizeKeyword(input.keyword);

  // Caching and single-flight live in the router; the trimmed organic-only
  // mapping below stays a cheap per-call transform.
  const { data } = await getSeoDataRouter().route<SerpLiveItem[]>({
    dataType: "serp",
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    billingCustomer,
  });

  const items = mapOrganicSerpItems(data);
  const result: SerpAnalysisResult = { requestedKeyword: keyword, items };
  if (items.length === 0) {
    result.reason = "no_organic_results";
  }

  return result;
}

export const getSerpAnalysis = getSerpLiveAnalysis;
