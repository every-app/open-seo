import { createDataforseoClient } from "@/server/lib/dataforseo";
import { fetchKeywordMetricsForList } from "@/server/lib/dataforseo";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { getProviderFeatureFlags } from "../config";
import {
  isDataforseoBudgetAvailable,
  recordDataforseoCall,
} from "../cost-tracker";
import {
  BudgetExceededError,
  ProviderUnsupportedError,
  ProviderUnavailableError,
  AuthenticationError,
  RateLimitError,
} from "../errors";
import { AppError } from "@/server/lib/errors";
import type { SEODataProvider, SEODataRequest } from "../types";

/**
 * Which backlinks endpoint a `backlinks` request should call. Feature services
 * (BacklinksService) set this via `constraints.backlinkCall` to route paginated
 * / filtered / sorted backlinks requests through the DataRouter instead of
 * calling the DataForSEO client directly.
 */
export type BacklinkCall =
  | "summary"
  | "history"
  | "rows"
  | "referring_domains"
  | "domain_pages";

/**
 * Build the paginated/filtered backlinks request the DataForSEO client
 * expects from a router request. The service layer supplies limit/offset/
 * orderBy/filters/mode via `constraints`; defaults keep the call cheap.
 */
function backlinksListRequest(
  domain: string,
  request: SEODataRequest,
): Parameters<ReturnType<typeof createDataforseoClient>["backlinks"]["rows"]>[0] {
  const c = request.constraints ?? {};
  return {
    target: domain,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    limit: (c.limit as number | undefined) ?? 100,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    offset: c.offset as number | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    orderBy: c.orderBy as string[] | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    filters: c.filters as unknown[] | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    mode: c.mode as string | undefined,
  };
}

/**
 * DataForSEO fallback provider — the paid last resort.
 *
 * Wraps the existing `createDataforseoClient` (which handles billing/metering).
 * Only called when:
 *   1. Cache miss
 *   2. Free/internal provider cannot satisfy the request
 *   3. DataForSEO supports the request
 *
 * Enforces the budget guard before every call. Records cost/metrics after.
 */
export function createDataforseoProvider(): SEODataProvider {
  return {
    name: "dataforseo",

    supports(request: SEODataRequest): boolean {
      switch (request.dataType) {
        case "keyword_ideas":
        case "keyword_metrics":
        case "serp":
        case "domain_keywords":
        case "competitors":
        case "backlinks":
        case "site_audit":
          return true;
        case "search_console":
        case "bing_search_performance":
          // DataForSEO is NOT a fallback for first-party GSC/Bing data
          return false;
        default:
          return false;
      }
    },

    async get(request: SEODataRequest): Promise<unknown> {
      const flags = await getProviderFeatureFlags();
      if (!flags.dataforseoEnabled) {
        throw new ProviderUnavailableError(
          "dataforseo",
          "DataForSEO is disabled (DATAFORSEO_ENABLED=false)",
        );
      }

      // Budget guard — never call DataForSEO if budget is exceeded
      const budgetAvailable = await isDataforseoBudgetAvailable();
      if (!budgetAvailable) {
        throw new BudgetExceededError("daily", 0, 0);
      }

      const client = createDataforseoClient(request.billingCustomer);

      try {
        const result = await routeByDataType(client, request);
        // Record the call (cost tracking; the metered client handles actual
        // billing in hosted mode)
        recordDataforseoCall(0, "no_free_provider");
        return result;
      } catch (error) {
        // Translate AppErrors from the DataForSEO client into provider errors
        if (error instanceof AppError) {
          if (error.code === "DATAFORSEO_AUTH_FAILED") {
            throw new AuthenticationError("dataforseo", error.message);
          }
          if (error.code === "RATE_LIMITED") {
            throw new RateLimitError("dataforseo", error.message);
          }
          if (error.code === "UPSTREAM_UNAVAILABLE") {
            throw new ProviderUnavailableError("dataforseo", error.message);
          }
          throw error;
        }
        throw error;
      }
    },
  };
}

