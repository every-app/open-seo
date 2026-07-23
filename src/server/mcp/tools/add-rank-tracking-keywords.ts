import { z } from "zod";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  estimateRankCheckCredits,
  MAX_TRACKED_KEYWORD_LENGTH,
} from "@/shared/rank-tracking";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .min(1)
    .describe(
      "Rank tracker config ID from get_rank_tracker (the `id` on each config).",
    ),
  keywords: z
    .array(z.string().min(1).max(MAX_TRACKED_KEYWORD_LENGTH))
    .min(1)
    .max(2000)
    .describe("Keywords to start tracking (1-2000). Duplicates are skipped."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const addRankTrackingKeywordsTool = {
  name: "add_rank_tracking_keywords",
  config: {
    title: "Add rank tracking keywords",
    description:
      "Add keywords to an existing rank tracker. Uses no credits on this call — keywords are stored only. Each later scheduled or manual check spends DataForSEO credits for every tracked keyword × device. Response includes a projected per-check cost for the tracker after the add (queued pricing when the tracker is scheduled; live pricing when schedule is manual). Does not start a check — use the dashboard Check Now for that. Get `trackerId` from get_rank_tracker.",
    inputSchema,
    outputSchema: {
      projectId: z.string(),
      trackerId: z.string(),
      added: z.number(),
      addedIds: z.array(z.string()),
      keywordCount: z.number(),
      costUsd: z.number(),
      costCredits: z.number(),
      costMethod: z.enum(["live", "queued"]),
      scheduleInterval: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const { added, addedIds } = await RankTrackingService.addKeywords(
      args.trackerId,
      args.projectId,
      args.keywords,
    );
    const config = await RankTrackingRepository.getConfigById({
      configId: args.trackerId,
      projectId: args.projectId,
    });
    if (!config) {
      throw new Error(
        `Rank tracker ${args.trackerId} not found in project ${args.projectId}.`,
      );
    }
    const keywordCount = await RankTrackingRepository.getKeywordCountForConfig(
      args.trackerId,
    );
    const costMethod = config.scheduleInterval === "manual" ? "live" : "queued";
    const { costUsd, costCredits } = estimateRankCheckCredits(
      keywordCount,
      config.devices,
      config.serpDepth,
      costMethod,
    );

    return mcpResponse({
      text: `Added ${added} keyword${added === 1 ? "" : "s"} to tracker ${args.trackerId} (${config.domain}). Now tracking ${keywordCount}. Projected ${costMethod} check: ~$${costUsd.toFixed(4)} (${costCredits} credits). No check was started.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${args.trackerId}`,
      ),
      structuredContent: {
        projectId: args.projectId,
        trackerId: args.trackerId,
        added,
        addedIds,
        keywordCount,
        costUsd,
        costCredits,
        costMethod,
        scheduleInterval: config.scheduleInterval,
      },
    });
  }),
};
