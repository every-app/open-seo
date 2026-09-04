import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { IndexNowService } from "@/server/features/indexnow/IndexNowService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { indexNowUrlsSchema } from "@/shared/indexnow";

const inputSchema = {
  projectId: projectIdSchema,
  urls: indexNowUrlsSchema,
  confirmed: z
    .literal(true)
    .describe(
      "Must be true: this sends notifications to external search engines.",
    ),
} as const;

type SubmitArgs = z.infer<z.ZodObject<typeof inputSchema>>;

export const submitUrlsIndexNowTool = {
  name: "submit_urls_indexnow",
  config: {
    title: "Submit URLs to IndexNow",
    description:
      "Notify IndexNow about public URLs that changed. The project key must already be published and verified. Acceptance means received, not crawled or indexed. Free; uses no OpenSEO credits.",
    inputSchema,
    outputSchema: {
      ok: z.boolean(),
      submissionId: z.string(),
      status: z.string(),
      requestedUrlCount: z.number(),
      uniqueUrlCount: z.number(),
      chunks: z.array(looseObjectOutputSchema),
      meaning: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: SubmitArgs, context) => {
    requireOrgPermission(context.auth, { integration: ["manage"] });
    const result = await IndexNowService.submit({
      projectId: args.projectId,
      userId: context.auth.userId,
      urls: args.urls,
      confirmed: args.confirmed,
    });
    return mcpResponse({
      text: `${result.uniqueUrlCount} unique URL(s) sent in ${result.chunks.length} chunk(s). Status: ${result.status}. ${result.meaning}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/settings/integrations`,
      ),
      structuredContent: { ok: result.status === "received", ...result },
    });
  }),
};
