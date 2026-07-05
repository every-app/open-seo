import { z } from "zod";
import { mcpResponse } from "@/server/mcp/formatters";
import { getAuth, type ToolExtra } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";

const inputSchema = {
  url: z
    .string()
    .url()
    .describe("Full URL to check (e.g. 'https://example.com/page')."),
  method: z
    .enum(["head", "get"])
    .optional()
    .default("head")
    .describe("HTTP method. HEAD is faster and cheaper; GET includes body."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const checkSiteStatusTool = {
  name: "check_site_status",
  config: {
    title: "Check site status",
    description:
      "Checks if a website is reachable and returns its HTTP status code, response time, and content type. Uses no DataForSEO credits. Helpful for verifying a domain is live before running paid SEO tools on it.",
    inputSchema,
    outputSchema: {
      url: z.string(),
      statusCode: z.number(),
      statusText: z.string(),
      responseTimeMs: z.number(),
      contentType: z.string().nullable(),
      contentLength: z.number().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (args: Args, extra: ToolExtra) => {
    getAuth(extra);
    const method = args.method ?? "head";

    const start = performance.now();
    let response;
    try {
      response = await fetch(args.url, { method, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      const text = `Failed to reach ${args.url}: ${err instanceof Error ? err.message : "unknown error"}`;
      return mcpResponse({ text, meta: {}, structuredContent: null });
    }
    const elapsed = Math.round(performance.now() - start);

    return mcpResponse({
      text: `${args.url}\n  Status: ${response.status} ${response.statusText}\n  Time: ${elapsed}ms\n  Type: ${response.headers.get("content-type") ?? "—"}\n  Size: ${response.headers.get("content-length") ?? "—"}`,
      meta: {},
      structuredContent: {
        url: args.url,
        statusCode: response.status,
        statusText: response.statusText,
        responseTimeMs: elapsed,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length")
          ? Number(response.headers.get("content-length"))
          : null,
      },
    });
  },
};