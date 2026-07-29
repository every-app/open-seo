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
import {
  PagespeedService,
  PagespeedNotConfiguredError,
} from "@/server/features/pagespeed/services/PagespeedService";
import {
  formatCls,
  formatMs,
  formatScoreWithDelta,
  latestByUrl,
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
  lastRun: string;
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
  { header: "last run", value: (row) => row.lastRun },
];

function buildRow(
  url: string,
  entry: { snapshot: PagespeedSnapshotLike; previous: PagespeedSnapshotLike | null },
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
    lastRun: snapshot.createdAt,
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
} as const;

type PagespeedArgs = z.infer<z.ZodObject<typeof pagespeedInputSchema>>;

export const getPagespeedInsightsTool = {
  name: "get_pagespeed_insights",
  config: {
    title: "Get PageSpeed Insights results",
    description:
      "Read the latest Google PageSpeed Insights results for the project's monitored URLs: Lighthouse scores (performance, accessibility, best practices, SEO) with the change since the previous run, lab metrics (LCP, CLS, TBT), and — the part that matters for ranking — CrUX field data from real Chrome users (LCP, INP, CLS and a FAST/AVERAGE/SLOW verdict). Field values marked '(origin)' are origin-wide because Google had no data for that specific URL; 'no field data' means the page has too little traffic. Returns stored results only and never triggers a new run, so it uses no PageSpeed quota. Read-only; uses no credits.",
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
        structuredContent: { ok: true, strategy: args.strategy, rowCount: 0, rows: [] },
      });
    }

    const latest = latestByUrl(overview.snapshots, args.strategy);
    const rows = urls
      .map((url) => {
        const entry = latest.get(url.id);
        return entry ? buildRow(url.url, entry) : null;
      })
      .filter((row): row is PagespeedRow => row !== null);

    const summary = `PageSpeed Insights · ${args.strategy} · ${rows.length} of ${urls.length} monitored URL(s) have results`;
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
