/* eslint-disable max-lines */
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { fetchKeywordMetricsForList } from "@/server/lib/dataforseo";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { getProviderFeatureFlags } from "../config";
import { persistCompetitorSnapshot } from "../competitor-snapshot-repository";
import { DomainOverviewSnapshotRepository } from "../domain-overview-snapshot-repository";
import { recordDataforseoFallback } from "../cost-tracker";
import {
  ProviderUnsupportedError,
  ProviderUnavailableError,
  AuthenticationError,
  RateLimitError,
} from "../errors";
import { AppError } from "@/server/lib/errors";
import type { SEODataProvider, SEODataRequest } from "../types";

// Input shape of client.labs.serpCompetitors, derived so the constraints
// passthrough below stays in sync with the SDK without importing its internals.
type SerpCompetitorsInput = Parameters<
  ReturnType<typeof createDataforseoClient>["labs"]["serpCompetitors"]
>[0];

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
 * Which keyword-idea endpoint a `keyword_ideas` request should hit. Feature
 * services (KeywordResearchService) set this via `constraints.source` to run
 * their related/suggestions/ideas waterfall (and the Google-Ads-only location
 * branch) through the DataRouter instead of calling the client directly.
 * Defaults to "ideas" for plain keyword-expansion requests.
 */
export type KeywordIdeasSource =
  | "ideas"
  | "suggestions"
  | "related"
  | "google_ads";

/**
 * Translate the research-source constraint into the matching client call.
 * Returns the raw SDK items — mapping to app rows lives in the feature module
 * (research-data.ts) so intent normalization and trend mapping stay in one
 * place. `related` keeps its deeper wrapper (items have `keyword_data`);
 * callers unwrap it. `google_ads` (countries Labs doesn't cover) calls
 * keywords_for_keywords via `client.keywords.adsIdeas`.
 */
async function keywordIdeasBySource(
  client: ReturnType<typeof createDataforseoClient>,
  request: SEODataRequest,
  keyword: string,
  locationCode: number,
  languageCode: string,
): Promise<unknown> {
  const c = request.constraints ?? {};
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
  const source = (c.source as KeywordIdeasSource | undefined) ?? "ideas";
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
  const limit = (c.limit as number | undefined) ?? 100;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
  const includeClickstreamData = c.includeClickstreamData as
    | boolean
    | undefined;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CreditFeature is a string union
  const creditFeature = request.creditFeature as CreditFeature | undefined;

  switch (source) {
    case "google_ads":
      return client.keywords.adsIdeas({
        keyword,
        locationCode,
        languageCode,
        limit,
        creditFeature,
      });
    case "related":
      return client.keywords.related({
        keyword,
        locationCode,
        languageCode,
        limit,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
        depth: c.depth as number | undefined,
        includeClickstreamData,
        creditFeature,
      });
    case "suggestions":
      return client.keywords.suggestions({
        keyword,
        locationCode,
        languageCode,
        limit,
        includeClickstreamData,
        creditFeature,
      });
    case "ideas":
      return client.keywords.ideas({
        keyword,
        locationCode,
        languageCode,
        limit,
        includeClickstreamData,
        creditFeature,
      });
  }
}

/**
 * Build the paginated/filtered backlinks request the DataForSEO provider
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
  creditFeature?: CreditFeature,
): Parameters<
  ReturnType<typeof createDataforseoClient>["backlinks"]["rows"]
>[0] {
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
    // Spam-filter passthrough: only forwarded when the caller set them, so
    // the backlinks fetchers keep applying their own defaults otherwise.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    ...(c.hideSpam !== undefined ? { hideSpam: c.hideSpam as boolean } : {}),
    ...(c.spamThreshold !== undefined
      ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
        { spamThreshold: c.spamThreshold as number }
      : {}),
    ...(creditFeature ? { creditFeature } : {}),
  };
}

/**
 * Build the granular domain request the DataForSEO client expects from a
 * router request. Feature services (DomainService, MCP tools) supply
 * limit/offset/orderBy/filters/includeSubdomains via `constraints`;
 * creditFeature rides on the request itself so spend is attributed without
 * widening the provider inputs.
 */
function domainLabsRequest(
  domain: string,
  request: SEODataRequest,
  locationCode: number,
  languageCode: string,
) {
  const c = request.constraints ?? {};
  return {
    target: domain,
    locationCode,
    languageCode,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    limit: (c.limit as number | undefined) ?? 100,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    offset: c.offset as number | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    orderBy: c.orderBy as string[] | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    filters: c.filters as unknown[] | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    includeSubdomains: c.includeSubdomains as boolean | undefined,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CreditFeature is a string union
    creditFeature: request.creditFeature as CreditFeature | undefined,
  };
}

/**
 * Route a `backlinks` request to the matching client call. Feature services
 * (BacklinksService) supply the granular call mode plus pagination/filter/sort
 * options via `constraints`; the summary endpoint is the default for simple
 * overview use.
 */
