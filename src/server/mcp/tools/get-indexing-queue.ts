import { z } from "zod";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  limit: z.number().int().min(1).max(500).optional(),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const outputSchema = z.object({
  events: z.array(z.object({
    id: z.string(),
    url: z.string(),
    eventType: z.string(),
    status: z.string(),
    httpStatus: z.number().nullable(),
    attempts: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
});

export const getIndexingQueueTool = {
  name: "get_indexing_queue",
  config: {
    title: "Get IndexNow indexing queue",
    description: "Return recent IndexNow submission and verification events for a project.",
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args) => {
    const events = await IndexNowService.getQueue({
      projectId: args.projectId,
      limit: args.limit,
    });
    return mcpResponse({
      text: `${events.length} recent indexing event${events.length === 1 ? "" : "s"}.`,
      structuredContent: {
        events: events.map((event) => ({
          id: event.id,
          url: event.url,
          eventType: event.eventType,
          status: event.status,
          httpStatus: event.httpStatus,
          attempts: event.attempts,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        })),
      },
    });
  }),
};
