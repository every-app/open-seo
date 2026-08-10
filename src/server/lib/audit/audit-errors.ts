/**
 * Classification of audit failures into a closed error-code vocabulary.
 *
 * Codes are written to audits.error_code by the workflow's mark-failed step
 * and by the stale-audit reconciler (which reads the message off the dead
 * Workflows instance). Keeping the vocabulary closed makes failures
 * aggregable in SQL and lets the UI map codes to friendly copy without
 * leaking raw infrastructure errors to users.
 */

const AUDIT_ERROR_CODES = [
  // A workflow step exceeded its timeout (typically a site that hangs
  // connections or a stalled DB write).
  "step_timeout",
  // The Worker isolate was killed for exceeding its 128MB memory limit.
  "oom",
  // The Worker isolate was killed for exceeding its CPU time limit.
  "cpu_limit",
  // A database query failed permanently.
  "db_error",
  // A workflow step tried to persist more than the ~1MiB durable-state cap.
  "step_output_too_large",
  // Cloudflare Workflows internal error (not caused by our code).
  "workflow_internal",
  // The workflow instance no longer exists (expired from retention or never
  // created) while the audit row still said "running".
  "instance_lost",
  // Anything we could not classify.
  "unknown",
] as const;

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];

export interface AuditErrorInfo {
  errorCode: AuditErrorCode;
  errorDetail: string;
}

const ERROR_DETAIL_MAX_CHARS = 500;

/**
 * Classify an error (thrown in the workflow, or read back from a dead
 * Workflows instance) into an AuditErrorCode. Matches the exact failure
 * messages observed in production instances.
 */
export function classifyAuditError(error: unknown): AuditErrorInfo {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);

  return {
    errorCode: classifyMessage(message),
    errorDetail: message.slice(0, ERROR_DETAIL_MAX_CHARS),
  };
}

function classifyMessage(message: string): AuditErrorCode {
  if (message.includes("exceeded memory limit")) return "oom";
  if (message.includes("exceeded CPU time limit")) return "cpu_limit";
  if (
    message.includes("WorkflowTimeoutError") ||
    message.includes("Execution timed out")
  ) {
    return "step_timeout";
  }
  if (message.includes("output is too large")) return "step_output_too_large";
  if (message.includes("WorkflowInternalError")) return "workflow_internal";
  if (
    message.startsWith("Failed query:") ||
    message.includes("D1_ERROR") ||
    message.includes("Postgres database accessed outside a request scope")
  ) {
    return "db_error";
  }
  return "unknown";
}
