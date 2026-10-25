import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";

/**
 * A hosted credential exactly as an MCP client presents it: an OAuth access
 * token or an `oseo_` API key, both sent as `Authorization: Bearer`.
 */
export type Credential = { label: string; secret: string };

export type ToolCall = { name: string; arguments?: Record<string, unknown> };

export type McpCallResult = {
  status: number;
  /** Lower-cased header names, as Playwright returns them. */
  headers: Record<string, string>;
  /** The raw response body; the leak checks scan all of it. */
  body: string;
  /**
   * Set when the server answered JSON-RPC, i.e. the credential was accepted
   * and the call reached a tool. Undefined for HTTP-level rejections (401/403).
   */
  isError: boolean | undefined;
  /**
   * The tool's text content, the JSON-RPC error message, or the raw body for
   * HTTP-level rejections.
   */
  text: string;
  structuredContent: unknown;
  /**
   * `error` from a non-JSON-RPC JSON body, e.g. the API-key path's
   * `{ error: "invalid_api_key" }` / `{ error: "account_access_revoked" }`.
   */
  errorCode: string | undefined;
};

const rpcResponseSchema = z.object({
  result: z
    .looseObject({
      isError: z.boolean().optional(),
      content: z
        .array(z.looseObject({ type: z.string(), text: z.string().optional() }))
        .optional(),
      structuredContent: z.unknown().optional(),
    })
    .optional(),
  error: z.looseObject({ code: z.number(), message: z.string() }).optional(),
});

const httpErrorSchema = z.looseObject({ error: z.string() });

function parseJson(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * One `tools/call` against the real `/mcp` route. The request carries no
 * `_meta` protocol-version envelope, so the server classifies it as legacy
 * traffic and answers plain JSON from its stateless path; a tool failure comes
 * back as `result.isError: true` with the message in `content[0].text`.
 */
export async function callTool(
  api: APIRequestContext,
  credential: Credential,
  call: ToolCall,
): Promise<McpCallResult> {
  const response = await api.post("/mcp", {
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: call.name, arguments: call.arguments ?? {} },
    },
  });
  const body = await response.text();
  const base = { status: response.status(), headers: response.headers(), body };
  const json = parseJson(body);

  const rpc = rpcResponseSchema.safeParse(json);
  if (rpc.success && rpc.data.result) {
    const { result } = rpc.data;
    return {
      ...base,
      isError: result.isError ?? false,
      text: (result.content ?? []).map((block) => block.text ?? "").join("\n"),
      structuredContent: result.structuredContent,
      errorCode: undefined,
    };
  }
  if (rpc.success && rpc.data.error) {
    return {
      ...base,
      isError: true,
      text: rpc.data.error.message,
      structuredContent: undefined,
      errorCode: undefined,
    };
  }

  const httpError = httpErrorSchema.safeParse(json);
  return {
    ...base,
    isError: undefined,
    text: body,
    structuredContent: undefined,
    errorCode: httpError.success ? httpError.data.error : undefined,
  };
}

/** A successful call's structuredContent, parsed; throws on any failure. */
export function structured<T>(
  result: McpCallResult,
  schema: z.ZodType<T>,
  what: string,
): T {
  if (result.isError !== false) {
    throw new Error(`${what} failed: HTTP ${result.status} ${result.text}`);
  }
  return schema.parse(result.structuredContent);
}

/** A one-line summary of a result for the report table. */
export function describeResult(result: McpCallResult): string {
  const auth = result.headers["www-authenticate"];
  return [
    `HTTP ${result.status}`,
    result.isError === undefined ? "" : `isError=${String(result.isError)}`,
    result.errorCode ? `error=${result.errorCode}` : "",
    auth ? `WWW-Authenticate: ${auth}` : "",
    result.text.slice(0, 120).replace(/\s+/g, " "),
  ]
    .filter(Boolean)
    .join(" | ");
}
