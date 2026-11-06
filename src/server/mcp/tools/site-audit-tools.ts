/* eslint-disable max-lines -- all site-audit MCP tools are intentionally kept in one module */
import { sort } from "remeda";
import { z } from "zod";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AUDIT_LIMITS } from "@/server/features/audit/services/audit-capacity";
import { AuditService } from "@/server/features/audit/services/AuditService";
import {
  getAuditIssueGroups,
  listAuditIssues,
  listAuditPages,
} from "@/server/features/audit/repositories/auditResultsQueries";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import {
  AUDIT_ISSUE_TYPES,
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
} from "@/shared/audit-issues";
import { PAGE_FETCH_CLASSES } from "@/shared/audit-fetch-class";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  formatMcpCell,
  formatMcpTable,
  type McpTableColumn,
  truncatedCell,
} from "@/server/mcp/table";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { renderingEstimateText } from "@/shared/audit-rendering";
import {
  DEFAULT_AUDIT_PAGES,
  FREE_MAX_AUDIT_PAGES,
  RENDERED_CRAWL_TIME_LIMIT_HOURS,
} from "@/shared/audit-limits";
import { BILLING_ROUTE } from "@/shared/billing";
import { auditPagesSortFields } from "@/types/schemas/audit";

const auditIdSchema = z
  .string()
  .optional()
  .describe("Audit ID. If omitted, uses the project's most recent audit.");

async function resolveAudit(projectId: string, auditId?: string) {
  const audit = auditId
    ? await AuditRepository.getAuditForProject(auditId, projectId)
    : await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) {
    throw new AppError(
      "NOT_FOUND",
      auditId
        ? `Audit ${auditId} not found in this project.`
        : "No audits exist for this project yet. Start one with run_site_audit.",
    );
  }
  return audit;
}

function auditPath(projectId: string, auditId: string) {
  return `/p/${projectId}/audit?auditId=${auditId}`;
}

// ─── run_site_audit ──────────────────────────────────────────────────────────

const runInputSchema = {
  projectId: projectIdSchema,
  url: z.string().min(1).max(2048).describe("Start URL to crawl."),
  maxPages: z
    .number()
    .int()
    .min(10)
    .max(10_000)
    .optional()
    .describe(
      `Page budget for the crawl (default ${DEFAULT_AUDIT_PAGES}). Free plans audit at most ${FREE_MAX_AUDIT_PAGES} pages: a larger budget runs at ${FREE_MAX_AUDIT_PAGES} and the reply says so.`,
    ),
  renderJavaScript: z
    .boolean()
    .optional()
    .describe(
      `Render JavaScript before auditing, for sites whose content or links load client-side or whose bot protection blocks the plain crawler. Slower. On hosted plans, for 100 pages: ${renderingEstimateText(100)} Hosted plans hold that amount until the audit ends; an account that cannot cover it is refused. A hosted rendered crawl stops after ${RENDERED_CRAWL_TIME_LIMIT_HOURS} hours. Default false.`,
    ),
  runLighthouse: z
    .boolean()
    .optional()
    .describe(
      "Run Lighthouse on a sample of up to 10 representative pages (default false — it adds several minutes of wall-clock time). Pass true only when the user wants performance/Core Web Vitals detail.",
    ),
} as const;

type RunArgs = z.infer<z.ZodObject<typeof runInputSchema>>;

