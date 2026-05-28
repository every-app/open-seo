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
  const hasMeta = meta != null && Object.keys(meta).length > 0;
  if (opts.structuredContent) {
    result.structuredContent = hasMeta
      ? { ...opts.structuredContent, meta }
      : opts.structuredContent;
  } else if (hasMeta) {
    result.structuredContent = { meta };
  }
  if (hasMeta) {
    result._meta = meta;
  }
  return result;
}
