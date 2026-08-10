import { waitUntil } from "cloudflare:workers";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { asAppError } from "@/server/lib/errors";
import { recordExternalMcpToolCall } from "@/server/features/activation/mcpActivation";
import { captureServerError, captureServerEvent } from "@/server/lib/posthog";
import { shouldCaptureAppErrorCode } from "@/shared/error-codes";
import { type ToolContext } from "@/server/mcp/context";
import { incrementSelfHostMcpToolCallCount } from "@/server/lib/self-host-telemetry";

type ToolHandler<TArgs> = (
  args: TArgs,
  context: ToolContext,
) => CallToolResult | Promise<CallToolResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatValidationIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ")
    .slice(0, 500);
}

/**
 * Usage analytics for every MCP tool invocation. `clientId` distinguishes
 * external MCP clients (OAuth) from the in-app agent (first-party auth, null
 * clientId); self-hosted installs never report because captureServerEvent is
 * gated to hosted mode.
 */
function captureMcpToolCall(
  toolName: string,
  context: ToolContext,
  outcome: {
    success: boolean;
    errorCode?: string;
    durationMs?: number;
    projectId?: string;
    rowCount?: number;
    quotaRemaining?: number;
  },
) {
  waitUntil(incrementSelfHostMcpToolCallCount());

  const auth = context.auth;
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
        duration_ms: outcome.durationMs,
        project_id: outcome.projectId,
        row_count: outcome.rowCount,
        quota_remaining: outcome.quotaRemaining,
      },
    }),
  );
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
 *    same validation to surface the mismatch instead of shipping it silently.
 */
export function instrumentMcpToolHandler<TArgs>(
  toolName: string,
  outputSchema: z.ZodType | undefined,
  handler: ToolHandler<TArgs>,
): (args: TArgs, context: ToolContext) => Promise<CallToolResult> {
  return async (args, context) => {
    const startedAt = performance.now();
    try {
      const result = await handler(args, context);
      // The SDK converts an output-schema mismatch into a client-visible
      // JSON-RPC error, so count it as a failed call, not a success.
      let outputValidationFailed = false;
      if (outputSchema && !result.isError && result.structuredContent) {
        const validation = await outputSchema.safeParseAsync(
          result.structuredContent,
        );
        if (!validation.success) {
          outputValidationFailed = true;
          // Keep this type-level and privacy-safe: output schemas must not gain
          // value-echoing refinements that would surface response data here.
          waitUntil(
            captureServerError(
              new Error(`MCP output validation failed for ${toolName}`),
              {
                errorCode: "MCP_OUTPUT_VALIDATION",
                tool: toolName,
                issues: formatValidationIssues(validation.error),
              },
            ),
          );
        }
      }
      const structured = isRecord(result.structuredContent)
        ? result.structuredContent
        : undefined;
      const returnedFailure =
        structured?.status === "error" || structured?.ok === false;
      const returnedError =
        structured?.status === "error" && isRecord(structured.error)
          ? structured.error.code
          : undefined;
      const returnedReason =
        structured?.ok === false ? structured.reason : undefined;
      const meta = isRecord(structured?.meta) ? structured.meta : undefined;
      const quota = isRecord(structured?.quota) ? structured.quota : undefined;
      const tokensPerDay = isRecord(quota?.tokensPerDay)
        ? quota.tokensPerDay
        : undefined;
      const returnedFailureCode =
        typeof returnedError === "string"
          ? returnedError
          : typeof returnedReason === "string"
            ? returnedReason
            : undefined;
      const succeeded =
        !result.isError && !outputValidationFailed && !returnedFailure;
      captureMcpToolCall(
        toolName,
        context,
        outputValidationFailed
          ? {
              success: false,
              errorCode: "MCP_OUTPUT_VALIDATION",
              durationMs: Math.round(performance.now() - startedAt),
            }
          : {
              success: succeeded,
              errorCode: returnedFailureCode,
              durationMs: Math.round(performance.now() - startedAt),
              projectId:
                typeof meta?.projectId === "string"
                  ? meta.projectId
                  : undefined,
              rowCount:
                typeof structured?.rowCount === "number"
                  ? structured.rowCount
                  : undefined,
              quotaRemaining:
                typeof tokensPerDay?.remaining === "number"
                  ? tokensPerDay.remaining
                  : undefined,
            },
      );
      // Dashboard activation milestone: a successful call from an external
      // MCP client (OAuth clientId; SAM and the self-hosted transport are
      // first-party with clientId null). Awaited so the write stays inside
      // the request's DB scope; a per-isolate memo keeps this off the hot
      // path after the first call.
      if (succeeded) {
        const auth = context.auth;
        if (auth.clientId) {
          await recordExternalMcpToolCall(auth.organizationId);
        }
      }
      return result;
    } catch (error) {
      const appError = asAppError(error);
      captureMcpToolCall(toolName, context, {
        success: false,
        errorCode: appError?.code ?? "INTERNAL_ERROR",
        durationMs: Math.round(performance.now() - startedAt),
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
