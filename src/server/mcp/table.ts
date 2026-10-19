import { MCP_TEXT_CHAR_BUDGET } from "./formatters";

// Shared renderer for MCP tool text output. Tools return row data in
// structuredContent, but MCP clients that surface only the text content block
// would otherwise see just a summary. Render a compact table from the same
// rows; large tables may be truncated with an explicit notice.

export type McpTableColumn<T> = {
  header: string;
  value: (row: T) => unknown;
  /** Override the default cell formatting for this column. */
  format?: (value: unknown) => string;
};

/** Format a single cell. Nullish/empty -> "—"; integers stay exact; other
 *  numbers get 2 decimals; text is collapsed to a single line and its pipes
 *  become "¦" so provider prose ("Best Software | Brand") can't split one cell
 *  across two columns. */
export function formatMcpCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "bigint") return value.toString();
  // Arrays/objects would stringify to "[object Object]"; emit compact JSON so a
  // stray nested value still reads as something in the text table.
  const text = typeof value === "string" ? value : safeJson(value);
  return text.replace(/\s+/g, " ").replace(/\|/g, "¦").trim() || "—";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** Column `format` for a 0-1 ratio rendered as a percentage (GSC/GA4 CTR). */
export function percentCell(value: unknown): string {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

/** Column `format` for an average SERP position, which is fractional. */
export function positionCell(value: unknown): string {
  return typeof value === "number" ? value.toFixed(1) : "—";
}

/** Column `format` that truncates long text after normal cell formatting, so
 *  provider prose can't dominate the table (full text stays in
 *  structuredContent). */
export function truncatedCell(maxLength: number) {
  return (value: unknown): string => {
    const cell = formatMcpCell(value);
    return cell.length > maxLength ? `${cell.slice(0, maxLength - 1)}…` : cell;
  };
}

/** Row budget for each of `sections` tables sharing one response. Each section
 *  keeps 500 characters back for its own header and "more rows" notice plus
 *  its share of the footer, so the last table ends on that notice instead of
 *  being cut mid-row by the response cap. */
export function sectionTableBudget(sections: number): number {
  return Math.floor(MCP_TEXT_CHAR_BUDGET / Math.max(sections, 1)) - 500;
}

/** Render complete table rows up to a target size. Multi-query tools split
 *  this allowance so the first query cannot crowd out every later query.
 *  Headers, notices and a single wide row can exceed this target; mcpResponse
 *  applies the actual combined text cap. */
export function formatMcpTable<T>(
  rows: readonly T[],
  columns: readonly McpTableColumn<T>[],
  budget = MCP_TEXT_CHAR_BUDGET,
): string {
  const header = columns.map((column) => column.header).join(" | ");
  const lines = [header];
  let used = header.length;
  let rendered = 0;
  for (const row of rows) {
    const line = columns
      .map((column) => {
        const raw = column.value(row);
        return column.format ? column.format(raw) : formatMcpCell(raw);
      })
      .join(" | ");
    // Always render one row, so a single very wide row still reaches the model.
    if (rendered > 0 && used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
    rendered += 1;
  }
  if (rendered < rows.length) {
    lines.push(
      `…${rows.length - rendered} more rows are in structuredContent; this table preview is truncated. A narrower request is a new call and, on credit-charging tools, a new charge.`,
    );
  }
  return lines.join("\n");
}

/** Walk a chain of keys through nested unknown records (provider rows).
 *  Returns undefined if any hop isn't an object. */
export function readPath(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}
