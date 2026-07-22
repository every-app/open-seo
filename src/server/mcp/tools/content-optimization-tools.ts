import { z } from "zod";
import { ContentOptimizationService } from "@/server/features/content-optimization/services/ContentOptimizationService";
import { CONTENT_SCAN_REGIONS } from "@/shared/content-optimization";
import { isOnPageConfigured } from "@/server/lib/onpage/client";
import { captureServerEvent } from "@/server/lib/posthog";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

/**
 * Content optimization scans via the operator's On-Page.ai account
 * (BYO ONPAGE_API_KEY, same model as DataForSEO). Both tools no-op with a
 * clear message when the key is absent.
 */

const NOT_CONFIGURED_TEXT =
  "On-Page.ai is not connected. Set ONPAGE_API_KEY (get a key at https://api.on-page.ai/install) and restart to enable content optimization scans.";

const MODULE_DISABLED_TEXT =
  "The Content Optimization module is turned off in this OpenSEO install. An operator can re-enable it under Settings > Features.";

function contentOptimizationPath(projectId: string) {
  return `/p/${projectId}/content-optimization`;
}

/** Disabled module wins over everything; missing key is the second gate. */
async function unavailableText(): Promise<string | null> {
  if (!(await ContentOptimizationService.isModuleEnabled())) {
    return MODULE_DISABLED_TEXT;
  }
  if (!(await isOnPageConfigured())) return NOT_CONFIGURED_TEXT;
  return null;
}

// ─── run_content_scan ────────────────────────────────────────────────────────

const runInputSchema = {
  projectId: projectIdSchema,
  url: z.string().min(1).max(2048).describe("Page URL to analyze."),
  keyword: z
    .string()
    .min(1)
    .max(150)
    .describe("Target search keyword to analyze the page against."),
  region: z
    .enum(CONTENT_SCAN_REGIONS)
    .optional()
    .describe("Google SERP country (ISO-3166 alpha-2, default US)."),
} as const;

type RunArgs = z.infer<z.ZodObject<typeof runInputSchema>>;

export const runContentScanTool = {
  name: "run_content_scan",
  config: {
    title: "Run content optimization scan",
    description:
      "Start a content optimization scan for a URL and keyword via the connected On-Page.ai account: entity coverage versus the live SERP cohort, structural benchmarks against the page-1 average, competitor term gaps, and content suggestions. Asynchronous (usually 30 seconds to 3 minutes); poll get_content_scan for the result. Uses On-Page.ai scan credits.",
    inputSchema: runInputSchema,
    outputSchema: z
      .object({
        jobId: z.string(),
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
    const unavailable = await unavailableText();
    if (unavailable !== null) {
      return mcpResponse({
        text: unavailable,
        meta: buildProjectMeta(
          context,
          args.projectId,
          contentOptimizationPath(args.projectId),
        ),
      });
    }
    const { jobId } = await ContentOptimizationService.startScan({
      projectId: args.projectId,
      url: args.url,
      keyword: args.keyword,
      region: args.region,
    });
    await captureServerEvent({
      distinctId: context.auth.userId,
      event: "content_optimization:scan_start",
      organizationId: context.auth.organizationId,
      properties: { projectId: args.projectId, provider: "on-page-ai" },
    });
    return mcpResponse({
      text: `Content scan started (job ${jobId}). Poll get_content_scan with this jobId; scans usually finish in 30 seconds to 3 minutes.`,
      structuredContent: { jobId },
      meta: buildProjectMeta(
        context,
        args.projectId,
        contentOptimizationPath(args.projectId),
      ),
    });
  }),
};

// ─── get_content_scan ────────────────────────────────────────────────────────

const getInputSchema = {
  projectId: projectIdSchema,
  jobId: z.string().min(1).max(128).describe("Job ID from run_content_scan."),
} as const;

type GetArgs = z.infer<z.ZodObject<typeof getInputSchema>>;

export const getContentScanTool = {
  name: "get_content_scan",
  config: {
    title: "Get content optimization scan",
    description:
      "Fetch the status or completed result of a content optimization scan started with run_content_scan. While running, returns the job status. When completed, returns the optimization score, entity coverage gaps, structural benchmarks, competitor term gaps, and content suggestions.",
    inputSchema: getInputSchema,
    outputSchema: looseObjectOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetArgs, context) => {
    const unavailable = await unavailableText();
    if (unavailable !== null) {
      return mcpResponse({
        text: unavailable,
        meta: buildProjectMeta(
          context,
          args.projectId,
          contentOptimizationPath(args.projectId),
        ),
      });
    }
    const meta = buildProjectMeta(
      context,
      args.projectId,
      contentOptimizationPath(args.projectId),
    );

    const view = await ContentOptimizationService.getView(
      args.projectId,
      args.jobId,
    );
    if (view.status === "failed" || view.status === "cancelled") {
      return mcpResponse({
        text: `Scan ${view.status}: ${view.error?.message ?? "no error details."}`,
        structuredContent: { status: view.status, error: view.error },
        meta,
      });
    }
    if (view.status !== "completed") {
      return mcpResponse({
        text: `Scan is ${view.status}. Poll again in a few seconds.`,
        structuredContent: { status: view.status },
        meta,
      });
    }

    const report = view.report;
    const missing = report.entity_coverage.natural_language_entities
      .filter((e) => e.coverage_status === "missing")
      .map((e) => e.entity);
    const weak = report.entity_coverage.natural_language_entities
      .filter((e) => e.coverage_status === "present_not_entity")
      .map((e) => e.entity);

    const digest = {
      status: "completed",
      meta: report.meta,
      on_page_optimization: report.on_page_optimization,
      entity_coverage: {
        your_url_related_entity_density_score:
          report.entity_coverage.your_url_related_entity_density_score,
        competitor_related_entity_density_score:
          report.entity_coverage.competitor_related_entity_density_score,
        missing_entities: missing,
        weak_entities: weak,
        missing_related_terms: report.entity_coverage.highly_related_terms
          .filter((t) => t.coverage_status === "missing")
          .map((t) => t.entity),
        missing_keyword_variations: report.entity_coverage.keyword_variations
          .filter((v) => v.coverage_status === "missing")
          .map((v) => v.variation),
      },
      benchmarks: report.benchmarks,
      page_category: view.pageCategory,
      ranking_page_categories:
        report.topic_and_classification.page_classification,
      suggestions: {
        suggested_title:
          report.topic_and_classification.swipe_content.suggested_title,
        topic_coverage:
          report.topic_and_classification.swipe_content.topic_coverage,
        topical_authority_questions:
          report.topic_and_classification.topical_authority_questions,
        add_internal_links_from:
          report.internal_linking.add_internal_links_from,
      },
      jobDisplayId: report.jobDisplayId ?? null,
      poweredBy: report.poweredBy ?? "On-Page.ai",
    };

    const scoreLine =
      report.on_page_optimization.score === null
        ? `Grade: ${report.on_page_optimization.grade}`
        : `Score: ${report.on_page_optimization.score}/100 (${report.on_page_optimization.grade})`;
    return mcpResponse({
      text: [
        `Content scan complete for ${report.meta.url ?? "the page"} on "${report.meta.target_keyword ?? "the keyword"}". ${scoreLine}.`,
        missing.length > 0
          ? `Missing entities (${missing.length}): ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", ..." : ""}`
          : "No missing entities detected.",
        report.on_page_optimization.summary,
      ].join("\n"),
      structuredContent: digest,
      meta,
    });
  }),
};