/**
 * Route the request to the appropriate DataForSEO client method based on
 * the data type. This is the only place where DataForSEO methods are called
 * through the router — all provider selection logic is centralized in the
 * DataRouter, and the DataForSEO provider just maps data types to SDK calls.
 */
async function routeByDataType(
  client: ReturnType<typeof createDataforseoClient>,
  request: SEODataRequest,
): Promise<unknown> {
  const keyword = request.keyword;
  const domain = request.domain;
  const locationCode = request.locationCode ?? 2840;
  const languageCode = request.languageCode ?? "en";

  switch (request.dataType) {
    case "keyword_ideas":
      if (!keyword) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "keyword_ideas",
          "keyword is required",
        );
      }
      return client.keywords.ideas({
        keyword,
        locationCode,
        languageCode,
        limit: 100,
      });

    case "keyword_metrics": {
      const kws =
        request.keywords ??
        (request.keyword ? [request.keyword] : []);
      if (kws.length === 0) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "keyword_metrics",
          "keyword or keywords is required",
        );
      }
      // Use fetchKeywordMetricsForList so the result is normalized into
      // KeywordMetricRow[] (camelCase fields) — matching what callers
      // (including the MCP tool) expect. Raw labs.keywordOverview returns
      // SDK items with snake_case nested fields.
      return fetchKeywordMetricsForList(
        client,
        {
          keywords: kws,
          locationCode,
          languageCode,
          includeClickstreamData:
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
            (request.constraints?.includeClickstreamData as boolean | undefined) ??
            false,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CreditFeature is a string union
          creditFeature: (request.creditFeature ?? "keyword_research") as CreditFeature,
        },
      );
    }

    case "serp":
      if (!keyword) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "serp",
          "keyword is required",
        );
      }
      return client.serp.live({
        keyword,
        locationCode,
        languageCode,
      });

    case "domain_keywords":
      if (!domain) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "domain_keywords",
          "domain is required",
        );
      }
      return client.domain.rankedKeywords({
        target: domain,
        locationCode,
        languageCode,
        limit: 100,
      });

    case "competitors":
      if (!domain) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "competitors",
          "domain is required",
        );
      }
      return client.labs.serpCompetitors({
        keywords: [keyword ?? ""].filter(Boolean),
        locationCode,
        languageCode,
        limit: 50,
      });

    case "backlinks": {
      if (!domain) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "backlinks",
          "domain is required",
        );
      }
      // Granular backlink call mode and pagination/filter/sort options are
      // passed through via constraints by feature services (BacklinksService).
      // Default to the summary endpoint for simple overview use.
      const mode =
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
        (request.constraints?.backlinkCall as BacklinkCall | undefined) ??
        "summary";
      switch (mode) {
        case "summary":
          return client.backlinks.summary({ target: domain });
        case "history": {
          const dateFrom =
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
            (request.constraints?.dateFrom as string | undefined) ?? "";
          const dateTo =
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
            (request.constraints?.dateTo as string | undefined) ?? "";
          return client.backlinks.history({
            target: domain,
            dateFrom,
            dateTo,
          });
        }
        case "rows":
          return client.backlinks.rows(backlinksListRequest(domain, request));
        case "referring_domains":
          return client.backlinks.referringDomains(
            backlinksListRequest(domain, request),
          );
        case "domain_pages":
          return client.backlinks.domainPages(
            backlinksListRequest(domain, request),
          );
        default:
          throw new ProviderUnsupportedError(
            "dataforseo",
            "backlinks",
            `unknown backlink call mode: ${String(mode)}`,
          );
      }
    }

    case "site_audit":
      if (!request.url) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "site_audit",
          "url is required",
        );
      }
      return client.lighthouse.live({
        url: request.url,
        strategy: request.device === "mobile" ? "mobile" : "desktop",
      });

    default:
      throw new ProviderUnsupportedError(
        "dataforseo",
        request.dataType,
        `DataForSEO does not support ${request.dataType}`,
      );
  }
}