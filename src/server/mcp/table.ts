// Shared renderer for MCP tool text output. Tools return row data in
// structuredContent, but MCP clients that surface only the text content block
// would otherwise see just a summary. Rendering every row as a compact
// pipe-delimited table here keeps the text block in parity with the data.

export type McpTableColumn<T> = {
  header: string;
  value: (row: T) => unknown;
  /** Override the default cell formatting for this column. */
  format?: (value: unknown) => string;
};

/** Format a single cell. Nullish/empty -> "—"; integers stay exact; other
 *  numbers get 2 decimals; strings are collapsed to a single line so a stray
 *  newline can't break the table layout. */
export function formatMcpCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "bigint") return value.toString();
  // Arrays/objects would stringify to "[object Object]"; emit compact JSON so a
  // stray nested value still reads as something in the text table.
  try {
    return JSON.stringify(value) ?? "—";
  } catch {
    return "—";
  }
}

/** Render rows as a `header | header` table with one line per row. */
export function formatMcpTable<T>(
  rows: readonly T[],
  columns: readonly McpTableColumn<T>[],
): string {
  const headerLine = columns.map((column) => column.header).join(" | ");
  const rowLines = rows.map((row) =>
    columns
      .map((column) => {
        const raw = column.value(row);
        return column.format ? column.format(raw) : formatMcpCell(raw);
      })
      .join(" | "),
  );
  return [headerLine, ...rowLines].join("\n");
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
