import {
  classifyToolErrorText,
  type ClassifiedToolError,
  type ToolFailureClass,
} from "./samToolRecovery";

// Batched-output classification, split out of samToolRecovery.ts to keep both
// files within lint budgets. Depends only on the text-ladder classifier, so
// the guarded runner and tests import it without pulling the state machine.

type BatchItem = { ok?: unknown; error?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function batchItemsOf(output: unknown): BatchItem[] | null {
  if (!isRecord(output)) return null;
  const data = output.data;
  if (!isRecord(data)) return null;
  const results = data.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  if (
    !results.every((item): item is BatchItem => isRecord(item) && "ok" in item)
  ) {
    return null;
  }
  return results;
}

/**
 * Batched tools (research_keywords, get_serp_results) catch per-item failures
 * and return ok:false rows instead of throwing — the adapter's catch never
 * fires. When EVERY item failed, treat the call as a tool failure so the same
 * per-turn policy applies; partial success means the tool works.
 */
export function classifyToolOutput(
  output: unknown,
): ClassifiedToolError | null {
  const items = batchItemsOf(output);
  if (!items) return null;
  const failures = items.filter((item) => item.ok === false);
  if (failures.length !== items.length) return null;
  const details = failures.map((item) =>
    typeof item.error === "string" ? item.error : String(item.error),
  );
  const classes = details.map(
    (detail) => classifyToolErrorText(detail).failureClass,
  );
  const rank: ToolFailureClass[] = [
    "CREDITS_UNAVAILABLE",
    "PERMANENT_UNAVAILABLE",
    "DATAFORSEO_ACCESS_PAUSED",
    "RATE_LIMITED",
    "TRANSIENT_UPSTREAM",
    "TOOL_INPUT_INVALID",
  ];
  const worst = rank.find((failureClass) => classes.includes(failureClass));
  if (!worst) return null;
  return classifyToolErrorText(details[0] ?? "tool batch failed");
}
