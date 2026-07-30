import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { LIGHTHOUSE_CATEGORIES } from "@/shared/lighthouse";
import {
  PagespeedService,
  PagespeedNotConfiguredError,
} from "@/server/features/pagespeed/services/PagespeedService";
import {
  formatCls,
  formatMs,
  formatScoreWithDelta,
  historyByUrl,
  PAGESPEED_STRATEGY_VALUES,
  type PagespeedSnapshotLike,
} from "@/shared/pagespeed";

/** One monitored URL's latest result, flattened for the table and the
 *  structured payload. */
type PagespeedRow = {
  url: string;
  strategy: string;
  performance: string;
  accessibility: string;
  bestPractices: string;
  seo: string;
  labLcp: string;
  labCls: string;
  labTbt: string;
  fieldLcp: string;
  fieldInp: string;
  fieldCls: string;
  fieldVerdict: string;
  fieldSource: string | null;
  runAt: string;
  trigger: string;
  nextRun: string | null;
  dailyRun: string;
  error: string | null;
};

const COLUMNS: McpTableColumn<PagespeedRow>[] = [
  { header: "url", value: (row) => row.url },
  { header: "perf", value: (row) => row.performance },
  { header: "a11y", value: (row) => row.accessibility },
  { header: "best-pr", value: (row) => row.bestPractices },
  { header: "seo", value: (row) => row.seo },
  { header: "lab LCP", value: (row) => row.labLcp },
  { header: "lab CLS", value: (row) => row.labCls },
  { header: "lab TBT", value: (row) => row.labTbt },
  { header: "field LCP", value: (row) => row.fieldLcp },
  { header: "field INP", value: (row) => row.fieldInp },
  { header: "field CLS", value: (row) => row.fieldCls },
  { header: "CWV", value: (row) => row.fieldVerdict },
  { header: "run at", value: (row) => row.runAt },
  { header: "trigger", value: (row) => row.trigger },
  { header: "next run", value: (row) => row.nextRun ?? "—" },
  { header: "daily", value: (row) => row.dailyRun },
];

function buildRow(
  url: string,
  entry: {
    snapshot: PagespeedSnapshotLike;
    previous: PagespeedSnapshotLike | null;
  },
  nextRunAt: string | null,
  scheduleEnabled: boolean,
): PagespeedRow {
  const { snapshot, previous } = entry;
  const fieldVerdict = snapshot.fieldOverallCategory
    ? snapshot.fieldSource === "origin"
      ? `${snapshot.fieldOverallCategory} (origin)`
      : snapshot.fieldOverallCategory
    : "no field data";

  return {
    url,
    strategy: snapshot.strategy,
    performance: formatScoreWithDelta(
      snapshot.performanceScore,
      previous?.performanceScore,
    ),
    accessibility: formatScoreWithDelta(
      snapshot.accessibilityScore,
      previous?.accessibilityScore,
    ),
    bestPractices: formatScoreWithDelta(
      snapshot.bestPracticesScore,
      previous?.bestPracticesScore,
    ),
    seo: formatScoreWithDelta(snapshot.seoScore, previous?.seoScore),
    labLcp: formatMs(snapshot.lcpMs),
    labCls: formatCls(snapshot.cls),
    labTbt: formatMs(snapshot.tbtMs),
    fieldLcp: formatMs(snapshot.fieldLcpMs),
    fieldInp: formatMs(snapshot.fieldInpMs),
    fieldCls: formatCls(snapshot.fieldCls),
    fieldVerdict: snapshot.errorMessage ? "run failed" : fieldVerdict,
    fieldSource: snapshot.fieldSource,
    runAt: snapshot.createdAt,
    trigger: snapshot.trigger ?? "manual",
    nextRun: nextRunAt,
    dailyRun: scheduleEnabled ? "on" : "paused",
    error: snapshot.errorMessage,
  };
}

const pagespeedInputSchema = {
  projectId: projectIdSchema,
  strategy: z
    .enum(PAGESPEED_STRATEGY_VALUES)
    .default("mobile")
    .describe(
      "Which PageSpeed run to report. Mobile is what Google scores rankings on.",
    ),
  url: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filter to monitored URLs containing this substring (e.g. '/pricing').",
    ),
  history: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(1)
    .describe(
      "How many runs to return per URL, newest first. 1 (default) is the latest run only; raise it to see how scores moved over time.",
    ),
} as const;

type PagespeedArgs = z.infer<z.ZodObject<typeof pagespeedInputSchema>>;

