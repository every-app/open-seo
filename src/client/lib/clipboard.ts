import { normalizeExportValue, type CsvValue, type ExportValue } from "./csv";

export const GOOGLE_SHEETS_NEW_URL = "https://sheets.new";

export async function copyTableToClipboard(
  headers: string[],
  rows: CsvValue[][],
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Clipboard API not available in this browser.");
  }

  const safeRows = rows.map((row) =>
    row.map((value) => normalizeExportValue(value ?? "")),
  );

  const tsv = buildTsv(headers, safeRows);
  const html = buildHtmlTable(headers, safeRows);

  // Wrap blobs in Promise.resolve for Safari <17.4 compatibility — older
  // Safari requires Promise<Blob> values; modern browsers accept either.
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": Promise.resolve(new Blob([tsv], { type: "text/plain" })),
      "text/html": Promise.resolve(new Blob([html], { type: "text/html" })),
    }),
  ]);
}

function buildTsv(headers: string[], rows: ExportValue[][]): string {
  const lines = [headers.map(tsvCell).join("\t")];
  for (const row of rows) {
    lines.push(row.map(tsvCell).join("\t"));
  }
  return lines.join("\n");
}

function tsvCell(value: ExportValue): string {
  if (typeof value !== "string") return String(value);
  return value.replace(/[\t\r\n]+/g, " ");
}

function buildHtmlTable(headers: string[], rows: ExportValue[][]): string {
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtmlCell(cell)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function escapeHtmlCell(value: ExportValue): string {
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (isLinkableUrl(value)) {
    const safeValue = escapeHtml(value);
    return `<a href="${escapeHtml(value)}">${safeValue}</a>`;
  }
  return escapeHtml(value);
}

function isLinkableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
