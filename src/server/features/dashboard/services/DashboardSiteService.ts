import { sort } from "remeda";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { DashboardCacheService } from "./DashboardCacheService";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { mapBacklinksRows } from "@/server/features/backlinks/services/backlinksRowMappers";
import {
  referringDomainItemSchema,
  backlinksItemSchema,
} from "@/server/lib/dataforseo/backlinks";
import {
  GscService,
  isExpectedGrantFailure,
  GscNotConnectedError,
} from "@/server/features/gsc/services/GscService";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";

const querySchema = z.object({
  query: z.string(),
  clicks: z.number(),
  impressions: z.number(),
  position: z.number(),
});
const queriesSchema = z.object({
  connected: z.boolean(),
  hasSearchData: z.boolean(),
  rows: z.array(querySchema),
  startDate: z.string(),
  endDate: z.string(),
  baselineStartDate: z.string(),
});

async function getBacklinks(
  input: { domain: string; kind: "new" | "lost" | "all" },
  billingCustomer: BillingCustomerContext,
) {
  const result = await DashboardCacheService.readThrough({
    namespace: "dashboard:links",
    organizationId: billingCustomer.organizationId,
    params: input,
    schema: z.array(backlinksItemSchema),
    maxAgeMs: 86400_000,
    load: async () => {
      const target = normalizeBacklinksTarget(input.domain, {
        scope: "subdomains",
      });
      const from = new Date(Date.now() - 7 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const response = await createDataforseoClient(
        billingCustomer,
      ).backlinks.rows({
        target: target.apiTarget,
        includeSubdomains: true,
        limit: 25,
        mode: "one_per_domain",
        status: input.kind === "lost" ? "lost" : "live",
        hideSpam: false,
        orderBy: [input.kind === "lost" ? "last_seen,desc" : "first_seen,desc"],
        filters:
          input.kind === "all"
            ? undefined
            : [
                [
                  input.kind === "lost" ? "last_seen" : "first_seen",
                  ">=",
                  `${from} 00:00:00 +00:00`,
                ],
              ],
      });
      return response.items;
    },
  });
  return { ...result, value: mapBacklinksRows(result.value) };
}

async function getKeywords(projectId: string, organizationId: string) {
  const { startDate, endDate } = resolveDateRange({
    dateRange: "last_28_days",
  });
  const connection = await GscConnectionRepository.getByProjectId(projectId);
  if (!connection)
    return {
      value: { connected: false, rows: [], startDate, endDate },
      fetchedAt: new Date().toISOString(),
      stale: false,
      refreshError: null,
    };
  return DashboardCacheService.readThrough({
    namespace: "dashboard:gsc-keywords-v2",
    organizationId,
    params: {
      projectId,
      siteUrl: connection.siteUrl,
      accountId: connection.gscAccountId,
      updatedAt: connection.updatedAt,
    },
    schema: z.object({
      connected: z.boolean(),
      rows: z.array(querySchema),
      startDate: z.string(),
      endDate: z.string(),
    }),
    maxAgeMs: 86400_000,
    load: async () => {
      try {
        const result = await GscService.getPerformance({
          projectId,
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 25000,
          dataState: "final",
        });
        return {
          connected: true,
          rows: result.rows
            .filter((row) => row.keys?.[0])
            .map((row) => ({
              query: row.keys![0],
              clicks: row.clicks,
              impressions: row.impressions,
              position: row.position,
            })),
          startDate,
          endDate,
        };
      } catch (error) {
        if (
          error instanceof GscNotConnectedError ||
          isExpectedGrantFailure(error)
        )
          return { connected: false, rows: [], startDate, endDate };
        throw error;
      }
    },
  });
}

async function getEmergingQueries(projectId: string, organizationId: string) {
  const { endDate } = resolveDateRange({ dateRange: "last_7_days" });
  const startDate = new Date(Date.parse(endDate) - 6 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const baselineEndDate = new Date(Date.parse(startDate) - 86400_000)
    .toISOString()
    .slice(0, 10);
  const baselineStartDate = new Date(Date.parse(startDate) - 28 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const connection = await GscConnectionRepository.getByProjectId(projectId);
  if (!connection) {
    return {
      value: {
        connected: false,
        hasSearchData: false,
        rows: [],
        startDate,
        endDate,
        baselineStartDate,
      },
      fetchedAt: new Date().toISOString(),
      stale: false,
      refreshError: null,
    };
  }
  return DashboardCacheService.readThrough({
    namespace: "dashboard:emerging-queries",
    organizationId,
    params: {
      projectId,
      siteUrl: connection.siteUrl,
      accountId: connection.gscAccountId,
      updatedAt: connection.updatedAt,
      comparison: "verified-v3",
    },
    schema: queriesSchema,
    maxAgeMs: 86400_000,
    load: async () => {
      try {
        const [recent, baseline] = await Promise.all([
          GscService.getPerformance({
            projectId,
            startDate,
            endDate,
            dimensions: ["query"],
            rowLimit: 25000,
            dataState: "final",
          }),
          GscService.getPerformance({
            projectId,
            startDate: baselineStartDate,
            endDate: baselineEndDate,
            dimensions: ["query"],
            rowLimit: 25000,
            dataState: "final",
          }),
        ]);
        const seen = new Set(baseline.rows.map((row) => row.keys?.[0]));
        const observed = recent.rows
          .filter(
            (row) =>
              row.keys?.[0] && row.impressions >= 10 && !seen.has(row.keys[0]),
          )
          .map((row) => ({
            query: row.keys![0],
            clicks: row.clicks,
            impressions: row.impressions,
            position: row.position,
          }));
        const rows = sort(
          observed,
          (a, b) => b.impressions - a.impressions,
        ).slice(0, 25);
        // A full baseline page may omit older low-click queries. Verify each
        // candidate directly rather than presenting pagination gaps as growth.
        const verified: typeof rows = [];
        if (baseline.rows.length === 25000) {
          for (let offset = 0; offset < rows.length; offset += 5) {
            const batch = rows.slice(offset, offset + 5);
            const history = await Promise.all(
              batch.map((row) =>
                GscService.getPerformance({
                  projectId,
                  startDate: baselineStartDate,
                  endDate: baselineEndDate,
                  dimensions: ["query"],
                  filters: [
                    {
                      dimension: "query",
                      operator: "equals",
                      expression: row.query,
                    },
                  ],
                  rowLimit: 1,
                  dataState: "final",
                }),
              ),
            );
            batch.forEach((row, index) => {
              if (
                !history[index].rows.some(
                  (previous) => previous.impressions > 0,
                )
              )
                verified.push(row);
            });
          }
        } else verified.push(...rows);
        return {
          connected: true,
          hasSearchData: recent.rows.length > 0,
          rows: verified,
          startDate,
          endDate,
          baselineStartDate,
        };
      } catch (error) {
        if (
          error instanceof GscNotConnectedError ||
          isExpectedGrantFailure(error)
        )
          return {
            connected: false,
            hasSearchData: false,
            rows: [],
            startDate,
            endDate,
            baselineStartDate,
          };
        throw error;
      }
    },
  });
}

async function getLinkActivity(
  domain: string,
  billingCustomer: BillingCustomerContext,
) {
  const target = normalizeBacklinksTarget(domain, {
    scope: "subdomains",
  }).apiTarget;
  const domains = await DashboardCacheService.readThrough({
    namespace: "dashboard:new-domains",
    organizationId: billingCustomer.organizationId,
    params: { target },
    schema: z.array(referringDomainItemSchema),
    maxAgeMs: 86400_000,
    load: async () => {
      const from = new Date(Date.now() - 7 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const response = await createDataforseoClient(
        billingCustomer,
      ).backlinks.referringDomains({
        target,
        includeSubdomains: true,
        limit: 25,
        hideSpam: false,
        orderBy: ["first_seen,desc"],
        filters: [["first_seen", ">=", `${from} 00:00:00 +00:00`]],
      });
      return response.items;
    },
  });
  // Stale domain results must not trigger a second charge or pretend the week is quiet.
  if (domains.value.length || domains.stale)
    return {
      ...domains,
      value: domains.value.map((row) => ({
        domain: row.domain ?? null,
        backlinks: row.backlinks ?? null,
        firstSeen: row.first_seen ?? null,
      })),
      kind: "domains" as const,
      links: [],
    };
  const links = await getBacklinks({ domain, kind: "new" }, billingCustomer);
  return { ...links, value: [], kind: "links" as const, links: links.value };
}

export const DashboardSiteService = {
  getKeywords,
  getBacklinks,
  getEmergingQueries,
  getLinkActivity,
};
