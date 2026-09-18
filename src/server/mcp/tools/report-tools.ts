import { omit } from "remeda";
import { z } from "zod";
import { ReportService } from "@/server/features/reports/services/ReportService";
import { ReportTemplateService } from "@/server/features/reports/services/ReportTemplateService";
import { captureServerEvent } from "@/server/lib/posthog";
import { DEFAULT_CLIENT_LABEL } from "@/server/mcp/client-label";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse, truncatePreview } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { formatCount } from "@/shared/format";
import {
  REPORT_DEFAULT_LIST_LIMIT,
  REPORT_MAX_HTML_BYTES,
  REPORT_MAX_LIST_LIMIT,
  REPORT_MAX_SKILL_CHARS,
  REPORT_MAX_SUMMARY_CHARS,
  REPORT_MAX_TITLE_CHARS,
  type ReportMetadata,
} from "@/types/schemas/reports";

// The three report tools. All free (they touch only the app DB), all wrapped in
// withMcpProjectAuth, and all answering with the in-app report URL so an agent
// can hand back a link instead of pasting a document into chat.

const reportPath = (projectId: string, reportId: string) =>
  `/p/${projectId}/reports/${reportId}`;

// Small reports are real (a one-page summary is a few hundred bytes), and
// rounding those to "0 KB" reads like a failed save.
const size = (bytes: number) =>
  bytes < 1000
    ? `${formatCount(bytes)} bytes`
    : `${formatCount(Math.round(bytes / 1000))} KB`;

// The public share token is a capability; only the app mints and shows it.
// Agents get every other column.
const forAgent = (report: ReportMetadata) =>
  omit(report, ["shareToken", "sharedAt"]);

const metaLine = (
  report: Pick<
    ReportMetadata,
    "skill" | "createdBy" | "updatedAt" | "sizeBytes"
  >,
) =>
  [
    report.skill ?? "no skill",
    report.createdBy,
    `updated ${report.updatedAt.slice(0, 10)}`,
    size(report.sizeBytes),
  ].join(" · ");

// ---------------------------------------------------------------- save_report

const saveInputSchema = {
  projectId: projectIdSchema,
  title: z
    .string()
    .min(1)
    .describe(
      `Specific title shown in the report list, e.g. "badseo.dev SEO audit, Sep 2026". Never a generic label like "SEO Report". Max ${REPORT_MAX_TITLE_CHARS} characters.`,
    ),
  summary: z
    .string()
    .min(1)
    .describe(
      `Markdown, under ${formatCount(REPORT_MAX_SUMMARY_CHARS)} characters: the verdict, the single top action, and the key numbers. This is what list_reports returns and what you or another agent read instead of the HTML.`,
    ),
  html: z
    .string()
    .min(1)
    .describe(
      `The complete self-contained HTML document. Inline all CSS; no external requests of any kind (no CDNs, no web fonts, no images by URL, no fetch) — they are blocked when the report renders, and scripts are blocked too. No backticks and no \${ anywhere, including inside CSS content strings: some clients (Codex) pass this argument through a JavaScript template literal and either sequence corrupts the document. It must be a whole document, ending in </html>: a save that stops mid-document is refused, because there is no version history to fall back on. Aim under 80 KB so the report can be read back whole in one call; the hard limit is ${formatCount(REPORT_MAX_HTML_BYTES)} bytes. Use the seo-report skill's starter template when you have it; otherwise a plain semantic document — heading, short sections, one table — reads fine.`,
    ),
  reportId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Omit to create a new report. Pass an id from list_reports to replace that report in place — there is no version history and the old content is gone.",
    ),
  skill: z
    .string()
    .max(REPORT_MAX_SKILL_CHARS)
    .optional()
    .describe(
      'The slug of the skill that produced this report — the name of the SKILL.md you are running, e.g. "seo-audit". The report list keys on it, so a save without it shows "—".',
    ),
  templateId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The id of the report template you followed, from list_report_templates or the project context. Pass it only when you actually followed that template; it is what the report list and the report page show instead of the skill slug.",
    ),
} as const;

const saveOutputSchema = {
  reportId: z.string(),
  title: z.string(),
  created: z.boolean(),
  htmlBytes: z.number(),
  url: z.string(),
  ...optionalMetaOutputSchema,
} as const;

export const saveReportTool = {
  name: "save_report",
  config: {
    title: "Save report",
    description:
      "Saves a finished HTML report to this project, where anyone in the workspace can read and print it. Uses no credits. Call list_reports first and pass the matching reportId to replace that report instead of creating a near-duplicate — a save whose title already exists in the project is refused. Give the report a specific title (the subject and the period), a summary carrying the verdict, the top action and the key numbers, and the skill slug you are running. Then reply with the returned url, a one-line verdict and the single top action; do not paste the report into chat.",
    inputSchema: saveInputSchema,
    outputSchema: saveOutputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      // A save with a reportId overwrites the stored document, with no undo.
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof saveInputSchema>>, context) => {
      // Resolved against the authorized project before the save: an id from
      // another project must not be stored, and a dangling one would render
      // as no template at all.
      if (args.templateId) {
        await ReportTemplateService.getReportTemplate(
          args.projectId,
          args.templateId,
        );
      }
      const saved = await ReportService.saveReport({
        projectId: args.projectId,
        organizationId: context.auth.organizationId,
        reportId: args.reportId,
        title: args.title,
        summary: args.summary,
        html: args.html,
        skill: args.skill,
        templateId: args.templateId,
        // Never taken from the model: the label the transport derived from the
        // request.
        createdBy: context.auth.clientLabel ?? DEFAULT_CLIENT_LABEL,
        createdByUserId: context.auth.userId,
      });

      const path = reportPath(args.projectId, saved.reportId);
      const url = buildDashboardUrl(context.baseUrl, path);

      await captureServerEvent({
        distinctId: context.auth.userId,
        event: "report:saved",
        organizationId: context.auth.organizationId,
        properties: {
          project_id: args.projectId,
          skill: args.skill,
          used_template: Boolean(args.templateId),
          size_bytes: saved.htmlBytes,
          client: context.auth.clientLabel,
          is_update: !saved.created,
          source: "mcp",
        },
      });

      return mcpResponse({
        text: `${saved.created ? "Saved" : "Replaced"} report "${saved.title}" (${size(saved.htmlBytes)}). Open it at ${url}. Reply with this link, a one-line verdict, and the single top action — do not paste the report into chat.`,
        meta: buildProjectMeta(context, args.projectId, path),
        structuredContent: {
          reportId: saved.reportId,
          title: saved.title,
          created: saved.created,
          htmlBytes: saved.htmlBytes,
          url,
        },
      });
    },
  ),
};

