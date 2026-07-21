import { z } from "zod";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  classifyCompetitorPageType,
  summarizeCompetitorAuditChanges,
} from "@/server/features/audit/competitorContent";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const baseInputSchema = {
  projectId: projectIdSchema,
  limit: z.number().int().min(1).max(500).optional(),
} as const;

type BaseArgs = z.infer<z.ZodObject<typeof baseInputSchema>>;

function competitorPath(projectId: string, auditId: string) {
  return `/p/${projectId}/audit?auditId=${auditId}`;
}

async function resolveLatestAudit(projectId: string) {
  const audit = await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) {
    return null;
  }
  return audit;
}

export const listCompetitorPagesTool = {
  name: "list_competitor_pages",
  config: {
    title: "List competitor pages",
    description:
      "List pages from the latest crawl/audit for a competitor project, classified into useful SEO page types. Free-first and read-only: uses locally stored site-audit data only.",
    inputSchema: baseInputSchema,
    outputSchema: z
      .object({
        summary: looseObjectOutputSchema,
        pages: z.array(looseObjectOutputSchema),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: BaseArgs, context) => {
    const audit = await resolveLatestAudit(args.projectId);
    if (!audit) {
      return mcpResponse({
        text: "No competitor crawl exists for this project yet. Run a site audit against the competitor domain first.",
        meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}/audit`),
        structuredContent: {
          summary: { total: 0 },
          pages: [],
        },
      });
    }

    const results = await AuditRepository.getAuditResultsForProject(
      audit.id,
      args.projectId,
    );
    const limit = args.limit ?? 100;
    const pages = results.pages
      .filter((page) => (page.statusCode ?? 0) >= 200 && (page.statusCode ?? 0) < 400)
      .map((page) => ({
        url: page.url,
        title: page.title,
        pageType: classifyCompetitorPageType({ url: page.url, title: page.title }),
        wordCount: page.wordCount,
        statusCode: page.statusCode,
        measurement: "measured",
        source: "site_audit",
      }))
      .slice(0, limit);

    const text = [
      `Competitor page inventory from audit ${audit.id}: ${pages.length} pages${results.pages.length > limit ? ` (showing ${limit})` : ""}.`,
      ...pages
        .slice(0, 20)
        .map((page) => `- [${page.pageType}] ${page.url}${page.title ? ` — ${page.title}` : ""}`),
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        competitorPath(args.projectId, audit.id),
      ),
      structuredContent: {
        summary: { total: pages.length, auditId: audit.id },
        pages,
      },
    });
  }),
};

export const getCompetitorChangesTool = {
  name: "get_competitor_changes",
  config: {
    title: "Get competitor changes",
    description:
      "Compare the latest two crawls/audits for a competitor project and report new, removed, and materially changed pages. Free-first and read-only: uses locally stored site-audit data only.",
    inputSchema: baseInputSchema,
    outputSchema: z
      .object({
        summary: looseObjectOutputSchema,
        changes: z.array(looseObjectOutputSchema),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: BaseArgs, context) => {
    const audits = await AuditRepository.getAuditsByProject(args.projectId);
    if (audits.length === 0) {
      return mcpResponse({
        text: "No competitor crawl exists for this project yet. Run a site audit against the competitor domain first.",
        meta: buildProjectMeta(context, args.projectId, `/p/${args.projectId}/audit`),
        structuredContent: {
          summary: { total: 0, added: 0, removed: 0, materiallyChanged: 0 },
          changes: [],
        },
      });
    }

    const currentAudit = audits[0];
    const previousAudit = audits[1] ?? null;
    const [currentResults, previousResults] = await Promise.all([
      AuditRepository.getAuditResultsForProject(currentAudit.id, args.projectId),
      previousAudit
        ? AuditRepository.getAuditResultsForProject(previousAudit.id, args.projectId)
        : Promise.resolve({ audit: null, pages: [], lighthouse: [], issues: [] }),
    ]);

    const comparison = summarizeCompetitorAuditChanges({
      currentAudit: {
        id: currentAudit.id,
        startedAt: currentAudit.startedAt,
      },
      previousAudit: previousAudit
        ? { id: previousAudit.id, startedAt: previousAudit.startedAt }
        : null,
      currentPages: currentResults.pages,
      previousPages: previousResults.pages,
      limit: args.limit ?? 100,
    });

    const text = comparison.summary.total
      ? [
          `Competitor changes between audits ${comparison.previousAuditId} and ${comparison.currentAuditId}: total ${comparison.summary.total}, added ${comparison.summary.added}, removed ${comparison.summary.removed}, changed ${comparison.summary.materiallyChanged}.`,
          ...comparison.changes
            .slice(0, 20)
            .map(
              (change) =>
                `- [${change.changeType}] [${change.pageType}] ${change.url}${change.title ? ` — ${change.title}` : ""}`,
            ),
        ].join("\n")
      : previousAudit
        ? `No material competitor page changes detected between audits ${previousAudit.id} and ${currentAudit.id}.`
        : `Only one competitor audit exists so far (${currentAudit.id}); run another crawl to detect changes over time.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        competitorPath(args.projectId, currentAudit.id),
      ),
      structuredContent: {
        summary: comparison.summary,
        changes: comparison.changes,
        currentAuditId: comparison.currentAuditId,
        previousAuditId: comparison.previousAuditId,
      },
    });
  }),
};