export const getPagespeedInsightsTool = {
  name: "get_pagespeed_insights",
  config: {
    title: "Get PageSpeed Insights results",
    description:
      "Read stored Google PageSpeed Insights results for the project's monitored URLs: Lighthouse scores (performance, accessibility, best practices, SEO) with the change since the previous run, lab metrics (LCP, CLS, TBT), and — the part that matters for ranking — CrUX field data from real Chrome users (LCP, INP, CLS and a FAST/AVERAGE/SLOW verdict). Pass history>1 to get several past runs per URL instead of just the latest, for trends. Each row says whether that run was triggered manually or by the daily sweep, whether the URL is on the daily schedule at all (paused URLs only run on request), and when it is next due. Field values marked '(origin)' are origin-wide because Google had no data for that specific URL; 'no field data' means the page has too little traffic. For the specific Lighthouse problems behind a score, use get_pagespeed_issues. Returns stored results only and never triggers a new run, so it uses no PageSpeed quota. Read-only; uses no credits.",
    inputSchema: pagespeedInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      strategy: z.string().optional(),
      rowCount: z.number().optional(),
      rows: z.array(looseObjectOutputSchema).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      // Reads only stored snapshots — no outbound call, so no open world.
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PagespeedArgs, context) => {
    const settingsPath = `/p/${args.projectId}/settings`;
    const pagespeedPath = `/p/${args.projectId}/pagespeed`;
    const connectUrl = buildDashboardUrl(context.baseUrl, settingsPath);
    const pagespeedUrl = buildDashboardUrl(context.baseUrl, pagespeedPath);
    const meta = buildProjectMeta(context, args.projectId, pagespeedPath);

    let overview;
    try {
      overview = await PagespeedService.getOverview({
        projectId: args.projectId,
        organizationId: context.auth.organizationId,
        userId: context.auth.userId,
        domain: context.project.domain,
      });
    } catch (error) {
      if (error instanceof PagespeedNotConfiguredError) {
        return mcpResponse({
          text: `PageSpeed Insights is not configured on this deployment. Set the PAGESPEED_API_KEY secret to enable it: ${connectUrl}`,
          meta,
          structuredContent: {
            ok: false,
            reason: "not_configured",
            connectUrl,
          },
        });
      }
      throw error;
    }

    const filter = args.url?.toLowerCase();
    const urls = filter
      ? overview.urls.filter((row) => row.url.toLowerCase().includes(filter))
      : overview.urls;

    if (urls.length === 0) {
      const text = filter
        ? `No monitored URL matches "${args.url}". Manage monitored URLs here: ${pagespeedUrl}`
        : `No URLs are being monitored for this project yet. Add one here: ${pagespeedUrl}`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          strategy: args.strategy,
          rowCount: 0,
          rows: [],
        },
      });
    }

    // One entry per (URL, run), newest first within each URL, capped by the
    // requested history depth. history=1 collapses to the latest run per URL.
    const history = historyByUrl(overview.snapshots, args.strategy);
    const rows = urls.flatMap((url) =>
      (history.get(url.id) ?? [])
        .slice(0, args.history)
        .map((entry) =>
          buildRow(url.url, entry, url.nextRunAt, url.scheduleEnabled),
        ),
    );

    const urlsWithResults = urls.filter(
      (url) => (history.get(url.id)?.length ?? 0) > 0,
    ).length;
    const scope =
      args.history > 1
        ? `up to ${args.history} run(s) each`
        : "latest run only";
    const summary = `PageSpeed Insights · ${args.strategy} · ${scope} · ${urlsWithResults} of ${urls.length} monitored URL(s) have results`;
    const text =
      rows.length === 0
        ? `${summary}\nNothing has been run yet. Start a run here: ${pagespeedUrl}`
        : `${summary}\n${formatMcpTable(rows, COLUMNS)}`;

    return mcpResponse({
      text,
      meta,
      structuredContent: {
        ok: true,
        strategy: args.strategy,
        rowCount: rows.length,
        rows,
      },
    });
  }),
};

/** One Lighthouse issue, flattened for the table and structured payload. */
type PagespeedIssueRow = {
  url: string;
  category: string;
  severity: string;
  issue: string;
  detail: string;
  /** The audit's own evidence rows — the exact offending line, URL or node.
   *  `displayValue` only counts them ("1 error found"), which is not actionable. */
  evidence: string[];
  impactMs: number | null;
  impactBytes: number | null;
  auditKey: string;
};

const ISSUE_COLUMNS: McpTableColumn<PagespeedIssueRow>[] = [
  { header: "url", value: (row) => row.url },
  { header: "category", value: (row) => row.category },
  { header: "severity", value: (row) => row.severity },
  { header: "issue", value: (row) => row.issue },
  { header: "detail", value: (row) => row.detail },
  { header: "evidence", value: (row) => row.evidence.join(" | ") || "—" },
  { header: "audit", value: (row) => row.auditKey },
];

