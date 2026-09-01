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

/** Compact per-row line for the regenerated summary — mirrors the MCP tool's
 * own table columns (key, clicks, impressions, CTR, position) but tab-separated
 * so 50 rows stay a few KB. Values come from the row itself, never recomputed. */
function rowLine(row: GscPerfRow): string {
  const key = row.keys?.join(" / ") ?? "(total)";
  const ctr = `${(row.ctr * 100).toFixed(1)}%`;
  const pos = row.position.toFixed(1);
  return `${key}\t${row.clicks}\t${row.impressions}\t${ctr}\t${pos}`;
}

/**
 * Bound one SAM `get_search_console_performance` tool output. Pure: same
 * input → same output. Passes through anything that isn't a successful,
 * oversized result untouched (error payloads and small results keep their
 * original shape). When bounding applies:
 *   - `data.rows` is sliced to the agent limit,
 *   - the text summary is REGENERATED from the bounded rows (the MCP tool's
 *     own summary tabulates every fetched row — keeping it would carry the
 *     full 1000-row text into the transcript even with bounded data, which
 *     is exactly the payload this bound exists to prevent),
 *   - the replacement note states the returned-row totals and how to get the
 *     next slice — the only numbers in it are computed from the returned
 *     rows, never fabricated.
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
  const nextStartRow =
    typeof data.nextStartRow === "number" ? data.nextStartRow : bounded.length;

  const note =
    `[agent context bound] The full result had ${rowCount} rows; the top ${bounded.length} ` +
    `by GSC's clicks-descending order are included. The ${bounded.length} returned rows ` +
    `sum to ${sumField(bounded, "clicks")} clicks and ${sumField(bounded, "impressions")} impressions ` +
    `(totals of the returned rows only, not the whole property). For deeper rows, call again ` +
    `with startRow=${nextStartRow} or narrower filters/dates; the full dataset is in the ` +
    `product's Search Console page.`;

  const header =
    `site: ${typeof data.siteUrl === "string" ? data.siteUrl : ""} · ` +
    `${Array.isArray(data.dimensions) ? data.dimensions.join("+") : ""} · ` +
    `${typeof data.startDate === "string" ? data.startDate : ""}→${typeof data.endDate === "string" ? data.endDate : ""}`;
  const table = [
    header,
    `key\tclicks\timpressions\tctr\tposition`,
    ...bounded.map(rowLine),
  ].join("\n");

  return {
    ...output,
    summary: `${note}\n\n${table}`,
    data: {
      ...data,
      rows: bounded,
      agentTruncated: true,
      agentRowCount: bounded.length,
    },
  };
}