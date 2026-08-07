import { z } from "zod";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  urls: z
    .array(z.string().url())
    .min(1)
    .max(10_000)
    .describe("Absolute URLs to submit to IndexNow."),
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const outputSchema = z.object({
  submitted: z.number(),
  failed: z.number(),
  events: z.array(z.object({
    id: z.string(),
    url: z.string(),
    eventType: z.string(),
    status: z.string(),
    httpStatus: z.number().nullable(),
    attempts: z.number(),
    createdAt: z.string(),
  })),
});

export const submitIndexNowUrlsTool = {
  name: "submit_indexnow_urls",
  config: {
    title: "Submit URLs to IndexNow",
    description:
      "Submit project URLs to IndexNow and return the resulting indexing ledger events.",
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args) => {
    const result = await IndexNowService.submitUrls({
      projectId: args.projectId,
      urls: args.urls,
    });
    const events = result.events.map((event) => ({
      id: event.id,
      url: event.url,
      eventType: event.eventType,
      status: event.status,
      httpStatus: event.httpStatus,
      attempts: event.attempts,
      createdAt: event.createdAt,
    }));
    return mcpResponse({
      text: `IndexNow submitted ${result.submitted} URL${result.submitted === 1 ? "" : "s"}; ${result.failed} failed.`,
      structuredContent: {
        submitted: result.submitted,
        failed: result.failed,
        events,
      },
    });
  }),
};