/** Worst first, so a truncated list still leads with what matters. */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const issuesInputSchema = {
  projectId: projectIdSchema,
  strategy: z
    .enum(PAGESPEED_STRATEGY_VALUES)
    .default("mobile")
    .describe(
      "Which run's issues to report. Mobile is what Google scores rankings on.",
    ),
  url: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filter to monitored URLs containing this substring (e.g. '/pricing').",
    ),
  category: z
    .enum(LIGHTHOUSE_CATEGORIES)
    .optional()
    .describe("Only report issues in one Lighthouse category."),
  limit: z.number().int().min(1).max(100).default(30),
} as const;

type PagespeedIssuesArgs = z.infer<z.ZodObject<typeof issuesInputSchema>>;

export const getPagespeedIssuesTool = {
  name: "get_pagespeed_issues",
  config: {
    title: "Get PageSpeed Insights issues",
    description:
      "Read the specific Lighthouse problems behind a project's PageSpeed scores — the actionable list of what to fix, rather than just the number. Each row is one failing audit for one monitored URL: category, severity, the issue title, its measured impact (time or bytes saved), and the Lighthouse audit key. Covers the latest run per URL; use get_pagespeed_insights for the scores themselves or for score history. Issues are returned worst-first. A URL reported as having no stored detail was run before detail was captured, or its upload failed — re-running it collects the detail. Returns stored results only and never triggers a new run, so it uses no PageSpeed quota. Read-only; uses no credits.",
    inputSchema: issuesInputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      strategy: z.string().optional(),
      rowCount: z.number().optional(),
      rows: z.array(looseObjectOutputSchema).optional(),
      urlsWithoutDetail: z.array(z.string()).optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      // Reads stored snapshots and their R2 payloads — no outbound API call.
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PagespeedIssuesArgs, context) => {
    const settingsPath = `/p/${args.projectId}/settings`;
    const pagespeedPath = `/p/${args.projectId}/pagespeed`;
    const connectUrl = buildDashboardUrl(context.baseUrl, settingsPath);
    const pagespeedUrl = buildDashboardUrl(context.baseUrl, pagespeedPath);
    const meta = buildProjectMeta(context, args.projectId, pagespeedPath);

    let results;
    try {
      results = await PagespeedService.getLatestIssues({
        projectId: args.projectId,
        organizationId: context.auth.organizationId,
        userId: context.auth.userId,
        domain: context.project.domain,
        strategy: args.strategy,
        urlFilter: args.url,
      });
    } catch (error) {
      if (error instanceof PagespeedNotConfiguredError) {
        return mcpResponse({
          text: `PageSpeed Insights is not configured on this deployment. Set the PAGESPEED_API_KEY secret to enable it: ${connectUrl}`,
          meta,
          structuredContent: {
            ok: false,
            reason: "not_configured",
            connectUrl,
          },
        });
      }
      throw error;
    }

    const urlsWithoutDetail = results
      .filter((result) => !result.available)
      .map((result) => result.url);

    const rows: PagespeedIssueRow[] = results
      .flatMap((result) =>
        result.issues
          .filter((issue) => !args.category || issue.category === args.category)
          .map((issue) => ({
            url: result.url,
            category: issue.category,
            severity: issue.severity,
            issue: issue.title,
            detail: issue.displayValue ?? "—",
            evidence: issue.items.slice(0, 3),
            impactMs: issue.impactMs,
            impactBytes: issue.impactBytes,
            auditKey: issue.auditKey,
          })),
      )
      .toSorted((a, b) => {
        const bySeverity =
          (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
        if (bySeverity !== 0) return bySeverity;
        // Then by measured impact, so the biggest win leads its severity band.
        return (
          (b.impactMs ?? 0) +
          (b.impactBytes ?? 0) / 1000 -
          ((a.impactMs ?? 0) + (a.impactBytes ?? 0) / 1000)
        );
      })
      .slice(0, args.limit);

    if (results.length === 0) {
      const text = args.url
        ? `No monitored URL matches "${args.url}". Manage monitored URLs here: ${pagespeedUrl}`
        : `No URLs have PageSpeed results yet. Start a run here: ${pagespeedUrl}`;
      return mcpResponse({
        text,
        meta,
        structuredContent: {
          ok: true,
          strategy: args.strategy,
          rowCount: 0,
          rows: [],
        },
      });
    }

    const notes = urlsWithoutDetail.length
      ? `\nNo stored detail for: ${urlsWithoutDetail.join(", ")} — re-run to collect it.`
      : "";
    const summary = `PageSpeed issues · ${args.strategy} · ${rows.length} issue(s) across ${results.length} URL(s)`;
    const text =
      rows.length === 0
        ? `${summary}\nNo actionable issues found.${notes}`
        : `${summary}\n${formatMcpTable(rows, ISSUE_COLUMNS)}${notes}`;

    return mcpResponse({
      text,
      meta,
      structuredContent: {
        ok: true,
        strategy: args.strategy,
        rowCount: rows.length,
        rows,
        urlsWithoutDetail,
      },
    });
  }),
};
