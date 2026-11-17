import type { z } from "zod";
import { BacklinkWatchService } from "@/server/features/backlink-watch/BacklinkWatchService";
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
  backlinkWatchInputSchema,
  backlinkWatchOutputSchema,
  type BacklinkWatchLink,
  type BacklinkWatchLostLink,
  type BacklinkWatchOpportunity,
  type BacklinkWatchResult,
} from "@/types/schemas/backlinkWatch";

const inputSchema = {
  projectId: projectIdSchema,
  ...backlinkWatchInputSchema.shape,
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function formatLinkType(value: boolean | null) {
  if (value === true) return "dofollow";
  if (value === false) return "nofollow";
  return "unknown";
}

const LINK_COLUMNS: McpTableColumn<BacklinkWatchLink>[] = [
  { header: "source", value: (r) => r.urlFrom ?? r.domainFrom },
  { header: "target", value: (r) => r.urlTo, format: truncatedCell(60) },
  { header: "anchor", value: (r) => r.anchor, format: truncatedCell(40) },
  { header: "type", value: (r) => formatLinkType(r.isDofollow) },
  { header: "domainRank", value: (r) => r.domainRank },
  { header: "spam", value: (r) => r.spamScore },
  { header: "firstSeen", value: (r) => r.firstSeen?.slice(0, 10) },
];

const LOST_COLUMNS: McpTableColumn<BacklinkWatchLostLink>[] = [
  { header: "important", value: (r) => r.important },
  { header: "source", value: (r) => r.urlFrom ?? r.domainFrom },
  { header: "target", value: (r) => r.urlTo, format: truncatedCell(60) },
  { header: "anchor", value: (r) => r.anchor, format: truncatedCell(40) },
  { header: "type", value: (r) => formatLinkType(r.isDofollow) },
  { header: "domainRank", value: (r) => r.domainRank },
  { header: "spam", value: (r) => r.spamScore },
  { header: "lost", value: (r) => r.lostDate?.slice(0, 10) },
];

const OPPORTUNITY_COLUMNS: McpTableColumn<BacklinkWatchOpportunity>[] = [
  { header: "domain", value: (r) => r.domain },
  { header: "links to", value: (r) => r.competitors.join(", ") },
  { header: "count", value: (r) => r.competitorCount },
  { header: "domainRank", value: (r) => r.domainRank },
  { header: "spam", value: (r) => r.spamScore },
  { header: "latest first seen", value: (r) => r.firstSeen?.slice(0, 10) },
];

function section<T>(
  title: string,
  total: number,
  rows: T[],
  columns: McpTableColumn<T>[],
) {
  const heading = `${title} (${total}${rows.length < total ? `, showing ${rows.length}` : ""}):`;
  return rows.length === 0
    ? `${heading} none`
    : `${heading}\n${formatMcpTable(rows, columns)}`;
}

function buildText(result: BacklinkWatchResult): string {
  const { summary, window } = result;
  const spamDomains = result.spam.topDomains
    .map((d) => `${d.domain} (${d.spamScore ?? "?"})`)
    .join(", ");
  const sections = [
    `Backlink changes for ${result.domain}, ${window.startDate} to ${window.endDate} (last ${window.sinceDays} days):`,
    section("Lost links", summary.lostCount, result.lost, LOST_COLUMNS) +
      `\n${summary.importantLostCount} important (dofollow, spam score <= ${result.spamThreshold}, domain rank >= ${result.importantMinDomainRank}); listed first.`,
    section("Gained links", summary.gainedCount, result.gained, LINK_COLUMNS),
    section(
      "Competitor opportunities",
      summary.opportunityCount,
      result.opportunities,
      OPPORTUNITY_COLUMNS,
    ),
    `Spam filtered out (score > ${result.spamThreshold}): ${summary.spamCountIsLowerBound ? `at least ${summary.spamCount}` : summary.spamCount} new links.${spamDomains ? ` Top spam domains: ${spamDomains}.` : ""}`,
  ];
  if (result.notes.length > 0) {
    sections.push(`Notes:\n${result.notes.map((n) => `- ${n}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

export const getBacklinkChangesTool = {
  name: "get_backlink_changes",
  config: {
    title: "Get backlink changes",
    description:
      'Reports what changed in the project\'s backlinks over a recent window (default 7 days): real links gained (spam filtered out, one per linking domain), links lost (important ones first: dofollow, not spam, from a domain at or above importantMinDomainRank), competitor opportunities (sites that link to the project\'s saved competitors but not to us, sites linking to 2 or more competitors first; one row per site, not per link, so there is no linking page or anchor), and a spam summary (count and top spam domains). Nothing is stored: DataForSEO records when each link was first seen and lost. Pass opportunities "all" for a one-off outreach list regardless of date, or "off" to skip them. Charges credits (~100 per run typical: one gained-links request, one lost-links request and one competitor request, up to 1,000 rows each). DataForSEO finds links on its own crawl schedule, so a link can appear a week or two late. Lost links can\'t be sorted or date-filtered by DataForSEO, so only the first 1,000 are checked, and a note says when that cap is hit. Self-hosted deployments need the Backlinks API enabled on their DataForSEO account.',
    inputSchema,
    outputSchema: backlinkWatchOutputSchema.extend(optionalMetaOutputSchema),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await BacklinkWatchService.getChanges({
      ...args,
      billing: context.billing,
      projectDomain: context.project.domain,
    });
    return mcpResponse({
      text: buildText(result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/backlinks`,
      ),
      structuredContent: result,
    });
  }),
};
