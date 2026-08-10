import { z } from "zod";
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
  additionalKeywordCount: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe(
      "Number of keywords you plan to add. Include this before adding to a scheduled tracker so the response projects its recurring per-check and monthly cost.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const estimateRankTrackerCostTool = {
  name: "estimate_rank_tracker_cost",
  config: {
    title: "Estimate rank tracker cost",
    description:
      "Estimate rank tracker cost without spending credits or starting a check. The live estimate covers one explicit run_rank_tracker check. For a scheduled tracker, the response also includes nominal queued per-check and approximate monthly recurring cost. Pass additionalKeywordCount before adding keywords to project the post-add cost. Scheduled estimates are not runtime caps; rejected, failed, or timed-out queued tasks may use additional separately billed live fallback.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        costUsd: z.number(),
        costCredits: z.number(),
        keywordCount: z.number(),
        devicesCount: z.number(),
        totalChecks: z.number(),
        method: z.literal("live"),
        existingKeywordCount: z.number(),
        additionalKeywordCount: z.number(),
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
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const estimate = await RankTrackingService.estimateCost(
      args.trackerId,
      args.projectId,
      args.additionalKeywordCount,
    );
    return mcpResponse({
      text: `One live check for tracker ${args.trackerId} is estimated at $${estimate.costUsd.toFixed(4)} (${estimate.costCredits} credits): ${estimate.keywordCount} keyword${estimate.keywordCount === 1 ? "" : "s"} × ${estimate.devicesCount} device${estimate.devicesCount === 1 ? "" : "s"} = ${estimate.totalChecks} SERP checks.${estimate.additionalKeywordCount > 0 ? ` This projects ${estimate.additionalKeywordCount} additional keyword${estimate.additionalKeywordCount === 1 ? "" : "s"}.` : ""}${estimate.scheduledEstimate ? ` Its ${estimate.scheduledEstimate.scheduleInterval} queued checks have a nominal estimate of $${estimate.scheduledEstimate.costUsd.toFixed(4)} (${estimate.scheduledEstimate.costCredits} credits) each, or about $${estimate.scheduledEstimate.monthlyCostUsd.toFixed(4)} (${estimate.scheduledEstimate.monthlyCostCredits} credits) per month. Show the user that rejected, failed, or timed-out queued tasks may use additional separately billed live fallback, then use the per-check estimate as maxEstimatedScheduledCheckCredits when adding keywords.` : ""} No check was started.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: { trackerId: args.trackerId, ...estimate },
    });
  }),
};
