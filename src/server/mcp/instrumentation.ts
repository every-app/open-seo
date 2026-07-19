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
import { captureServerError, captureServerEvent } from "@/server/lib/posthog";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import { getAuth, type ToolExtra } from "@/server/mcp/context";
import { incrementSelfHostMcpToolCallCount } from "@/server/lib/self-host-telemetry";

type ToolHandler<TArgs> = (
  args: TArgs,
  extra: ToolExtra,
) => CallToolResult | Promise<CallToolResult>;

/**
 * Usage analytics for every MCP tool invocation. `clientId` distinguishes
 * external MCP clients (OAuth) from the in-app agent (first-party auth, null
 * clientId); self-hosted installs never report because captureServerEvent is
 * gated to hosted mode. Analytics must never affect the tool call, so a
 * missing auth context (e.g. in tests) is swallowed.
 */
function captureMcpToolCall(
  toolName: string,
  extra: ToolExtra,
  outcome: { success: boolean; errorCode?: string },
) {
  waitUntil(incrementSelfHostMcpToolCallCount());

  try {
    const auth = getAuth(extra);
    waitUntil(
      captureServerEvent({
        distinctId: auth.userId,
        event: "mcp:tool_call",
        organizationId: auth.organizationId,
        properties: {
          tool: toolName,
          success: outcome.success,
          error_code: outcome.errorCode,
          client_id: auth.clientId,
          source: auth.clientId ? "mcp_client" : "in_app_agent",
        },
      }),
    );
  } catch {
    // no auth context — skip analytics
  }
}

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
      // The SDK converts an output-schema mismatch into a client-visible
      // JSON-RPC error, so count it as a failed call, not a success.
      let outputValidationFailed = false;
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
          outputValidationFailed = true;
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
      captureMcpToolCall(
        toolName,
        extra,
        outputValidationFailed
          ? { success: false, errorCode: "MCP_OUTPUT_VALIDATION" }
          : { success: !result.isError },
      );
      return result;
    } catch (error) {
      const appError = asAppError(error);
      captureMcpToolCall(toolName, extra, {
        success: false,
        errorCode: appError?.code ?? "INTERNAL_ERROR",
      });
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
