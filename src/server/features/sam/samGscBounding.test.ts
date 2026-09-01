import { describe, expect, it } from "vitest";
import {
  boundAgentGscOutput,
  SAM_GSC_AGENT_ROW_LIMIT,
} from "./samGscBounding";

function row(n: number) {
  return {
    keys: [`query-${n}`],
    clicks: 1000 - n,
    impressions: 5000 - n,
    ctr: 0.05,
    position: 1 + (n % 10),
  };
}

function okOutput(rows: ReturnType<typeof row>[], extra: Record<string, unknown> = {}) {
  return {
    summary: "site · query · 2026-01-01→2026-01-28 · 1000 rows (more available — paginate with startRow)\n| key | clicks | ... |",
    data: {
      ok: true,
      siteUrl: "https://powersiment.ae",
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      dimensions: ["query"],
      rowCount: rows.length,
      rows,
      hasMore: true,
      nextStartRow: rows.length,
      ...extra,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read the bounded summary without `as` casts (banned by oxlint). */
function summaryOf(output: unknown): string {
  return isRecord(output) && typeof output.summary === "string"
    ? output.summary
    : "";
}

/** Read the bounded data object; throws (fails the test) when absent. */
function dataOf(output: unknown): Record<string, unknown> {
  if (isRecord(output) && isRecord(output.data)) return output.data;
  throw new Error("expected data object on bounded output");
}

describe("boundAgentGscOutput", () => {
  it("bounds a 1000-row result to the agent limit and flags truncation", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(i));
    const out = boundAgentGscOutput(okOutput(rows));
    const data = dataOf(out);

    expect(data.rows).toHaveLength(SAM_GSC_AGENT_ROW_LIMIT);
    expect(data.agentTruncated).toBe(true);
    expect(data.agentRowCount).toBe(SAM_GSC_AGENT_ROW_LIMIT);
    // The tool's own contract fields stay intact for the model's pagination.
    expect(data.rowCount).toBe(1000);
    expect(data.hasMore).toBe(true);
    const summary = summaryOf(out);
    expect(summary).toContain("[agent context bound]");
    expect(summary).toContain("The full result had 1000 rows");
    // The summary keeps the tool's own text (append-only note).
    expect(summary).toContain("site · query · 2026-01-01");
  });

  it("computes returned-row totals from actual data, never invents aggregates", () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(i));
    const summary = summaryOf(boundAgentGscOutput(okOutput(rows)));
    // First 50 rows: clicks 1000..951, impressions 5000..4951.
    const expectedClicks = Array.from({ length: 50 }, (_, i) => 1000 - i).reduce((a, b) => a + b, 0);
    const expectedImpressions = Array.from({ length: 50 }, (_, i) => 5000 - i).reduce((a, b) => a + b, 0);
    expect(summary).toContain(`sum to ${expectedClicks} clicks`);
    expect(summary).toContain(`${expectedImpressions} impressions`);
    // And explicitly labeled as returned-rows-only.
    expect(summary).toContain("totals of the returned rows only");
  });

  it("points the model at the next slice using the tool's own nextStartRow", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(i));
    expect(summaryOf(boundAgentGscOutput(okOutput(rows, { nextStartRow: 200 })))).toContain("startRow=200");
  });

  it("falls back to the bounded length when nextStartRow is absent", () => {
    const rows = Array.from({ length: 80 }, (_, i) => row(i));
    expect(summaryOf(boundAgentGscOutput(okOutput(rows, { nextStartRow: undefined })))).toContain(
      `startRow=${SAM_GSC_AGENT_ROW_LIMIT}`,
    );
  });

  it("passes small results through untouched (same reference)", () => {
    const small = okOutput(Array.from({ length: 10 }, (_, i) => row(i)));
    expect(boundAgentGscOutput(small)).toBe(small);
  });

  it("passes results exactly at the limit through untouched", () => {
    const edge = okOutput(Array.from({ length: SAM_GSC_AGENT_ROW_LIMIT }, (_, i) => row(i)));
    expect(boundAgentGscOutput(edge)).toBe(edge);
  });

  it("passes error payloads and malformed shapes through untouched", () => {
    const errorOutput = {
      summary: "Search Console is not connected for this project.",
      data: { ok: false, reason: "not_connected", connectUrl: "https://x" },
    };
    expect(boundAgentGscOutput(errorOutput)).toBe(errorOutput);
    expect(boundAgentGscOutput(null)).toBe(null);
    expect(boundAgentGscOutput("string")).toBe("string");
    expect(boundAgentGscOutput({ summary: "s" })).toEqual({ summary: "s" });
  });

  it("drops malformed row entries rather than crashing on them", () => {
    const rows: unknown[] = Array.from({ length: 60 }, (_, i) => row(i));
    rows[10] = { keys: ["broken"] }; // missing numeric fields
    const out = boundAgentGscOutput({
      summary: "s",
      data: { ok: true, rowCount: 60, rows, hasMore: true, nextStartRow: 60 },
    });
    const boundedRows = dataOf(out).rows;
    // 59 valid rows still exceed the 50-row limit; the slice covers only valid ones.
    if (!Array.isArray(boundedRows)) throw new Error("expected rows array");
    expect(boundedRows).toHaveLength(SAM_GSC_AGENT_ROW_LIMIT);
    expect(
      boundedRows.every(
        (r) => isRecord(r) && typeof Reflect.get(r, "clicks") === "number",
      ),
    ).toBe(true);
  });

  it("keeps the agent limit materially useful (≥ the tool's own text summary depth)", () => {
    // The MCP tool surfaces the top 15 rows as its human-readable summary; the
    // agent bound must not fall below that or answers get worse than the
    // already-shipped text surface.
    expect(SAM_GSC_AGENT_ROW_LIMIT).toBeGreaterThanOrEqual(15);
    expect(SAM_GSC_AGENT_ROW_LIMIT).toBeLessThanOrEqual(100);
  });
});