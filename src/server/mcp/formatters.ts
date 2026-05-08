import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type McpResponseMeta = {
  url?: string;
  organizationId?: string;
  projectId?: string;
  runId?: string;
  creditsCharged?: number;
  creditsRemaining?: number;
};

export function mcpResponse(opts: {
  text: string;
  meta?: McpResponseMeta;
  structuredContent?: Record<string, unknown>;
}): CallToolResult {
  const result: CallToolResult = {
    content: [{ type: "text", text: opts.text }],
  };
  let meta: Record<string, unknown> | undefined;
  if (opts.meta) {
    meta = {};
    for (const [key, value] of Object.entries(opts.meta)) {
      if (value !== undefined) meta[key] = value;
    }
  }
  if (opts.structuredContent) {
    result.structuredContent =
      meta && Object.keys(meta).length > 0
        ? { ...opts.structuredContent, meta }
        : opts.structuredContent;
  } else if (meta && Object.keys(meta).length > 0) {
    result.structuredContent = { meta };
  }
  if (meta) {
    if (Object.keys(meta).length > 0) {
      result._meta = meta;
    }
  }
  return result;
}
