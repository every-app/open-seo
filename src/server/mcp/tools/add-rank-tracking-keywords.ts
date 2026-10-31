import { z } from "zod";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { asAppError } from "@/server/lib/errors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .uuid()
    .describe("Rank tracker ID from get_rank_tracker."),
  keywords: z
    .array(z.string().min(1).max(MAX_TRACKED_KEYWORD_LENGTH))
    .min(1)
    .max(2000)
    .describe("Keywords to track. Existing and repeated keywords are skipped."),
  matchCase: z
    .boolean()
    .optional()
    .describe(
      "Track the keywords exactly as typed instead of lowercasing them. Defaults to false. Use for brand names where Google's results differ by capitalization; a cased keyword is tracked and billed separately from its lowercase form.",
    ),
  maxEstimatedScheduledCheckCredits: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Most credits per scheduled check, including retries, that the user approved after seeing estimate_rank_tracker_cost with additionalKeywords. Required for scheduled trackers.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

// The keywords are saved before this runs, so a billing refusal is reported
// rather than thrown: failing the call would read as the add having failed.
async function fetchKeywordMetrics(
  args: Args,
  billing: BillingCustomerContext,
) {
  try {
    const { updated } = await RankTrackingService.refreshKeywordMetrics(
      args.trackerId,
      args.projectId,
      billing,
    );
    return ` Fetched search volume, difficulty and CPC for ${updated} keyword${updated === 1 ? "" : "s"}.`;
  } catch (error) {
    const code = asAppError(error)?.code;
    if (code !== "PAYMENT_REQUIRED" && code !== "INSUFFICIENT_CREDITS") {
      throw error;
    }
    return ` Search volume was not fetched (${code}).`;
  }
}

export const addRankTrackingKeywordsTool = {
  name: "add_rank_tracking_keywords",
  config: {
    title: "Add rank tracking keywords",
    description:
      "Add keywords to an existing rank tracker. It also fetches search volume, difficulty and CPC for the tracker's keywords, which uses credits like get_keyword_metrics. It does not start a check, but scheduled trackers will spend credits on future recurring public Google searches. For a scheduled tracker, call estimate_rank_tracker_cost with additionalKeywords, show the recurring estimate to the user, and pass the approved per-check estimate as maxEstimatedScheduledCheckCredits. The estimate is the most a check can cost, including retries. Existing and repeated keywords are skipped, and `added` is the number actually inserted.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        requested: z.number(),
        added: z.number(),
        addedIds: z.array(z.string()),
        scheduledEstimate: z
          .looseObject({
            scheduleInterval: z.enum(["daily", "weekly", "monthly"]),
            costUsd: z.number(),
            costCredits: z.number(),
            checksPerMonth: z.number(),
            monthlyCostUsd: z.number(),
            monthlyCostCredits: z.number(),
          })
          .optional(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await RankTrackingService.addKeywords(
      args.trackerId,
      args.projectId,
      args.keywords,
      {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits:
          args.maxEstimatedScheduledCheckCredits,
      },
      args.matchCase,
    );
    const requested = args.keywords.length;
    const metricsNote =
      result.added > 0 ? await fetchKeywordMetrics(args, context.billing) : "";
    return mcpResponse({
      text: `Added ${result.added} of ${requested} requested keyword${requested === 1 ? "" : "s"} to tracker ${args.trackerId}. No check was started.${metricsNote}${result.scheduledEstimate ? ` Future ${result.scheduledEstimate.scheduleInterval} checks cost at most ${result.scheduledEstimate.costCredits} credits each, including retries (up to ~${result.scheduledEstimate.monthlyCostCredits} credits/month).` : ""}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        trackerId: args.trackerId,
        requested,
        ...result,
      },
    });
  }),
};
