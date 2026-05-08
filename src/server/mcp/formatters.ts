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
  if (opts.structuredContent) {
    result.structuredContent = opts.structuredContent;
  }
  if (opts.meta) {
    // Drop undefined keys so the wire payload stays clean.
    const meta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts.meta)) {
      if (value !== undefined) meta[key] = value;
    }
    if (Object.keys(meta).length > 0) {
      result._meta = meta;
    }
  }
  return result;
}