// --------------------------------------------------------------- list_reports

const listInputSchema = {
  projectId: projectIdSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(REPORT_MAX_LIST_LIMIT)
    .optional()
    .describe(
      `Reports per page, newest update first. Default ${REPORT_DEFAULT_LIST_LIMIT}, max ${REPORT_MAX_LIST_LIMIT}.`,
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Rows to skip. Omit for the first page."),
} as const;

const listOutputSchema = {
  reports: z.array(looseObjectOutputSchema),
  totalCount: z.number(),
  rowCount: z.number(),
  remaining: z.number(),
  ...optionalMetaOutputSchema,
} as const;

export const listReportsTool = {
  name: "list_reports",
  config: {
    title: "List reports",
    description:
      "Lists this project's saved reports, newest update first: id, title, skill, who saved it, when, and a short summary preview. Uses no credits. Call this before save_report and reuse the id of the report you are redoing, so the project collects one good report per job instead of near-duplicates. Read the full summary with get_report; the HTML is only worth fetching to edit a specific passage.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof listInputSchema>>, context) => {
      const limit = args.limit ?? REPORT_DEFAULT_LIST_LIMIT;
      const offset = args.offset ?? 0;
      const { reports, totalCount, remaining } =
        await ReportService.listReports({
          projectId: args.projectId,
          limit,
          offset,
        });

      const rows = reports.map((report) => ({
        ...forAgent(report),
        summary: truncatePreview(report.summary),
      }));

      const blocks = rows.map((report) =>
        [
          `${report.id}  ${report.title}`,
          `  ${metaLine(report)}`,
          `  ${report.summary}`,
        ].join("\n"),
      );
      const shownEnd = offset + rows.length;
      const more =
        shownEnd < totalCount
          ? `${rows.length} shown, more available — pass offset ${shownEnd} for the next page.`
          : `${rows.length} shown.`;

      return mcpResponse({
        text: [
          rows.length > 0
            ? blocks.join("\n\n")
            : "No reports saved for this project yet.",
          "",
          `${formatCount(totalCount)} reports. ${more}`,
        ].join("\n"),
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/reports`,
        ),
        structuredContent: {
          reports: rows,
          totalCount,
          rowCount: rows.length,
          remaining,
        },
      });
    },
  ),
};

// ----------------------------------------------------------------- get_report

const getInputSchema = {
  projectId: projectIdSchema,
  reportId: z
    .string()
    .min(1)
    .describe("Report id from list_reports or save_report."),
  includeHtml: z
    .boolean()
    .optional()
    .describe(
      "Include the full HTML document. Leave it off unless you need to edit a specific passage: an 80 KB report is roughly 20,000 tokens, and a larger one is truncated by many clients. When you do fetch it, compare new TextEncoder().encode(html).length against the returned htmlBytes — if it is smaller your client truncated the read, so send the user to the app instead of saving the short version back over the good report.",
    ),
} as const;

const getOutputSchema = {
  report: looseObjectOutputSchema,
  ...optionalMetaOutputSchema,
} as const;

export const getReportTool = {
  name: "get_report",
  config: {
    title: "Get report",
    description:
      "Reads one saved report: title, skill, attribution, size, and the full summary. Uses no credits. This is the cheap way to see what a report already says before you revise it — pass includeHtml only when you need the document itself.",
    inputSchema: getInputSchema,
    outputSchema: getOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof getInputSchema>>, context) => {
      // One read either way: includeHtml pulls the metadata and the document
      // together rather than selecting the same row twice.
      const { report, html } = args.includeHtml
        ? await ReportService.getReportWithHtml(args.projectId, args.reportId)
        : {
            report: await ReportService.getReport(
              args.projectId,
              args.reportId,
            ),
            html: null,
          };

      const path = reportPath(args.projectId, report.id);
      const url = buildDashboardUrl(context.baseUrl, path);

      return mcpResponse({
        // The document goes in `text` only. It is what the agent actually
        // reads, and repeating it in structuredContent would double a payload
        // that is already the largest thing these tools return.
        text: [
          `${report.title} (${report.id})`,
          metaLine(report),
          url,
          "",
          report.summary,
          ...(html
            ? [
                "",
                `HTML (${formatCount(report.sizeBytes)} bytes as stored — if what you received is shorter, your client truncated it and you must not save it back):`,
                html,
              ]
            : []),
        ].join("\n"),
        meta: buildProjectMeta(context, args.projectId, path),
        structuredContent: {
          report: {
            ...forAgent(report),
            htmlBytes: report.sizeBytes,
            url,
          },
        },
      });
    },
  ),
};
