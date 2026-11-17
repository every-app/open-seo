import { z } from "zod";
import { MAX_KEYWORDS_PER_CONFIG } from "@/shared/rank-tracking";
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
    .max(MAX_KEYWORDS_PER_CONFIG)
    .optional()
    .describe(
      "Number of keywords you plan to add, priced as plain keywords. Prefer additionalKeywords when you know them.",
    ),
  additionalKeywords: z
    .array(z.string())
    .max(MAX_KEYWORDS_PER_CONFIG)
    .optional()
    .describe(
      "Keywords you plan to add. Include these before adding to a scheduled tracker so the response projects its recurring per-check and monthly cost; keywords with search operators such as site: cost 5x. Overrides additionalKeywordCount.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const estimateRankTrackerCostTool = {
  name: "estimate_rank_tracker_cost",
  config: {
    title: "Estimate rank tracker cost",
    description:
      "Estimate what a rank tracker check costs, without spending credits or starting a check. The estimate is the most a check can cost: two reads of every keyword and device. Most get one read, so a check usually costs a little over half the estimate. It covers one run_rank_tracker check; for a scheduled tracker, the response adds the per-check and approximate monthly cost. Pass additionalKeywords to price the tracker after adding keywords. Pass the estimate the user approves as maxCostCredits to run_rank_tracker, or as maxEstimatedScheduledCheckCredits to add_rank_tracking_keywords.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        costUsd: z.number(),
        costCredits: z.number(),
        keywordCount: z.number(),
        devicesCount: z.number(),
        totalChecks: z.number(),
        existingKeywordCount: z.number(),
        additionalKeywordCount: z.number(),
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
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const estimate = await RankTrackingService.estimateCost(
      args.trackerId,
      args.projectId,
      context.billing.organizationId,
      // A bare count has no keyword text, so it prices as plain keywords.
      args.additionalKeywords ??
        Array<string>(args.additionalKeywordCount ?? 0).fill(""),
    );
    return mcpResponse({
      text: `One check for tracker ${args.trackerId} costs at most $${estimate.costUsd.toFixed(4)} (${estimate.costCredits} credits, for up to 2 reads each):${estimate.keywordCount} keyword${estimate.keywordCount === 1 ? "" : "s"} × ${estimate.devicesCount} device${estimate.devicesCount === 1 ? "" : "s"} = ${estimate.totalChecks} SERP checks.${estimate.additionalKeywordCount > 0 ? ` This projects ${estimate.additionalKeywordCount} additional keyword${estimate.additionalKeywordCount === 1 ? "" : "s"}.` : ""}${estimate.scheduledEstimate ? ` Its ${estimate.scheduledEstimate.scheduleInterval} checks cost at most $${estimate.scheduledEstimate.costUsd.toFixed(4)} (${estimate.scheduledEstimate.costCredits} credits) each, or up to about $${estimate.scheduledEstimate.monthlyCostUsd.toFixed(4)} (${estimate.scheduledEstimate.monthlyCostCredits} credits) per month. Use the per-check estimate as maxEstimatedScheduledCheckCredits when adding keywords.` : ""} No check was started.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: { trackerId: args.trackerId, ...estimate },
    });
  }),
};
