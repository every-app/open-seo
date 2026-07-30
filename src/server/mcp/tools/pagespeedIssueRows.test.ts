import { describe, expect, it } from "vitest";
import {
  byWorstFirst,
  type PagespeedIssueRow,
} from "@/server/mcp/tools/pagespeedIssueRows";

function row(overrides: Partial<PagespeedIssueRow> = {}): PagespeedIssueRow {
  return {
    url: "https://example.com/",
    category: "performance",
    severity: "warning",
    issue: "Reduce unused JavaScript",
    detail: "—",
    evidence: [],
    impactMs: null,
    impactBytes: null,
    auditKey: "unused-javascript",
    ...overrides,
  };
}

describe("byWorstFirst", () => {
  it("puts severity ahead of measured impact", () => {
    const rows = [
      row({ severity: "info", impactMs: 5000, auditKey: "big-but-minor" }),
      row({
        severity: "critical",
        impactMs: 1,
        auditKey: "small-but-critical",
      }),
      row({ severity: "warning", impactMs: 900, auditKey: "middling" }),
    ].toSorted(byWorstFirst);

    expect(rows.map((r) => r.auditKey)).toEqual([
      "small-but-critical",
      "middling",
      "big-but-minor",
    ]);
  });

  it("orders by measured impact inside a severity band", () => {
    const rows = [
      row({ impactMs: 100, auditKey: "smaller" }),
      row({ impactMs: 400, auditKey: "bigger" }),
    ].toSorted(byWorstFirst);

    expect(rows.map((r) => r.auditKey)).toEqual(["bigger", "smaller"]);
  });

  it("weighs bytes against milliseconds so either alone can order a row", () => {
    // 300 KB scores 300; 200 ms scores 200. An audit reporting only bytes must
    // still be comparable with one reporting only time.
    const rows = [
      row({ impactMs: 200, auditKey: "time-only" }),
      row({ impactBytes: 300_000, auditKey: "bytes-only" }),
    ].toSorted(byWorstFirst);

    expect(rows.map((r) => r.auditKey)).toEqual(["bytes-only", "time-only"]);
  });

  it("sorts an unrecognised severity last rather than dropping it", () => {
    const rows = [
      row({ severity: "mystery", auditKey: "unknown" }),
      row({ severity: "info", auditKey: "known" }),
    ].toSorted(byWorstFirst);

    expect(rows.map((r) => r.auditKey)).toEqual(["known", "unknown"]);
  });
});
