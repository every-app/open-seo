// Agent-side bounding for Search Console performance results.
//
// The public MCP tool (`get_search_console_performance`) serves the full
// product contract: up to 1000 rows per call, paginated, untouched. But when
// SAM (the in-app agent) calls the same tool, the result becomes a tool part
// in the streaming chat transcript. A 1000-row response serializes to
// hundreds of KB, which:
//   1. the chat client re-clones per stream chunk (a proven contributor to
//      the streaming render storm), and
//   2. the model mostly cannot use — it reasons over the top rows and the
//      aggregate shape, not row #847.
//
// This module bounds ONLY the agent's copy. It never touches the MCP route,
// never invents aggregates (totals are computed from the returned rows and
// labeled as such), and keeps the full-detail escape hatch: the bounded note
// tells the model how to fetch more (paginate with startRow / narrower
// filters), and the product UI keeps showing complete data.

/** Max rows carried into the agent transcript per GSC performance call.
 *
 * Chosen from the tool's own contract, not arbitrarily: the MCP tool's text
 * summary already shows the top 15 rows as the human-readable surface
 * (TEXT_SUMMARY_ROWS in search-console-tools.ts), GSC sorts by clicks desc so
 * the first rows carry nearly all the decision weight, and 50 rows ≈ 5–15KB
 * serialized — enough for top queries/pages, striking-distance analysis on the
 * head, and date-series trends, while keeping the tool part two orders of
 * magnitude below the 447KB observed in the crash-era transcript.
 */
export const SAM_GSC_AGENT_ROW_LIMIT = 50;

type GscPerfRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGscRow(value: unknown): value is GscPerfRow {
  return (
    isRecord(value) &&
    typeof value.clicks === "number" &&
    typeof value.impressions === "number" &&
    typeof value.ctr === "number" &&
    typeof value.position === "number"
  );
}

/** Sum a numeric field over rows without inventing data: returned only when
 * every row actually carries the field (they always do per the tool schema). */
function sumField(rows: GscPerfRow[], field: "clicks" | "impressions"): number {
  return rows.reduce((acc, row) => acc + row[field], 0);
}

/**
 * Bound one SAM `get_search_console_performance` tool output. Pure: same
 * input → same output. Passes through anything that isn't a successful,
 * oversized result untouched (error payloads and small results keep their
 * original shape). When bounding applies, rows are sliced to the agent limit
 * and a `note` is prepended (before the tool's own summary text) stating the
 * returned-row totals and how to get the next slice — the only numbers in it
 * are computed from the returned rows, never fabricated.
 */
export function boundAgentGscOutput(output: unknown): unknown {
  if (!isRecord(output) || !isRecord(output.data)) return output;
  const data = output.data;
  if (data.ok !== true || !Array.isArray(data.rows)) return output;

  const rows = data.rows.filter(isGscRow);
  const rowCount =
    typeof data.rowCount === "number" ? data.rowCount : rows.length;
  if (rowCount <= SAM_GSC_AGENT_ROW_LIMIT) return output;

  const bounded = rows.slice(0, SAM_GSC_AGENT_ROW_LIMIT);
  const summary = typeof output.summary === "string" ? output.summary : "";

  const note =
    `[agent context bound] The full result had ${rowCount} rows; the top ${bounded.length} ` +
    `by GSC's clicks-descending order are included. The ${bounded.length} returned rows ` +
    `sum to ${sumField(bounded, "clicks")} clicks and ${sumField(bounded, "impressions")} impressions ` +
    `(totals of the returned rows only, not the whole property). For deeper rows, call again ` +
    `with startRow=${typeof data.nextStartRow === "number" ? data.nextStartRow : bounded.length} ` +
    `or narrower filters/dates; the full dataset is in the product's Search Console page.`;

  return {
    ...output,
    summary: summary ? `${note}\n\n${summary}` : note,
    data: {
      ...data,
      rows: bounded,
      agentTruncated: true,
      agentRowCount: bounded.length,
    },
  };
}