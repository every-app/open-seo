import { z } from "zod";
import { waitUntil } from "cloudflare:workers";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { captureServerEvent } from "@/server/lib/posthog";
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
  maxCostCredits: z
    .number()
    .int()
    .positive()
    .describe(
      "Maximum credits the user approved after seeing estimate_rank_tracker_cost. The run is rejected if its fresh estimate is higher.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const runRankTrackerTool = {
  name: "run_rank_tracker",
  config: {
    title: "Run rank tracker",
    description:
      "Start an explicit live rank check for every keyword and configured device. This spends credits: call estimate_rank_tracker_cost, show the estimate to the user, and pass the approved credit amount as maxCostCredits. A fresh estimate above that ceiling is rejected. Hosted accounts require a paid plan, while self-hosted deployments are not plan-gated. If a run is already in progress, its blocking run ID is reported without starting or charging another check. The schedule is unchanged.",
    inputSchema,
    outputSchema: z
      .object({
        trackerId: z.string(),
        started: z.boolean(),
        runId: z.string().optional(),
        blockingRunId: z.string().nullable().optional(),
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
    const result = await RankTrackingService.triggerCheck({
      configId: args.trackerId,
      projectId: args.projectId,
      billingCustomer: context.billing,
      maxCostCredits: args.maxCostCredits,
    });
    const trackerPath = `/p/${args.projectId}/rank-tracking/${args.trackerId}`;

    if (!result.ok) {
      return mcpResponse({
        text: `A rank check is already running for tracker ${args.trackerId}${result.blockingRunId ? ` (run ${result.blockingRunId})` : ""}. No new run was created and no additional check was charged. Poll get_rank_tracker until lastCheckedAt advances.`,
        meta: buildProjectMeta(context, args.projectId, trackerPath),
        structuredContent: {
          trackerId: args.trackerId,
          started: false,
          blockingRunId: result.blockingRunId,
        },
      });
    }

    waitUntil(
      captureServerEvent({
        distinctId: context.auth.userId,
        event: "rank_tracking:check_trigger",
        organizationId: context.auth.organizationId,
        properties: {
          project_id: args.projectId,
          config_id: args.trackerId,
          run_id: result.runId,
          source: "mcp",
        },
      }),
    );

    return mcpResponse({
      text: `Rank check ${result.runId} started for tracker ${args.trackerId}. Poll get_rank_tracker until lastCheckedAt advances, then read the updated positions.`,
      meta: buildProjectMeta(context, args.projectId, trackerPath),
      structuredContent: {
        trackerId: args.trackerId,
        started: true,
        runId: result.runId,
      },
    });
  }),
};
