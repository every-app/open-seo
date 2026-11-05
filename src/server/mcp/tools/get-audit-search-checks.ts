import type { z } from "zod";
import { AuditSearchCheckService } from "@/server/features/audit-search-check/AuditSearchCheckService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  formatMcpTable,
  truncatedCell,
  type McpTableColumn,
} from "@/server/mcp/table";
import {
  auditSearchCheckInputSchema,
  auditSearchCheckOutputSchema,
  type AuditSearchCheck,
  type SearchCheckFinding,
} from "@/types/schemas/auditSearchCheck";

const inputSchema = {
  projectId: projectIdSchema,
  ...auditSearchCheckInputSchema.shape,
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const FINDING_COLUMNS: McpTableColumn<SearchCheckFinding>[] = [
  { header: "severity", value: (f) => f.severity },
  { header: "finding", value: (f) => f.type },
  { header: "url", value: (f) => f.url, format: truncatedCell(80) },
  { header: "impressions", value: (f) => f.impressions },
  { header: "clicks", value: (f) => f.clicks },
  {
    header: "keywords",
    value: (f) => f.trackedKeywords.map((k) => k.keyword).join(", "),
    format: truncatedCell(40),
  },
];

const FOLDER_COLUMNS: McpTableColumn<
  AuditSearchCheck["summary"]["notCrawledByFolder"][number]
>[] = [
  { header: "folder", value: (f) => f.folder },
  { header: "pages", value: (f) => f.count },
  { header: "impressions", value: (f) => f.impressions },
  { header: "clicks", value: (f) => f.clicks },
];

function buildText(result: AuditSearchCheck): string {
  const { summary } = result;
  const sections = [
    summary.auditId
      ? `Search check for audit ${summary.auditId} (${summary.auditDate ?? "date unknown"}): ${result.findings.length} findings.`
      : "Search check could not run.",
  ];
  if (result.findings.length > 0) {
    sections.push(formatMcpTable(result.findings, FINDING_COLUMNS));
    if (summary.notCrawledByFolder.length > 0) {
      sections.push(
        `More not-crawled pages, by folder:
${formatMcpTable(summary.notCrawledByFolder, FOLDER_COLUMNS)}`,
      );
    }
    sections.push(
      "Evidence and how-to-fix for each finding are in structuredContent.findings.",
    );
  } else if (summary.auditId) {
    sections.push("No problems found on pages with search demand.");
  }
  sections.push(
    `Search Console window: ${summary.searchConsoleWindow ? `${summary.searchConsoleWindow.startDate} to ${summary.searchConsoleWindow.endDate}` : "not used"}. Latest rank check: ${summary.rankCheckDate ?? "none"}. Pages inspected: ${summary.inspectedCount}.`,
  );
  if (result.notes.length > 0) {
    sections.push(`Notes:\n${result.notes.map((n) => `- ${n}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

export const getAuditSearchChecksTool = {
  name: "get_audit_search_checks",
  config: {
    title: "Get audit search checks",
    description:
      "Cross-check the latest completed site audit against Search Console and Rank Tracking, and return only the problems on pages with real search demand: noindexed, broken, redirected or wrongly canonicalised pages that Google still shows or we track, plus high-impression pages the audit never crawled (the top ones are checked with URL Inspection). Free — reads OpenSEO state, Search Console and Rank Tracking data. Run it after get_audit_issues whenever Search Console is connected: its critical findings outrank the audit's own issue list, which weights every page the same. Without Search Console it still returns the Rank Tracking-based findings, with a note. Pass auditId to check an older audit. At most 25 never-crawled pages are listed (maxNotCrawled, up to 200); the rest are grouped by folder. Pass ignorePaths (path prefixes) to leave out sections that are noindexed on purpose. Does not save anything.",
    inputSchema,
    outputSchema: auditSearchCheckOutputSchema.extend(optionalMetaOutputSchema),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await AuditSearchCheckService.getSearchChecks(args);
    const auditId = result.summary.auditId;
    return mcpResponse({
      text: buildText(result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditId
          ? `/p/${args.projectId}/audit?auditId=${auditId}`
          : `/p/${args.projectId}/audit`,
      ),
      structuredContent: result,
    });
  }),
};
