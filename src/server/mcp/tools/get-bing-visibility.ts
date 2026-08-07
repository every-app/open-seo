import { z } from "zod";
import {
  BingNotConnectedError,
  BingService,
} from "@/server/features/bing/services/BingService";
import { BingApiError, BingTokenError } from "@/server/lib/bingClient";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";

const inputSchema = {
  projectId: projectIdSchema,
} as const;
type Args = z.infer<z.ZodObject<typeof inputSchema>>;

function describeBingError(error: unknown): string {
  if (error instanceof BingNotConnectedError) {
    return "Bing Webmaster is not connected for this project.";
  }
  if (error instanceof BingTokenError) {
    return "The Bing Webmaster connection has expired or was revoked. Reconnect it to continue.";
  }
  if (error instanceof BingApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export const getBingVisibilityTool = {
  name: "get_bing_visibility",
  config: {
    title: "Get Bing Webmaster visibility",
    description:
      "Read the connected Bing Webmaster property's rank and traffic visibility summary. Returns the provider's first-party response without spending DataForSEO credits.",
    inputSchema,
    outputSchema: {
      ok: z.boolean(),
      reason: z.string().optional(),
      connectUrl: z.string().optional(),
      siteUrl: z.string().optional(),
      connectedBy: z.string().nullable().optional(),
      visibility: z.unknown().optional(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const connectUrl = buildDashboardUrl(
      context.baseUrl,
      `/p/${args.projectId}/settings`,
    );
    const meta = buildProjectMeta(context, args.projectId);

    try {
      const result = await BingService.getVisibility({
        projectId: args.projectId,
      });
      return mcpResponse({
        text: `${result.siteUrl} · Bing visibility retrieved.`,
        meta,
        structuredContent: {
          ok: true,
          siteUrl: result.siteUrl,
          connectedBy: result.connectedBy,
          visibility: result.visibility,
        },
      });
    } catch (error) {
      const isNotConnected = error instanceof BingNotConnectedError;
      return mcpResponse({
        text: `${describeBingError(error)}${isNotConnected ? ` Connect it here: ${connectUrl}` : ` (reconnect at ${connectUrl})`}`,
        meta,
        structuredContent: {
          ok: false,
          reason: isNotConnected ? "not_connected" : "api_error",
          connectUrl,
        },
      });
    }
  }),
};
