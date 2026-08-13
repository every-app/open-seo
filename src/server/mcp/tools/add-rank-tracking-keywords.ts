import { z } from "zod";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
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
  maxEstimatedScheduledCheckCredits: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Nominal queued credits per scheduled check that the user approved after seeing estimate_rank_tracker_cost with additionalKeywordCount. Required for scheduled trackers. This is an estimate approval, not a runtime cap; live fallback may add separately billed credits.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const addRankTrackingKeywordsTool = {
  name: "add_rank_tracking_keywords",
  config: {
    title: "Add rank tracking keywords",
    description:
      "Add keywords to an existing rank tracker. The mutation itself uses no credits and does not start a check or fetch metrics, but scheduled trackers will spend credits on future recurring checks. For a scheduled tracker, call estimate_rank_tracker_cost with additionalKeywordCount, show the recurring estimate and live-fallback caveat to the user, and pass the approved nominal per-check estimate as maxEstimatedScheduledCheckCredits. This approval is not a runtime spending cap: rejected, failed, or timed-out queued tasks may use additional separately billed live fallback. Existing and repeated keywords are skipped, and `added` is the number actually inserted.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        requested: z.number(),
        added: z.number(),
        addedIds: z.array(z.string()),
        scheduledEstimate: z
          .object({
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
      openWorldHint: false,
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
    );
    const requested = args.keywords.length;
    return mcpResponse({
      text: `Added ${result.added} of ${requested} requested keyword${requested === 1 ? "" : "s"} to tracker ${args.trackerId}. No check was started and no credits were used.${result.scheduledEstimate ? ` Future ${result.scheduledEstimate.scheduleInterval} checks have a nominal estimate of ${result.scheduledEstimate.costCredits} credits each (~${result.scheduledEstimate.monthlyCostCredits} credits/month); live fallback may add separately billed credits.` : ""}`,
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
