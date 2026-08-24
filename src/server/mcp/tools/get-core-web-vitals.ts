import { z } from "zod";
import { CruxService } from "@/server/features/crux/services/CruxService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { cwvRating, type CwvMetricKey } from "@/shared/cwv";
import type { CruxSnapshotRecord, CruxWeeklyRow } from "@/types/schemas/crux";

// Text-block parity: the last N weekly rows keep the text readable while the
// full history stays in structuredContent.
const HISTORY_TEXT_ROW_LIMIT = 8;

type MetricRow = {
  metric: string;
  p75: string | null;
  rating: string | null;
  good: string | null;
  needsImprovement: string | null;
  poor: string | null;
};

const METRIC_COLUMNS: McpTableColumn<MetricRow>[] = [
  { header: "metric", value: (row) => row.metric },
  { header: "p75", value: (row) => row.p75 },
  { header: "rating", value: (row) => row.rating },
  { header: "good", value: (row) => row.good },
  { header: "needs improvement", value: (row) => row.needsImprovement },
  { header: "poor", value: (row) => row.poor },
];

const HISTORY_COLUMNS: McpTableColumn<CruxWeeklyRow>[] = [
  { header: "week ending", value: (row) => row.weekEnd },
  { header: "LCP p75 (ms)", value: (row) => row.lcpMs },
  { header: "INP p75 (ms)", value: (row) => row.inpMs },
  { header: "CLS p75", value: (row) => row.cls },
];

function formatDensity(density: number): string {
  return `${Math.round(density * 100)}%`;
}

function metricRow(
  metric: string,
  snapshot: CruxSnapshotRecord["lcpMs"],
  ratingKey: CwvMetricKey | null,
  formatP75: (p75: number) => string,
): MetricRow {
  if (!snapshot) {
    return {
      metric,
      p75: null,
      rating: null,
      good: null,
      needsImprovement: null,
      poor: null,
    };
  }
  return {
    metric,
    p75: formatP75(snapshot.p75),
    rating: ratingKey ? cwvRating(ratingKey, snapshot.p75) : null,
    good: formatDensity(snapshot.good),
    needsImprovement: formatDensity(snapshot.needsImprovement),
    poor: formatDensity(snapshot.poor),
  };
}

const ms = (p75: number) => `${p75} ms`;

function buildMetricRows(record: CruxSnapshotRecord): MetricRow[] {
  return [
    metricRow("LCP", record.lcpMs, "lcpMs", ms),
    metricRow("INP", record.inpMs, "inpMs", ms),
    metricRow("CLS", record.cls, "cls", (p75) => p75.toFixed(2)),
    metricRow("TTFB (experimental)", record.ttfbMs, null, ms),
  ];
}

const inputSchema = {
  projectId: projectIdSchema,
  url: z
    .string()
    .url()
    .optional()
    .describe(
      "Specific page URL. When set, page-level data is returned instead of origin-level data for the project's domain.",
    ),
  formFactor: z
    .enum(["PHONE", "DESKTOP", "TABLET"])
    .optional()
    .describe("Defaults to PHONE."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const getCoreWebVitalsTool = {
  name: "get_core_web_vitals",
  config: {
    title: "Get Core Web Vitals",
    description:
      "Real-user Core Web Vitals from the Chrome UX Report: current 28-day p75 for LCP, INP, CLS, and TTFB with good/needs-improvement/poor densities, plus ~40 weeks of weekly p75 history. Defaults to origin-level data for the project's domain on PHONE. Free Google data — uses no credits. A no_data status means Chrome has not collected enough real-user samples for this origin or URL.",
    inputSchema,
    outputSchema: z
      .object({
        status: z.string(),
        record: looseObjectOutputSchema.optional(),
        history: z.array(looseObjectOutputSchema).optional(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const formFactor = args.formFactor ?? "PHONE";
    const result = await CruxService.getSnapshot({
      domain: context.project.domain,
      url: args.url,
      formFactor,
    });
    const meta = buildProjectMeta(
      context,
      args.projectId,
      `/p/${args.projectId}`,
    );
    const target = args.url ?? context.project.domain;

    if (result.status === "no_data") {
      return mcpResponse({
        text: `No CrUX field data for ${target} (${formFactor}) — Chrome hasn't collected enough real-user samples. Try the origin instead of a page URL, or another form factor.`,
        meta,
        structuredContent: { status: "no_data" },
      });
    }

    const { record, history } = result.snapshot;
    const historyTail = history.slice(-HISTORY_TEXT_ROW_LIMIT);
    const text = [
      `Core Web Vitals for ${target} (${formFactor}, 28-day rolling${record.collectionPeriod ? ` to ${record.collectionPeriod.lastDate}` : ""}):`,
      formatMcpTable(buildMetricRows(record), METRIC_COLUMNS),
      history.length === 0
        ? "No weekly history available."
        : `Weekly history (last ${historyTail.length} of ${history.length} weeks):`,
      history.length === 0
        ? null
        : formatMcpTable(historyTail, HISTORY_COLUMNS),
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    return mcpResponse({
      text,
      meta,
      structuredContent: { status: "ok", record, history },
    });
  }),
};
