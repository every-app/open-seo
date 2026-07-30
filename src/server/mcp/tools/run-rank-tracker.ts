import { z } from "zod";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  trackerId: z
    .string()
    .min(1)
    .describe(
      "Rank tracker config ID to check. Get one from get_rank_tracker.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const runRankTrackerTool = {
  name: "run_rank_tracker",
  config: {
    title: "Run rank tracker",
    description:
      "Trigger an on-demand rank check for a tracker's keywords. Charges credits — one SERP check per keyword per device, so a 50-keyword desktop-only tracker costs 50 checks. Runs in the background; poll get_rank_tracker with the same trackerId until `lastCheckedAt` advances, then read the positions. Use this when a scheduled check was missed or you need positions fresher than the tracker's interval; the schedule itself is unchanged.",
    inputSchema,
    outputSchema: z
      .object({
        runId: z.string().optional(),
        started: z.boolean(),
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
    const trackerPath = `/p/${args.projectId}/rank-tracking/${args.trackerId}`;

    const config = await RankTrackingRepository.getConfigById({
      configId: args.trackerId,
      projectId: args.projectId,
    });
    if (!config) {
      throw new AppError(
        "NOT_FOUND",
        `Rank tracker ${args.trackerId} not found in project ${args.projectId}. List trackers with get_rank_tracker.`,
      );
    }

    const result = await RankTrackingService.triggerCheck({
      configId: args.trackerId,
      projectId: args.projectId,
      billingCustomer: context.billing,
    });

    // A check already in flight is an expected outcome, not a failure — report
    // it plainly so the caller polls instead of retrying and double-charging.
    if (!result.ok) {
      return mcpResponse({
        text: `A rank check is already running for ${config.domain}${
          result.blockingRunId ? ` (run ${result.blockingRunId})` : ""
        }. No new check was started and nothing was charged. Poll get_rank_tracker until \`lastCheckedAt\` advances.`,
        meta: buildProjectMeta(context, args.projectId, trackerPath),
        structuredContent: { started: false },
      });
    }

    await captureServerEvent({
      distinctId: context.auth.userId,
      event: "rank_check:start",
      organizationId: context.auth.organizationId,
      properties: {
        project_id: args.projectId,
        tracker_id: args.trackerId,
        source: "mcp",
      },
    });

    return mcpResponse({
      text: `Rank check ${result.runId} started for ${config.domain} (${config.devices}, top ${config.serpDepth}). Poll get_rank_tracker with trackerId ${args.trackerId} until \`lastCheckedAt\` advances, then read the positions.`,
      meta: buildProjectMeta(context, args.projectId, trackerPath),
      structuredContent: { runId: result.runId, started: true },
    });
  }),
};
