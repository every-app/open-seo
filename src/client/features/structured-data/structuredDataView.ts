/**
 * Display helpers for the Structured Data page.
 *
 * Pure, so they can be tested without a DOM. Types are inferred from the server
 * function rather than imported from `@/server/**` — the client's contract is
 * the server function's return value.
 */
import type { validateStructuredData } from "@/serverFunctions/structuredData";

export type StructuredDataValidation = Awaited<
  ReturnType<typeof validateStructuredData>
>;
export type ValidationOk = Extract<StructuredDataValidation, { ok: true }>;
export type ValidationView = ValidationOk["result"];
export type FindingView = ValidationView["findings"][number];
export type FeatureView = ValidationView["features"][number];
export type FindingSeverity = FindingView["severity"];

export const FAILURE_MESSAGE: Record<
  Extract<StructuredDataValidation, { ok: false }>["reason"],
  string
> = {
  no_input: "Paste some markup or enter a URL first.",
  ambiguous_input:
    "Validate markup or a URL, not both — they answer different questions.",
  fetch_failed:
    "That page could not be read. It may be unreachable, blocking crawlers, oversized, or not a public address.",
};

const SEVERITY_ORDER: readonly FindingSeverity[] = ["error", "warning", "info"];

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Notes",
};

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "2 JSON-LD blocks · 13 entities · 1 error · 5 warnings · Schema.org 30.0" */
export function summaryLine(result: ValidationView): string {
  return [
    count(result.scriptCount, "JSON-LD block"),
    count(result.nodeCount, "entity", "entities"),
    count(result.errorCount, "error"),
    count(result.warningCount, "warning"),
    `Schema.org ${result.schemaVersion}`,
  ].join(" · ");
}

/** Findings in severity order, skipping severities with nothing in them. */
export function groupFindingsBySeverity(
  findings: readonly FindingView[],
): Array<{ severity: FindingSeverity; findings: FindingView[] }> {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.findings.length > 0);
}

/**
 * Types found on the page that no rich-result rule covers. Surfaced explicitly
 * so silence is not read as a pass (spec 0012).
 */
export function typesWithoutRules(result: ValidationView): string[] {
  const ruled = new Set(
    result.features.flatMap((feature) => [feature.feature, feature.type]),
  );
  return result.types.filter((type) => !ruled.has(type));
}

/** Where a finding sits: the JSON pointer, prefixed by its block when there is
 *  more than one. */
export function describeLocation(
  finding: FindingView,
  scriptCount: number,
): string {
  const where = finding.path === "" ? "root" : finding.path;
  return scriptCount > 1
    ? `block ${finding.scriptIndex + 1} · ${where}`
    : where;
}
