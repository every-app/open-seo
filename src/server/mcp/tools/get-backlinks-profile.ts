import { z } from "zod";
import { BacklinksService } from "@/server/features/backlinks/services/BacklinksService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  backlinksProfileOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  BACKLINKS_DEFAULT_SORT,
  BACKLINKS_PAGE_SIZES,
  DEFAULT_BACKLINKS_PAGE_SIZE,
  backlinksRowsFiltersSchema,
  backlinksRowsModeSchema,
  backlinksRowsSortFieldSchema,
  backlinksSortOrderSchema,
  backlinksTargetScopeSchema,
} from "@/types/schemas/backlinks";

const inputSchema = {
  projectId: projectIdSchema,
  target: z
    .string()
    .min(1)
    .max(2048)
    .describe(
      "Domain or URL to analyze (e.g. 'example.com' or 'https://example.com/blog').",
    ),
  scope: backlinksTargetScopeSchema
    .optional()
    .describe(
      "'domain' analyzes the whole domain; 'page' analyzes a specific URL. Defaults to 'domain'.",
    ),
  page: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe("1-indexed results page. Defaults to 1."),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (BACKLINKS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_BACKLINKS_PAGE_SIZE)
    .describe("Rows per page. Allowed values: 50, 100, or 200."),
  sortField: backlinksRowsSortFieldSchema
    .default(BACKLINKS_DEFAULT_SORT.backlinks.field)
    .describe("Backlink row sort field."),
  sortOrder: backlinksSortOrderSchema
    .default(BACKLINKS_DEFAULT_SORT.backlinks.order)
    .describe("Sort direction."),
  filters: backlinksRowsFiltersSchema
    .default({})
    .describe(
      "Backlink row filters: include/exclude source URL terms, authority/spam ranges, dofollow/nofollow, lost/broken visibility, or exact domainFrom.",
    ),
  mode: backlinksRowsModeSchema
    .default("one_per_domain")
    .describe(
      "DataForSEO backlink grouping: one_per_domain returns each referring domain's strongest link; as_is returns individual backlink rows.",
    ),
  hideSpam: z
    .boolean()
    .optional()
    .describe("Filter out spammy backlinks. Defaults to true."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function formatMetric(value: unknown) {
  return typeof value === "number" || typeof value === "string" ? value : "?";
}

function formatLinkType(value: boolean | null | undefined) {
  if (value === true) return "dofollow";
  if (value === false) return "nofollow";
  return "unknown";
}

function formatStatus(row: {
  isLost?: boolean | null;
  isBroken?: boolean | null;
}) {
  const statuses: string[] = [];
  if (row.isLost) statuses.push("lost");
  if (row.isBroken) statuses.push("broken");
  return statuses.length > 0 ? statuses.join(", ") : "live";
}

type BacklinkRow = {
  domainFrom?: string | null;
  urlFrom?: string | null;
  urlTo?: string | null;
  anchor?: string | null;
  isDofollow?: boolean | null;
  rank?: number | null;
  domainFromRank?: number | null;
  spamScore?: number | null;
  isLost?: boolean | null;
  isBroken?: boolean | null;
};

const BACKLINK_COLUMNS: McpTableColumn<BacklinkRow>[] = [
  { header: "source", value: (row) => row.urlFrom ?? row.domainFrom },
  { header: "target", value: (row) => row.urlTo },
  { header: "anchor", value: (row) => row.anchor },
  { header: "type", value: (row) => formatLinkType(row.isDofollow) },
  { header: "rank", value: (row) => row.rank },
  { header: "domainRank", value: (row) => row.domainFromRank },
  { header: "spam", value: (row) => row.spamScore },
  { header: "status", value: (row) => formatStatus(row) },
];

export const getBacklinksProfileTool = {
  name: "get_backlinks_profile",
  config: {
    title: "Get backlinks profile",
    description:
      "Returns one bounded page of detailed backlink rows for a domain or page: linking URLs, target URLs, anchors, dofollow/nofollow, authority/spam signals, and lost/broken status. Supports filters, sorting, one_per_domain/as_is mode, and pagination. Charges credits (~30 per page typical). Self-hosted deployments need the Backlinks API enabled on their DataForSEO account.",
    inputSchema,
    outputSchema: {
      backlinks: backlinksProfileOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    // The MCP SDK already validated args against inputSchema (which mirrors
    // backlinksRowsPageRequestSchema), so pass them straight through.
    const request = {
      target: args.target,
      scope: args.scope,
      page: args.page,
      pageSize: args.pageSize,
      sortField: args.sortField,
      sortOrder: args.sortOrder,
      filters: args.filters,
      mode: args.mode,
    };

    const backlinks = await BacklinksService.profileBacklinksPage(
      request,
      context.billing,
      { hideSpam: args.hideSpam ?? true },
    );
    const text = [
      `Backlinks profile for ${request.target} (${request.scope ?? "domain"}):`,
      `- page: ${backlinks.page}`,
      `- page size: ${backlinks.pageSize}`,
      `- rows returned: ${backlinks.rows.length}`,
      `- total backlinks: ${formatMetric(backlinks.totalCount)}`,
      `- has more: ${backlinks.hasMore ? "yes" : "no"}`,
      "",
      backlinks.rows.length === 0
        ? "No backlink rows for this page."
        : formatMcpTable(backlinks.rows, BACKLINK_COLUMNS),
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
        { target: request.target, scope: request.scope },
      ),
      structuredContent: { backlinks },
    });
  }),
};
