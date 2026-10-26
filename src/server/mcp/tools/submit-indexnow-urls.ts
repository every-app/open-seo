import { z } from "zod";
import { IndexNowService } from "@/server/features/indexnow/services/IndexNowService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { indexNowUrlsSchema } from "@/types/schemas/indexnow";

const inputSchema = {
  projectId: projectIdSchema,
  urls: indexNowUrlsSchema.describe(
    "Absolute URLs on the project's website (any subdomain) that were added, changed, redirected or removed.",
  ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const submitIndexNowUrlsTool = {
  name: "submit_indexnow_urls",
  config: {
    title: "Submit URLs to IndexNow",
    description:
      "Tells Bing, Yandex, Seznam, Naver, Yep and other IndexNow search engines that pages on the project's website changed, so they recrawl them sooner. Google does not use IndexNow. Submit only new, updated, redirected or removed pages, not the whole site. The site must host the project's key file at the root of each host, e.g. https://www.example.com/{key}.txt containing only the key. The first call creates the project's key (keyCreated: true); when a host's result says the key file is missing, create that file on the site and call again. URLs outside the project's website are skipped. Uses no credits.",
    inputSchema,
    outputSchema: z.looseObject({
      key: z.string(),
      keyCreated: z.boolean(),
      hosts: z.array(
        z.looseObject({
          host: z.string(),
          urlCount: z.number(),
          status: z.enum(["submitted", "failed"]),
          message: z.string(),
        }),
      ),
      skipped: z.array(z.string()),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await IndexNowService.submitUrls(
      {
        projectId: args.projectId,
        organizationId: context.auth.organizationId,
      },
      args.urls,
    );
    const lines = [
      result.keyCreated
        ? `Created this project's IndexNow key: ${result.key}`
        : `IndexNow key: ${result.key}`,
      ...result.hosts.map(
        (host) => `${host.host}: ${host.status}. ${host.message}`,
      ),
      ...(result.skipped.length > 0
        ? [
            `Skipped ${result.skipped.length} URL${result.skipped.length === 1 ? "" : "s"} not on the project's website.`,
          ]
        : []),
    ];
    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/settings/integrations#indexnow`,
      ),
      structuredContent: result,
    });
  }),
};
