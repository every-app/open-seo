import { z } from "zod";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  deriveIndexNowKey,
  indexNowHostFromDomain,
  indexNowKeyLocation,
  partitionUrlsByHost,
  submitToIndexNow,
} from "@/server/lib/indexnow";

const DOMAIN_REQUIRED_MESSAGE =
  "This project has no domain set. Add a domain to the project first, then retry.";

export const getIndexNowKeyTool = {
  name: "get_indexnow_key",
  config: {
    title: "Get IndexNow key",
    description:
      "Return the project's IndexNow key and the verification file to publish. Uses no credits. The key is derived deterministically from the project (stable across restarts). To activate IndexNow, host a file at the returned keyLocation whose entire contents are the key; then submit URLs with submit_urls_indexnow. Requires the project to have a domain.",
    inputSchema: { projectId: projectIdSchema },
    outputSchema: {
      host: z.string(),
      key: z.string(),
      keyLocation: z.string(),
      keyFileContent: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: { projectId: string }, context) => {
    const host = indexNowHostFromDomain(context.project.domain);
    if (!host) {
      throw new Error(DOMAIN_REQUIRED_MESSAGE);
    }
    const key = await deriveIndexNowKey(context.project.id);
    const keyLocation = indexNowKeyLocation(host, key);
    return mcpResponse({
      text: `IndexNow key for ${host}: ${key}\nPublish ${keyLocation} containing exactly:\n${key}\nThen call submit_urls_indexnow to notify Bing/Yandex.`,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: {
        host,
        key,
        keyLocation,
        keyFileContent: key,
      },
    });
  }),
};

export const submitUrlsIndexNowTool = {
  name: "submit_urls_indexnow",
  config: {
    title: "Submit URLs to IndexNow",
    description:
      "Notify Bing, Yandex, and other IndexNow engines that URLs are new or updated — free, no DataForSEO credits, typically indexed within seconds. All URLs must be on the project's domain (cross-host URLs are skipped and reported). The verification file from get_indexnow_key must already be published at the domain root, or engines will ignore the submission.",
    inputSchema: {
      projectId: projectIdSchema,
      urls: z
        .array(z.string().url())
        .min(1)
        .max(10000)
        .describe(
          "Absolute URLs on the project's domain to (re)index (1-10000).",
        ),
    },
    outputSchema: {
      host: z.string(),
      submitted: z.number(),
      skipped: z.array(z.string()),
      status: z.number(),
      ok: z.boolean(),
      keyLocation: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: { projectId: string; urls: string[] }, context) => {
      const host = indexNowHostFromDomain(context.project.domain);
      if (!host) {
        throw new Error(DOMAIN_REQUIRED_MESSAGE);
      }
      const { matching, mismatched } = partitionUrlsByHost(args.urls, host);
      if (matching.length === 0) {
        throw new Error(
          `None of the submitted URLs are on ${host}. IndexNow only accepts URLs for the project's own host.`,
        );
      }
      const key = await deriveIndexNowKey(context.project.id);
      const keyLocation = indexNowKeyLocation(host, key);
      const result = await submitToIndexNow({
        host,
        key,
        keyLocation,
        urlList: matching,
      });
      const skippedNote =
        mismatched.length > 0
          ? ` Skipped ${mismatched.length} URL(s) not on ${host}.`
          : "";
      return mcpResponse({
        text: `Submitted ${result.submitted} URL(s) for ${host} to IndexNow (HTTP ${result.status}).${skippedNote}`,
        meta: buildProjectMeta(context, args.projectId),
        structuredContent: {
          host,
          submitted: result.submitted,
          skipped: mismatched,
          status: result.status,
          ok: result.ok,
          keyLocation,
        },
      });
    },
  ),
};
