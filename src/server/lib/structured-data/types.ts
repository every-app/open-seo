/**
 * Shapes for structured-data validation (spec 0012).
 *
 * Severity map:
 *   error   — the markup is broken or the rich result is out of reach
 *             (unparseable JSON, a type or property that does not exist,
 *             a literal in the wrong format, a missing required property).
 *   warning — valid but suspect or incomplete (a property not declared on
 *             this type, a value outside the declared range, missing
 *             recommended properties).
 *   info    — advisory only (a retired Google feature, a non-schema.org
 *             vocabulary we deliberately do not judge).
 */

export type FindingSeverity = "error" | "warning" | "info";

/** Which pass raised the finding. `google` findings are advisory: Search
 *  Console's own `richResultsResult` is authoritative for live pages. */
export type FindingLayer = "parse" | "vocabulary" | "google";

/**
 * Every finding the validator can raise, with its layer and severity.
 *
 * One registry rather than three arguments at each call site: a code's layer
 * and severity are properties of the code itself, so they cannot drift apart or
 * be passed inconsistently. Mirrors `AUDIT_ISSUE_TYPES`.
 */
export const FINDING_TYPES = {
  // parse
  "invalid-json": { layer: "parse", severity: "error" },
  "empty-script": { layer: "parse", severity: "warning" },
  "not-an-object": { layer: "parse", severity: "error" },
  "missing-context": { layer: "parse", severity: "warning" },
  "foreign-context": { layer: "parse", severity: "info" },
  // vocabulary
  "missing-type": { layer: "vocabulary", severity: "error" },
  "unknown-type": { layer: "vocabulary", severity: "error" },
  "unknown-property": { layer: "vocabulary", severity: "error" },
  "property-not-on-type": { layer: "vocabulary", severity: "warning" },
  "superseded-term": { layer: "vocabulary", severity: "warning" },
  "range-mismatch": { layer: "vocabulary", severity: "warning" },
  "invalid-literal": { layer: "vocabulary", severity: "error" },
  "invalid-enum-value": { layer: "vocabulary", severity: "error" },
  "empty-value": { layer: "vocabulary", severity: "warning" },
  // google
  "missing-required-property": { layer: "google", severity: "error" },
  "missing-one-of-required": { layer: "google", severity: "error" },
  "missing-recommended-properties": { layer: "google", severity: "warning" },
  "retired-feature": { layer: "google", severity: "info" },
} as const satisfies Record<
  string,
  { layer: FindingLayer; severity: FindingSeverity }
>;

export type FindingCode = keyof typeof FINDING_TYPES;

export type Finding = {
  code: FindingCode;
  severity: FindingSeverity;
  layer: FindingLayer;
  message: string;
  /** Index of the `ld+json` script in document order; 0 for a bare snippet. */
  scriptIndex: number;
  /** JSON pointer to the offending node or value within that script. */
  path: string;
  /** Schema.org type the finding hangs off, when one is known. */
  type?: string;
  property?: string;
  /** Google feature name — `google` layer only. */
  feature?: string;
  docsUrl?: string;
};

/** Per-feature eligibility summary. Advisory: it reflects Google's documented
 *  requirements as read on `checkedOn`, not a verdict from Google. */
export type FeatureVerdict = {
  feature: string;
  type: string;
  /** No required property is missing. Warnings do not affect this. */
  eligible: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  docsUrl: string;
  checkedOn: string;
};

export type ValidationResult = {
  /** Schema.org release the vocabulary tables were compiled from. */
  schemaVersion: string;
  /** `ld+json` scripts found. */
  scriptCount: number;
  /** Entities found across those scripts, after unwrapping arrays/@graph. */
  nodeCount: number;
  /** Distinct Schema.org types found, in first-seen order. */
  types: string[];
  features: FeatureVerdict[];
  findings: Finding[];
  errorCount: number;
  warningCount: number;
};
