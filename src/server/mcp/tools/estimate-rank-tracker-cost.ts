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
      "Number of keywords you plan to add, priced as plain keywords. Prefer additionalKeywords when you know them.",
    ),
  additionalKeywords: z
    .array(z.string())
    .max(1000)
    .optional()
    .describe(
      "Keywords you plan to add. Include these before adding to a scheduled tracker so the response projects its recurring per-check and monthly cost; keywords with search operators such as site: cost 5x. Overrides additionalKeywordCount.",
    ),
  validated: z
    .boolean()
    .optional()
    .describe(
      "Price a validated check (run_rank_tracker with validated: true): queued pricing at its worst case of four crawls per SERP check, which is the figure to approve as maxCostCredits. Typical spend is lower.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const estimateRankTrackerCostTool = {
  name: "estimate_rank_tracker_cost",
  config: {
    title: "Estimate rank tracker cost",
    description:
      "Estimate rank tracker cost without spending credits or starting a check. Each estimate is the most a check can cost. The live estimate covers one explicit run_rank_tracker check and includes up to two queued retries of every keyword/device check, which run only for checks that error or read as lost, so most checks cost less. Pass validated: true for the worst-case figure of a validated check, priced at four crawls per SERP check in place of those retries. For a scheduled tracker, the response also includes the queued per-check and approximate monthly recurring cost. Pass additionalKeywords before adding keywords to project the post-add cost.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        costUsd: z.number(),
        costCredits: z.number(),
        keywordCount: z.number(),
        devicesCount: z.number(),
        totalChecks: z.number(),
        method: z.enum(["live", "queued"]),
        validated: z.boolean(),
        crawlsPerCheck: z.number(),
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
      // A bare count has no keyword text, so it prices as plain keywords.
      args.additionalKeywords ??
        Array<string>(args.additionalKeywordCount ?? 0).fill(""),
      { validated: args.validated },
    );
    return mcpResponse({
      text: `One ${estimate.validated ? "validated" : "live"} check for tracker ${args.trackerId} costs at most $${estimate.costUsd.toFixed(4)} (${estimate.costCredits} credits, ${estimate.validated ? `priced at the worst case of ${estimate.crawlsPerCheck} crawls each; typical spend is lower` : "including retries"}): ${estimate.keywordCount} keyword${estimate.keywordCount === 1 ? "" : "s"} × ${estimate.devicesCount} device${estimate.devicesCount === 1 ? "" : "s"} = ${estimate.totalChecks} SERP checks.${estimate.additionalKeywordCount > 0 ? ` This projects ${estimate.additionalKeywordCount} additional keyword${estimate.additionalKeywordCount === 1 ? "" : "s"}.` : ""}${estimate.scheduledEstimate ? ` Its ${estimate.scheduledEstimate.scheduleInterval} queued checks cost at most $${estimate.scheduledEstimate.costUsd.toFixed(4)} (${estimate.scheduledEstimate.costCredits} credits) each, or up to about $${estimate.scheduledEstimate.monthlyCostUsd.toFixed(4)} (${estimate.scheduledEstimate.monthlyCostCredits} credits) per month. Use the per-check estimate as maxEstimatedScheduledCheckCredits when adding keywords.` : ""} No check was started.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: { trackerId: args.trackerId, ...estimate },
    });
  }),
};
