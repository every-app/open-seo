import { z } from "zod";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  buildSeoOpportunities,
  type SeoOpportunity,
} from "@/server/features/gsc/seoOpportunities";
import { GscService, GscNotConnectedError } from "@/server/features/gsc/services/GscService";
import { previousPeriod } from "@/server/features/gsc/searchPerformanceReport";
import { hasSelfHostedGscConfig } from "@/server/features/gsc/oauth-config";
import { GSC_DATE_RANGES, resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { GscApiError, GscTokenError } from "@/server/lib/gscClient";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  dateRange: z
    .enum(["last_7_days", "last_28_days", "last_3_months"])
    .optional()
    .describe("Analysis window for GSC-backed opportunities (default last_28_days)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of opportunities to return (default 15)."),
} as const;

type FindSeoOpportunitiesArgs = z.infer<z.ZodObject<typeof inputSchema>>;

const opportunitySchema = z.object({
  type: z.enum([
    "striking_distance",
    "low_ctr",
    "declining_page",
    "technical_issue",
    "weak_internal_links",
  ]),
  priority: z.number(),
  impact: z.enum(["high", "medium", "low"]),
  confidence: z.enum(["high", "medium", "low"]),
  source: z.enum(["google_search_console", "site_audit"]),
  measurement: z.enum(["measured", "inferred"]),
  page: z.string().optional(),
  query: z.string().optional(),
  title: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  metrics: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
});

function textSummary(opportunities: SeoOpportunity[], notes: string[]): string {
  if (opportunities.length === 0) {
    const base = "No evidence-backed SEO opportunities were found from the currently available free-first sources.";
    return notes.length > 0 ? `${base}\n${notes.join("\n")}` : base;
  }

  const lines = opportunities.slice(0, 12).map((item, index) => {
    const target = item.query
      ? `${item.query} → ${item.page ?? "(no page)"}`
      : (item.page ?? "(no page)");
    return `${index + 1}. [${item.type}] ${target} | ${item.title}`;
  });
  return [
    `Found ${opportunities.length} evidence-backed SEO opportunities from free-first sources.`,
    ...lines,
    ...notes,
  ].join("\n");
}

function describeGscFailure(error: unknown): string {
  if (error instanceof GscNotConnectedError) {
    return "Search Console is not connected for this project.";
  }
  if (error instanceof GscTokenError) {
    return "Search Console access expired or was revoked.";
  }
  if (error instanceof GscApiError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export const findSeoOpportunitiesTool = {
  name: "find_seo_opportunities",
  config: {
    title: "Find SEO opportunities",
    description:
      "Combines free-first Google Search Console performance data with the latest local site audit to surface the most actionable SEO opportunities: queries close to page one, low-CTR pages, declining pages, weak internal-link support, and technical issues. Read-only and cost-free.",
    inputSchema,
    outputSchema: {
      ok: z.boolean(),
      dateRange: z.object({ startDate: z.string(), endDate: z.string() }),
      summary: z.object({ total: z.number(), byType: z.record(z.string(), z.number()) }),
      opportunities: z.array(opportunitySchema),
      providers: z.object({
        google_search_console: z.object({ ok: z.boolean(), reason: z.string().optional() }),
        site_audit: z.object({ ok: z.boolean(), reason: z.string().optional(), auditId: z.string().optional() }),
      }),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: FindSeoOpportunitiesArgs, context) => {
    const limit = args.limit ?? 15;
    const resolvedRange = resolveDateRange({ dateRange: args.dateRange ?? "last_28_days" });
    const prevRange = previousPeriod(resolvedRange.startDate, resolvedRange.endDate);
    const notes: string[] = [];

    const providers = {
      google_search_console: { ok: false as boolean, reason: undefined as string | undefined },
      site_audit: { ok: false as boolean, reason: undefined as string | undefined, auditId: undefined as string | undefined },
    };

    let currentQueryPageRows: Awaited<ReturnType<typeof GscService.getPerformance>>["rows"] = [];
    let currentPageRows: Awaited<ReturnType<typeof GscService.getPerformance>>["rows"] = [];
    let previousPageRows: Awaited<ReturnType<typeof GscService.getPerformance>>["rows"] = [];

    const [hosted, gscConfigured] = await Promise.all([
      isHostedServerAuthMode(),
      hasSelfHostedGscConfig(),
    ]);

    if (!hosted && !gscConfigured) {
      providers.google_search_console.reason =
        "Search Console OAuth is not configured on this self-hosted deployment.";
      notes.push(`GSC unavailable: ${providers.google_search_console.reason}`);
    } else {
      try {
        const [queryPage, currentPages, previousPages] = await Promise.all([
          GscService.getPerformance({
            projectId: args.projectId,
            dimensions: ["query", "page"],
            startDate: resolvedRange.startDate,
            endDate: resolvedRange.endDate,
            rowLimit: 1000,
          }),
          GscService.getPerformance({
            projectId: args.projectId,
            dimensions: ["page"],
            startDate: resolvedRange.startDate,
            endDate: resolvedRange.endDate,
            rowLimit: 1000,
          }),
          GscService.getPerformance({
            projectId: args.projectId,
            dimensions: ["page"],
            startDate: prevRange.startDate,
            endDate: prevRange.endDate,
            rowLimit: 1000,
          }),
        ]);
        currentQueryPageRows = queryPage.rows;
        currentPageRows = currentPages.rows;
        previousPageRows = previousPages.rows;
        providers.google_search_console.ok = true;
      } catch (error) {
        providers.google_search_console.reason = describeGscFailure(error);
        notes.push(`GSC unavailable: ${providers.google_search_console.reason}`);
      }
    }

    let auditIssues: Awaited<ReturnType<typeof AuditRepository.getIssuesForAudit>> = [];
    let auditPages: Awaited<ReturnType<typeof AuditRepository.getPagesForAudit>> = [];
    const latestAudit = await AuditRepository.getLatestAuditForProject(args.projectId);
    if (!latestAudit) {
      providers.site_audit.reason = "No site audit exists for this project yet.";
      notes.push(`Site audit unavailable: ${providers.site_audit.reason}`);
    } else {
      providers.site_audit.ok = true;
      providers.site_audit.auditId = latestAudit.id;
      auditIssues = await AuditRepository.getIssuesForAudit(latestAudit.id, {});
      auditPages = await AuditRepository.getPagesForAudit(latestAudit.id);
    }

    const result = buildSeoOpportunities({
      currentQueryPageRows,
      currentPageRows,
      previousPageRows,
      auditIssues,
      auditPages,
      limit,
    });

    return mcpResponse({
      text: textSummary(result.opportunities, notes),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/search-performance`,
      ),
      structuredContent: {
        ok: providers.google_search_console.ok || providers.site_audit.ok,
        dateRange: resolvedRange,
        summary: result.summary,
        opportunities: result.opportunities,
        providers,
      },
    });
  }),
};
