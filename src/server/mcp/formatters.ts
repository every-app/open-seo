import type { CallToolResult } from "@modelcontextprotocol/server";

// This limits the combined human/model-readable text, not structured data,
// serialized response bytes, or model tokens.
export const MCP_TEXT_CHAR_BUDGET = 40_000;

type McpResponseMeta = {
  url?: string;
  projectId?: string;
  runId?: string;
  creditsCharged?: number;
  creditsRemaining?: number;
};

// The generic overload preserves each tool's concrete structuredContent shape
// so tests (and callers) can access fields without casting. The type parameter
// appears in exactly one position — a required `structuredContent: T` — which
// is what makes inference work; a `T` shared between an optional field and an
// intersection member collapses to `{}`.
export function mcpResponse<T extends Record<string, unknown>>(opts: {
  text: string;
  meta?: McpResponseMeta;
  structuredContent: T;
}): CallToolResult & {
  structuredContent: T & { meta?: Record<string, unknown> };
};
export function mcpResponse(opts: {
  text: string;
  meta?: McpResponseMeta;
}): CallToolResult;
export function mcpResponse(opts: {
  text: string;
  meta?: McpResponseMeta;
  structuredContent?: Record<string, unknown>;
}): CallToolResult {
  const truncationNotice =
    `\n\n[Text truncated at ${MCP_TEXT_CHAR_BUDGET.toLocaleString("en-US")} characters; this is partial text output. ` +
    (opts.structuredContent
      ? "The structuredContent payload is unchanged. "
      : "") +
    "Use pagination or a narrower request where supported; another call may charge credits.]";
  const text =
    opts.text.length > MCP_TEXT_CHAR_BUDGET
      ? opts.text.slice(0, MCP_TEXT_CHAR_BUDGET - truncationNotice.length) +
        truncationNotice
      : opts.text;
  const result: CallToolResult = {
    content: [{ type: "text", text }],
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

/**
 * A short preview of a long text field for a list response. mcpResponse puts
 * `text` AND `structuredContent` on the wire and clients count both, so a list
 * page carries every preview twice — full summaries or instructions at their
 * caps would be tens of KB on the one call every agent is told to make first.
 * The single-item read is where the whole field is returned.
 */
export const truncatePreview = (value: string, max = 300) =>
  value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;
