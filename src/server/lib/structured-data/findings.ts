/**
 * Shared plumbing for the validation passes: the finding collector and the
 * small JSON-LD helpers each pass needs.
 */
import { FINDING_TYPES } from "./types";
import type { FeatureVerdict, Finding, FindingCode } from "./types";
import { bareTerm } from "./vocabulary";

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** Present means "carries a value": null, "", and [] are all absent. */
export function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** JSON pointer escaping (RFC 6901). */
export function pointer(base: string, segment: string | number): string {
  const escaped = String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
  return `${base}/${escaped}`;
}

export function readTypes(node: JsonObject): string[] {
  const raw = node["@type"];
  if (raw === undefined) return [];
  return asArray(raw)
    .filter((value): value is string => typeof value === "string")
    .map(bareTerm)
    .filter((value) => value !== "");
}

/** Extra context a finding can carry, beyond where and what. */
type FindingContext = Partial<
  Pick<Finding, "type" | "property" | "feature" | "docsUrl">
>;

/** Accumulates findings, feature verdicts, and the types seen across a run. */
export class FindingCollector {
  readonly findings: Finding[] = [];
  readonly features: FeatureVerdict[] = [];
  readonly types: string[] = [];
  /** Types seen at a position where Google rules are applied — top level, or
   *  under mainEntity/mainEntityOfPage. A nested ListItem is not one of these,
   *  so reporting it as unchecked would be noise: it was never a candidate. */
  readonly primaryTypes: string[] = [];
  nodeCount = 0;

  constructor(private scriptIndex = 0) {}

  forScript(index: number): void {
    this.scriptIndex = index;
  }

  seeType(type: string, primary = false): void {
    if (!this.types.includes(type)) this.types.push(type);
    if (primary && !this.primaryTypes.includes(type)) {
      this.primaryTypes.push(type);
    }
  }

  push(
    code: FindingCode,
    message: string,
    path: string,
    context?: FindingContext,
  ): void {
    this.findings.push({
      code,
      ...FINDING_TYPES[code],
      message,
      scriptIndex: this.scriptIndex,
      path,
      ...context,
    });
  }
}
