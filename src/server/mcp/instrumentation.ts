import { waitUntil } from "cloudflare:workers";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  getParseErrorMessage,
  normalizeObjectSchema,
  safeParseAsync,
  type AnySchema,
  type ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { asAppError } from "@/server/lib/errors";
import { captureServerError } from "@/server/lib/posthog";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import type { ToolExtra } from "@/server/mcp/context";

type ToolHandler<TArgs> = (
  args: TArgs,
  extra: ToolExtra,
) => CallToolResult | Promise<CallToolResult>;

/**
 * Wraps an MCP tool handler so failures reach PostHog. Unlike TanStack server
 * functions (covered by errorHandlingMiddleware), the MCP route has no error
 * middleware, so tool failures are otherwise invisible in error reporting.
 *
 * This captures two classes of failure:
 *  - Exceptions thrown by the handler (DataForSEO outages, auth failures, …),
 *    gated by shouldCaptureAppErrorCode to keep expected errors out of PostHog.
 *  - Output-schema validation failures. The SDK validates structuredContent
 *    against the output schema *after* the handler returns and converts a
 *    failure into a -32602 JSON-RPC error it never rethrows, so we re-run the
 *    same validation (via the SDK's own helpers) to surface the mismatch
 *    instead of shipping it silently.
 */
export function instrumentMcpToolHandler<TArgs>(
  toolName: string,
  outputSchema: AnySchema | ZodRawShapeCompat | undefined,
  handler: ToolHandler<TArgs>,
): (args: TArgs, extra: ToolExtra) => Promise<CallToolResult> {
  const normalizedOutputSchema = normalizeObjectSchema(outputSchema);

  return async (args, extra) => {
    try {
      const result = await handler(args, extra);
      if (
        normalizedOutputSchema &&
        !result.isError &&
        result.structuredContent
      ) {
        const validation = await safeParseAsync(
          normalizedOutputSchema,
          result.structuredContent,
        );
        if (!validation.success) {
          // getParseErrorMessage reports type-level mismatches (expected vs
          // received *types*), so it carries no row data. Keep it that way:
          // output schemas must not gain value-echoing refinements (enums on
          // user data, etc.) that would surface response values in PostHog.
          waitUntil(
            captureServerError(
              new Error(`MCP output validation failed for ${toolName}`),
              {
                errorCode: "MCP_OUTPUT_VALIDATION",
                tool: toolName,
                issues: getParseErrorMessage(validation.error).slice(0, 500),
              },
            ),
          );
        }
      }
      return result;
    } catch (error) {
      const appError = asAppError(error);
      if (shouldCaptureAppErrorCode(appError?.code)) {
        console.error(`mcp.tool error (${toolName}):`, error);
        waitUntil(
          captureServerError(error, {
            errorCode: appError?.code ?? "INTERNAL_ERROR",
            tool: toolName,
          }),
        );
      }
      throw error;
    }
  };
}
