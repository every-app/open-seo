import { z } from "zod";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { AuditService } from "@/server/features/audit/services/AuditService";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import {
  AUDIT_ISSUE_TYPES,
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
} from "@/shared/audit-issues";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

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
    .describe("Page budget for the crawl (default 50)."),
  runLighthouse: z
    .boolean()
    .optional()
    .describe(
      "Run Lighthouse on a sample of up to 10 representative pages (default true).",
    ),
} as const;

type RunArgs = z.infer<z.ZodObject<typeof runInputSchema>>;

export const runSiteAuditTool = {
  name: "run_site_audit",
  config: {
    title: "Run site audit",
    description:
      "Start a site audit: crawls the site (robots.txt-aware, same-origin), checks every page for SEO issues (broken links, duplicate/missing titles and descriptions, redirect chains, orphan pages, canonical problems, thin content, and more), and optionally runs Lighthouse on a sample of pages. Runs in the background — poll get_audit_status, then read get_audit_issues. If the site blocks our crawler, pages are honestly flagged as blocked rather than misreported.",
    inputSchema: runInputSchema,
    outputSchema: z
      .object({
        auditId: z.string(),
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
    const lighthouseStrategy = (args.runLighthouse ?? true) ? "auto" : "none";
    const limitTier = await AuditService.resolveAuditLimitTier(
      context.auth.organizationId,
    );
    let auditId: string;
    try {
      ({ auditId } = await AuditService.startAudit({
        actorUserId: context.auth.userId,
        billingCustomer: context.billing,
        projectId: args.projectId,
        startUrl: args.url,
        maxPages: args.maxPages,
        lighthouseStrategy,
        limitTier,
      }));
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "AUDIT_CAPACITY_REACHED"
      ) {
        return mcpResponse({
          text: "Audit capacity reached for this account — delete old audits in the dashboard to free capacity, then try again.",
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
        max_pages: args.maxPages ?? 50,
        run_lighthouse: lighthouseStrategy !== "none",
        source: "mcp",
      },
    });

    return mcpResponse({
      text: `Audit ${auditId} started for ${args.url}. Poll get_audit_status until it completes, then call get_audit_issues for the prioritized issue report.`,
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
      "Check the progress of a site audit (phase, pages crawled, Lighthouse progress). Free — reads OpenSEO state. Omit auditId for the most recent audit.",
    inputSchema: statusInputSchema,
    outputSchema: z
      .object({
        status: looseObjectOutputSchema,
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
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
    return mcpResponse({
      text: `Audit ${status.id} (${status.startUrl}): ${status.status} — phase ${status.currentPhase}, ${status.pagesCrawled}/${status.pagesTotal} pages${lighthouseNote}.${status.status === "completed" ? " Call get_audit_issues for the issue report." : ""}`,
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
  limit: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Max issues to return (default 200)."),
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
    const unsorted = await AuditRepository.getIssuesForAudit(audit.id, {
      severity: args.severity,
      issueType: args.issueType,
    });
    // Severity-first so truncation drops info rows, never critical ones.
    const rows = unsorted.toSorted(
      (a, b) =>
        ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
        a.issueType.localeCompare(b.issueType),
    );

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.issueType, (counts.get(row.issueType) ?? 0) + 1);
    }
    const summary = Array.from(counts.entries())
      .map(([issueType, count]) => {
        const descriptor = getIssueDescriptor(issueType);
        return {
          issueType,
          title: descriptor?.title ?? issueType,
          severity: descriptor?.severity ?? "info",
          count,
        };
      })
      .toSorted(
        (a, b) =>
          ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
          b.count - a.count,
      );

    const limit = args.limit ?? 200;
    const issues = rows.slice(0, limit).map((row) => {
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

    const text =
      rows.length === 0
        ? args.severity || args.issueType
          ? `No issues found for audit ${audit.id} matching the given filters.`
          : `No issues recorded for audit ${audit.id}. Note: audits run before issue checks existed have no issue data — re-run the audit with run_site_audit to get a real report.`
        : [
            `Audit ${audit.id} (${audit.startUrl}): ${rows.length} issues${rows.length > limit ? ` (showing ${limit})` : ""}.`,
            "By type:",
            ...summary.map(
              (entry) =>
                `- [${entry.severity}] ${entry.title} (${entry.issueType}): ${entry.count}`,
            ),
            "Full issue rows with how_to_fix instructions are in structuredContent.issues.",
          ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditPath(args.projectId, audit.id),
      ),
      structuredContent: { summary, issues },
    });
  }),
};

// ─── get_audit_pages ─────────────────────────────────────────────────────────

const pagesInputSchema = {
  projectId: projectIdSchema,
  auditId: auditIdSchema,
  fetchClass: z
    .enum(["ok", "blocked", "error"])
    .optional()
    .describe(
      'Filter by fetch outcome ("blocked" = the site\'s bot protection challenged the crawler).',
    ),
  statusCode: z
    .number()
    .int()
    .optional()
    .describe("Filter by exact HTTP status code."),
  urlContains: z
    .string()
    .optional()
    .describe("Filter to URLs containing this substring."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Max pages to return (default 100)."),
} as const;

type PagesArgs = z.infer<z.ZodObject<typeof pagesInputSchema>>;

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
    const allPages = await AuditRepository.getPagesForAudit(audit.id);

    const filtered = allPages.filter(
      (page) =>
        (!args.fetchClass || page.fetchClass === args.fetchClass) &&
        (args.statusCode === undefined ||
          page.statusCode === args.statusCode) &&
        (!args.urlContains || page.url.includes(args.urlContains)),
    );
    const limit = args.limit ?? 100;
    const pages = filtered.slice(0, limit);

    const text = [
      `Audit ${audit.id}: ${filtered.length} pages${filtered.length > limit ? ` (showing ${limit})` : ""}.`,
      ...pages
        .slice(0, 25)
        .map(
          (page) =>
            `- ${page.statusCode} ${page.url}${page.fetchClass !== "ok" ? ` [${page.fetchClass}]` : ""}  "${page.title ?? ""}"`,
        ),
      "Full rows are in structuredContent.pages.",
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        auditPath(args.projectId, audit.id),
      ),
      structuredContent: { pages, total: filtered.length },
    });
  }),
};
