import { z } from "zod";
import { waitUntil } from "cloudflare:workers";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { AppError } from "@/server/lib/errors";
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
      "Start a rank check now for every keyword and device in a tracker. This spends credits: call estimate_rank_tracker_cost, show the estimate to the user, and pass the approved credit amount as maxCostCredits; a fresh estimate above that ceiling is rejected. Hosted accounts need a paid plan. If a check is already running, its run ID is reported without starting or charging another. The schedule is unchanged. The check runs in the background: poll get_rank_tracker for the updated positions.",
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
    }).catch((error: unknown) => {
      if (error instanceof AppError && error.code === "PAYMENT_REQUIRED")
        throw new AppError(
          "PAYMENT_REQUIRED",
          "Rank checks need a paid OpenSEO plan, and this account doesn't have one. If Search Console is connected, get_search_console_performance shows the site's average positions for free; get_serp_results checks one keyword's live results for credits.",
        );
      throw error;
    });
    const trackerPath = `/p/${args.projectId}/rank-tracking/${args.trackerId}`;

    if (!result.ok) {
      return mcpResponse({
        text: `A rank check is already running for tracker ${args.trackerId}${result.blockingRunId ? ` (run ${result.blockingRunId})` : ""}. No new run was created and no additional check was charged. Poll get_rank_tracker with this trackerId until its Latest run line no longer says pending or running.`,
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
      text: `Rank check ${result.runId} started for tracker ${args.trackerId}. It reads every keyword several times, so it can take up to 2 hours. Poll get_rank_tracker with this trackerId until its Latest run line no longer says pending or running, then read the updated positions.`,
      meta: buildProjectMeta(context, args.projectId, trackerPath),
      structuredContent: {
        trackerId: args.trackerId,
        started: true,
        runId: result.runId,
      },
    });
  }),
};