async function routeBacklinksRequest(
  client: ReturnType<typeof createDataforseoClient>,
  request: SEODataRequest,
  domain: string,
): Promise<unknown> {
  const mode =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    (request.constraints?.backlinkCall as BacklinkCall | undefined) ??
    "summary";
  const creditFeature =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CreditFeature is a string union
    (request.creditFeature ?? "backlinks") as CreditFeature;

  switch (mode) {
    case "summary":
      return client.backlinks.summary({
        target: domain,
        creditFeature,
      });
    case "history": {
      const dateFrom =
        request.dateFrom ??
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
        (request.constraints?.dateFrom as string | undefined) ??
        "";
      const dateTo =
        request.dateTo ??
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
        (request.constraints?.dateTo as string | undefined) ??
        "";
      return client.backlinks.history({
        target: domain,
        dateFrom,
        dateTo,
        creditFeature,
      });
    }
    case "rows":
      return client.backlinks.rows(
        backlinksListRequest(domain, request, creditFeature),
      );
    case "referring_domains":
      return client.backlinks.referringDomains(
        backlinksListRequest(domain, request, creditFeature),
      );
    case "domain_pages":
      return client.backlinks.domainPages(
        backlinksListRequest(domain, request, creditFeature),
      );
    default:
      throw new ProviderUnsupportedError(
        "dataforseo",
        "backlinks",
        `unknown backlink call mode: ${String(mode)}`,
      );
  }
}

/**
 * Route domain-scoped requests (domain_keywords / domain_overview /
 * domain_pages) to the matching Labs client call. Feature services supply
 * granular pagination/filter/sort options via request constraints.
 */
async function routeDomainRequest(
  client: ReturnType<typeof createDataforseoClient>,
  request: SEODataRequest,
  domain: string,
  locationCode: number,
  languageCode: string,
): Promise<unknown> {
  switch (request.dataType) {
    case "domain_keywords":
      return client.domain.rankedKeywords(
        domainLabsRequest(domain, request, locationCode, languageCode),
      );
    case "domain_overview":
      return fetchAndPersistDomainOverview(
        client,
        request,
        domain,
        locationCode,
        languageCode,
      );
    case "domain_pages":
      return client.domain.relevantPages(
        domainLabsRequest(domain, request, locationCode, languageCode),
      );
    default:
      throw new ProviderUnsupportedError(
        "dataforseo",
        request.dataType,
        `DataForSEO does not support ${request.dataType}`,
      );
  }
}

async function fetchAndPersistDomainOverview(
  client: ReturnType<typeof createDataforseoClient>,
  request: SEODataRequest,
  domain: string,
  locationCode: number,
  languageCode: string,
): Promise<unknown> {
  const items = await client.domain.rankOverview({
    target: domain,
    locationCode,
    languageCode,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CreditFeature is a string union
    creditFeature: request.creditFeature as CreditFeature | undefined,
  });
  const organic = items[0]?.metrics?.organic;

  try {
    await DomainOverviewSnapshotRepository.insert({
      organizationId: request.billingCustomer.organizationId,
      domain,
      locationCode,
      languageCode,
      organicTraffic: organic?.etv ?? null,
      organicKeywords: organic?.count ?? null,
    });
  } catch (error) {
    console.error("seo-data.domain-overview-snapshot.write-through:", error);
  }

  return items;
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
        case "domain_overview":
        case "domain_pages":
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

      const client = createDataforseoClient(request.billingCustomer);

      try {
        const result = await routeByDataType(client, request);
        recordDataforseoFallback();
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
      return keywordIdeasBySource(
        client,
        request,
        keyword,
        locationCode,
        languageCode,
      );

    case "keyword_metrics": {
      const kws =
        request.keywords ?? (request.keyword ? [request.keyword] : []);
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
      return fetchKeywordMetricsForList(client, {
        keywords: kws,
        locationCode,
        languageCode,
        includeClickstreamData:
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
          (request.constraints?.includeClickstreamData as
            | boolean
            | undefined) ?? false,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CreditFeature is a string union
        creditFeature: (request.creditFeature ??
          "keyword_research") as CreditFeature,
      });
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
    case "domain_overview":
    case "domain_pages":
      if (!domain) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          request.dataType,
          "domain is required",
        );
      }
      return routeDomainRequest(
        client,
        request,
        domain,
        locationCode,
        languageCode,
      );

    case "competitors": {
      const keywords =
        request.keywords ?? (request.keyword ? [request.keyword] : []);
      if (keywords.length === 0) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "competitors",
          "keywords are required",
        );
      }
      const constraints = request.constraints ?? {};
      const items = await client.labs.serpCompetitors({
        keywords,
        locationCode,
        languageCode,
        itemTypes:
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraint values are validated by the caller
          constraints.itemTypes as SerpCompetitorsInput["itemTypes"],
        includeSubdomains:
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraint values are validated by the caller
          constraints.includeSubdomains as boolean | undefined,
        limit:
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraint values are validated by the caller
          (constraints.limit as number | undefined) ?? 50,
        offset:
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraint values are validated by the caller
          constraints.offset as number | undefined,
      });

      // Write-through to D1 so the internal provider can serve the next
      // identical analysis for free. Persistence is best-effort: a snapshot
      // that fails to write must not fail the already-paid fetch.
      const projectId = constraints.projectId;
      if (typeof projectId === "string") {
        try {
          await persistCompetitorSnapshot({
            projectId,
            keywords,
            locationCode,
            languageCode,
            items,
          });
        } catch (error) {
          console.error("seo-data.competitor-snapshot.write-through:", error);
        }
      }

      return items;
    }

    case "backlinks": {
      if (!domain) {
        throw new ProviderUnsupportedError(
          "dataforseo",
          "backlinks",
          "domain is required",
        );
      }
      return routeBacklinksRequest(client, request, domain);
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