export const runSiteAuditTool = {
  name: "run_site_audit",
  config: {
    title: "Run site audit",
    description:
      "Start a site audit: crawls the site (robots.txt-aware, same-origin), checks every page for SEO issues (broken links, duplicate/missing titles and descriptions, redirect chains, orphan pages, canonical problems, thin content, and more), and optionally runs Lighthouse on a sample of pages. Runs in the background — poll get_audit_status, then read get_audit_issues. If the site rate limits the crawler it slows down and retries; pages it still cannot read are honestly flagged as blocked or rate-limited rather than misreported.",
    inputSchema: runInputSchema,
    outputSchema: z
      .object({
        // Expected refusal responses (for example, account audit capacity)
        // do not start an audit and therefore have no id.
        auditId: z.string().optional(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: RunArgs, context) => {
    // Default OFF for agent calls: Lighthouse turns a 1-2 minute crawl into a
    // many-minute wait, which chat agents handle badly. The app UI passes its
    // own explicit lighthouseStrategy, so this default only governs agents.
    const lighthouseStrategy = (args.runLighthouse ?? false) ? "auto" : "none";
    const limitTier = await AuditService.resolveAuditLimitTier(context.billing);
    // Agents can't see the account's plan, so an oversized budget runs at the
    // plan limit instead of failing. The app's launch form keeps its refusal.
    const requestedPages = args.maxPages ?? DEFAULT_AUDIT_PAGES;
    const maxPages = Math.min(
      requestedPages,
      AUDIT_LIMITS[limitTier].maxPagesPerAudit,
    );
    let auditId: string;
    try {
      ({ auditId } = await AuditService.startAudit({
        actorUserId: context.auth.userId,
        billingCustomer: context.billing,
        projectId: args.projectId,
        startUrl: args.url,
        maxPages,
        lighthouseStrategy,
        limitTier,
        renderJavaScript: args.renderJavaScript,
      }));
    } catch (error) {
      // Expected refusals become readable answers instead of protocol errors:
      // no audit started, so there is no auditId to report.
      const refusalText =
        error instanceof AppError && error.code === "AUDIT_CAPACITY_REACHED"
          ? "Audit capacity reached for this account. list_site_audits shows a project's audits, and delete_site_audit frees capacity, but deleting permanently removes an audit's results and needs an owner or admin. Confirm with the user which audit to delete, then try again."
          : error instanceof AppError && error.code === "AUDIT_ALREADY_RUNNING"
            ? "This account is at its limit of concurrently running audits. Poll get_audit_status until one finishes, then try again."
            : // startAudit refuses only rendering with FORBIDDEN; its message
              // says why and what to do instead.
              error instanceof AppError &&
                error.code === "FORBIDDEN" &&
                args.renderJavaScript
              ? error.message
              : null;
      if (refusalText) {
        return mcpResponse({
          text: refusalText,
          meta: buildProjectMeta(
            context,
            args.projectId,
            `/p/${args.projectId}/audit`,
          ),
        });
      }
      throw error;
    }

    await captureServerEvent({
      distinctId: context.auth.userId,
      event: "site_audit:start",
      organizationId: context.auth.organizationId,
      properties: {
        project_id: args.projectId,
        max_pages: maxPages,
        requested_max_pages: requestedPages,
        run_lighthouse: lighthouseStrategy !== "none",
        source: "mcp",
      },
    });

    const capNote =
      maxPages < requestedPages
        ? ` Free plan audits are limited to ${maxPages} pages, so this audit covers at most ${maxPages} of the ${requestedPages} requested. Mention this limit when you report the results. Larger audits need a paid plan, which the organization owner can manage at ${buildDashboardUrl(context.baseUrl, BILLING_ROUTE)}.`
        : "";

    return mcpResponse({
      text: `Audit ${auditId} started for ${args.url}.${capNote} Poll get_audit_status until it finishes, then call get_audit_issues for the prioritized issue report (even a failed audit keeps results for every page it crawled).`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditPath(args.projectId, auditId),
      ),
      structuredContent: { auditId },
    });
  }),
};

// ─── get_audit_status ────────────────────────────────────────────────────────

const statusInputSchema = {
  projectId: projectIdSchema,
  auditId: auditIdSchema,
} as const;

type StatusArgs = z.infer<z.ZodObject<typeof statusInputSchema>>;

export const getAuditStatusTool = {
  name: "get_audit_status",
  config: {
    title: "Get site audit status",
    description:
      "Check the progress of a site audit (phase, pages crawled, Lighthouse progress). Free — reads OpenSEO state and may reconcile a dead workflow by marking its audit failed. Omit auditId for the most recent audit.",
    inputSchema: statusInputSchema,
    outputSchema: z
      .object({
        status: looseObjectOutputSchema,
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: StatusArgs, context) => {
    // getStatus fetches (and self-heals) the audit row itself; only hit the
    // DB here when we need to default to the most recent audit.
    const auditId = args.auditId ?? (await resolveAudit(args.projectId)).id;
    const status = await AuditService.getStatus(auditId, args.projectId);

    const lighthouseNote =
      status.lighthouseTotal > 0
        ? `, lighthouse ${status.lighthouseCompleted + status.lighthouseFailed}/${status.lighthouseTotal}`
        : "";
    // Failed audits keep partial results — point agents at them instead of
    // letting a mid-crawl death read as "no data".
    const nextStep =
      status.status === "completed"
        ? " Call get_audit_issues for the issue report."
        : status.status === "failed" && status.pagesCrawled > 0
          ? ` The audit stopped early but kept results for the ${status.pagesCrawled} pages it crawled — call get_audit_issues for the partial issue report.`
          : "";
    return mcpResponse({
      text: `Audit ${status.id} (${status.startUrl}): ${status.status}${status.errorCode ? ` (${status.errorCode})` : ""} — phase ${status.currentPhase}, ${status.pagesCrawled}/${status.pagesTotal} pages${lighthouseNote}.${nextStep}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditPath(args.projectId, status.id),
      ),
      structuredContent: { status },
    });
  }),
};

// ─── get_audit_issues ────────────────────────────────────────────────────────

// Text-only clients read just the text block, so each issue type renders its
// remediation steps plus a bounded sample of affected URLs. Every URL of every
// type would be a data dump; the per-type count keeps the sample honest.
const ISSUE_SAMPLE_SIZE = 5;

/** Render an issue's parsed details record as ` (statusCode: 404, length: 12)`. */
function formatIssueDetails(details: unknown): string {
  if (typeof details !== "object" || details === null || Array.isArray(details))
    return "";
  const parts = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(
      ([key, value]) =>
        `${key}: ${
          Array.isArray(value)
            ? value.map(formatMcpCell).join(" → ")
            : formatMcpCell(value)
        }`,
    );
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

const issuesInputSchema = {
  projectId: projectIdSchema,
  auditId: auditIdSchema,
  severity: z
    .enum(["critical", "warning", "info"])
    .optional()
    .describe("Only return issues of this severity."),
  issueType: z
    .string()
    .optional()
    .describe(
      `Only return issues of this type. One of: ${Object.keys(AUDIT_ISSUE_TYPES).join(", ")}`,
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Page of issue rows, 1-based (default 1). Rows are ordered critical first.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Issue rows per page (default 200)."),
} as const;

type IssuesArgs = z.infer<z.ZodObject<typeof issuesInputSchema>>;

export const getAuditIssuesTool = {
  name: "get_audit_issues",
  config: {
    title: "Get site audit issues",
    description:
      "Read the prioritized issue report from a completed site audit. Every issue carries a how_to_fix with concrete remediation steps an agent can act on. Free — reads OpenSEO state. Omit auditId for the most recent audit.",
    inputSchema: issuesInputSchema,
    outputSchema: z
      .object({
        summary: z.array(looseObjectOutputSchema),
        issues: z.array(looseObjectOutputSchema),
        total: z.number(),
        page: z.number(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: IssuesArgs, context) => {
    const audit = await resolveAudit(args.projectId, args.auditId);
    const page = args.page ?? 1;
    const limit = args.limit ?? 200;
    // Counts come from a grouped query and rows a page at a time: a large
    // audit has tens of thousands of issue rows.
    const [groups, rows] = await Promise.all([
      getAuditIssueGroups(audit.id),
      listAuditIssues(audit.id, {
        severity: args.severity,
        issueType: args.issueType,
        page,
        pageSize: limit,
      }),
    ]);

    const counts = new Map<string, number>();
    for (const group of groups) {
      if (args.severity && group.severity !== args.severity) continue;
      if (args.issueType && group.issueType !== args.issueType) continue;
      counts.set(
        group.issueType,
        (counts.get(group.issueType) ?? 0) + group.count,
      );
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const summary = sort(
      Array.from(counts.entries()).map(([issueType, count]) => {
        const descriptor = getIssueDescriptor(issueType);
        return {
          issueType,
          title: descriptor?.title ?? issueType,
          severity: descriptor?.severity ?? "info",
          count,
        };
      }),
      (a, b) =>
        ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
        b.count - a.count,
    );

    const issues = rows.map((row) => {
      const descriptor = getIssueDescriptor(row.issueType);
      return {
        severity: row.severity,
        issueType: row.issueType,
        title: descriptor?.title ?? row.issueType,
        url: row.pageUrl,
        details: row.detailsJson
          ? (JSON.parse(row.detailsJson) as unknown)
          : null,
        howToFix: descriptor?.howToFix ?? null,
      };
    });
    const firstRow = (page - 1) * limit + 1;
    const lastRow = firstRow + issues.length - 1;

    // Sample affected URLs from the returned rows, keyed by issue type; counts
    // still come from `summary`, which covers every matching row.
    const samples = new Map<string, typeof issues>();
    for (const issue of issues) {
      const sample = samples.get(issue.issueType) ?? [];
      if (sample.length < ISSUE_SAMPLE_SIZE) sample.push(issue);
      samples.set(issue.issueType, sample);
    }
    let sampled = false;

    const sections = summary.map((entry) => {
      const shown = samples.get(entry.issueType) ?? [];
      const remaining = entry.count - shown.length;
      if (remaining > 0) sampled = true;
      const howToFix = getIssueDescriptor(entry.issueType)?.howToFix;
      return [
        `[${entry.severity}] ${entry.title} (${entry.issueType}): ${entry.count} affected page${entry.count === 1 ? "" : "s"}`,
        howToFix ? `  Fix: ${howToFix}` : null,
        ...shown.map(
          (issue) => `  - ${issue.url}${formatIssueDetails(issue.details)}`,
        ),
        // A low-severity type can fall entirely outside this page of rows,
        // leaving counts with no rows to sample from.
        shown.length === 0
          ? `  (no sample URLs on this page of issue rows — filter by issueType or request another page)`
          : remaining > 0
            ? `  …and ${remaining} more affected URL${remaining === 1 ? "" : "s"} in this issue.`
            : null,
      ]
        .filter((line) => line !== null)
        .join("\n");
    });

    const text =
      total === 0
        ? args.severity || args.issueType
          ? `No issues found for audit ${audit.id} matching the given filters.`
          : audit.status === "running"
            ? `Audit ${audit.id} is still running; issues are recorded when it finishes. Poll get_audit_status.`
            : audit.status === "failed" && audit.pagesCrawled === 0
              ? `Audit ${audit.id} failed before crawling any pages, so it has no results. get_audit_status shows the error; call run_site_audit to try again.`
              : `Audit ${audit.id} found no issues across ${audit.pagesCrawled} crawled page${audit.pagesCrawled === 1 ? "" : "s"}.`
        : [
            `Audit ${audit.id} (${audit.startUrl}): ${total} issues across ${summary.length} issue type${summary.length === 1 ? "" : "s"}.`,
            ...sections,
            sampled
              ? `Up to ${ISSUE_SAMPLE_SIZE} affected URLs are listed per issue type — open the audit in the dashboard for the full list.`
              : null,
            issues.length === 0
              ? `Page ${page} has no issue rows; there are ${total} in total.`
              : lastRow < total
                ? `Structured issue rows ${firstRow}–${lastRow} of ${total} are returned, critical first; call again with page ${page + 1} for the next ${limit}.`
                : null,
          ]
            .filter((block) => block !== null)
            .join("\n\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditPath(args.projectId, audit.id),
      ),
      structuredContent: { summary, issues, total, page },
    });
  }),
};

// ─── get_audit_pages ─────────────────────────────────────────────────────────

const pagesInputSchema = {
  projectId: projectIdSchema,
  auditId: auditIdSchema,
  fetchClass: z
    .enum(PAGE_FETCH_CLASSES)
    .optional()
    .describe(
      'Filter by fetch outcome ("blocked" = the site\'s bot protection challenged the crawler; "rate_limited" = a 429 prevented the crawler from reading the page).',
    ),
  statusCode: z
    .number()
    .int()
    .optional()
    .describe("Filter by exact HTTP status code."),
  urlContains: z
    .string()
    .max(200)
    .optional()
    .describe("Filter to URLs containing this text (case-insensitive)."),
  minWords: z.number().int().min(0).optional().describe("Minimum word count."),
  maxWords: z.number().int().min(0).optional().describe("Maximum word count."),
  minResponseMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum response time in ms."),
  maxResponseMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Maximum response time in ms."),
  missingAlt: z
    .boolean()
    .optional()
    .describe(
      "true: only pages with images missing alt text; false: only pages without.",
    ),
  sort: z
    .enum(auditPagesSortFields)
    .optional()
    .describe(
      'Sort column (default "url"; "images" sorts by images missing alt text). Blank values sort last.',
    ),
  order: z.enum(["asc", "desc"]).optional().describe('Default "asc".'),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Page of results, 1-based (default 1)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Pages per result page (default 100)."),
} as const;

type PagesArgs = z.infer<z.ZodObject<typeof pagesInputSchema>>;

type AuditPageRow = Awaited<ReturnType<typeof listAuditPages>>["rows"][number];

const PAGE_COLUMNS: McpTableColumn<AuditPageRow>[] = [
  { header: "url", value: (page) => page.url },
  { header: "status", value: (page) => page.statusCode },
  { header: "fetch", value: (page) => page.fetchClass },
  { header: "title", value: (page) => page.title, format: truncatedCell(70) },
  {
    header: "description",
    value: (page) => page.metaDescription,
    format: truncatedCell(90),
  },
  { header: "words", value: (page) => page.wordCount },
  { header: "indexable", value: (page) => page.isIndexable },
  { header: "depth", value: (page) => page.crawlDepth },
  { header: "in sitemap", value: (page) => page.inSitemap },
  { header: "internal links", value: (page) => page.internalLinkCount },
  { header: "ms", value: (page) => page.responseTimeMs },
  { header: "redirect", value: (page) => page.redirectUrl },
];

export const getAuditPagesTool = {
  name: "get_audit_pages",
  config: {
    title: "Get site audit pages",
    description:
      "List crawled pages from a site audit with per-page SEO data (status, title, description, word count, indexability, crawl depth, link counts). Free — reads OpenSEO state. Omit auditId for the most recent audit.",
    inputSchema: pagesInputSchema,
    outputSchema: z
      .object({
        pages: z.array(looseObjectOutputSchema),
        total: z.number(),
        page: z.number(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: PagesArgs, context) => {
    const audit = await resolveAudit(args.projectId, args.auditId);
    const page = args.page ?? 1;
    const limit = args.limit ?? 100;
    // Filtered, sorted and paged in SQL: an audit can hold 10,000 pages.
    const { rows: pages, totalCount: total } = await listAuditPages(audit.id, {
      page,
      pageSize: limit,
      sort: args.sort ?? "url",
      order: args.order ?? "asc",
      status: "all",
      fetchClass: args.fetchClass ?? "all",
      statusCode: args.statusCode,
      urlContains: args.urlContains,
      minWords: args.minWords,
      maxWords: args.maxWords,
      minResponseMs: args.minResponseMs,
      maxResponseMs: args.maxResponseMs,
      missingAlt:
        args.missingAlt === undefined ? "all" : args.missingAlt ? "yes" : "no",
    });

    const firstRow = (page - 1) * limit + 1;
    const lastRow = firstRow + pages.length - 1;
    const header = `Audit ${audit.id}: ${total} page${total === 1 ? "" : "s"}${
      pages.length > 0 && (page > 1 || lastRow < total)
        ? ` (showing ${firstRow}–${lastRow}${lastRow < total ? `; call again with page ${page + 1} for more, or narrow with filters` : ""})`
        : ""
    }.`;
    const text =
      pages.length === 0
        ? `${header}\n${total > 0 ? `Page ${page} is past the last page.` : "No crawled pages match these filters."}`
        : `${header}\n${formatMcpTable(pages, PAGE_COLUMNS)}`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditPath(args.projectId, audit.id),
      ),
      structuredContent: { pages, total, page },
    });
  }),
};
