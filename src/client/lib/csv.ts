import Papa from "papaparse";

export type CsvValue = string | number | boolean | null | undefined;

export type ExportValue = string | number | boolean;

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const normalizedRows = rows.map((row) =>
    row.map((value) => normalizeExportValue(value ?? "")),
  );

  return Papa.unparse(
    {
      fields: headers,
      data: normalizedRows,
    },
    {
      quotes: true,
      newline: "\n",
    },
  );
}

export function normalizeExportValue(value: CsvValue): ExportValue {
  const normalized =
    typeof value === "number" ? roundExportNumber(value) : value;
  return sanitizeCsvValue(normalized ?? "");
}

function roundExportNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Prevent CSV/TSV injection (formula injection) by prefixing dangerous
// characters with a single quote. See OWASP guidance:
// https://owasp.org/www-community/attacks/CSV_Injection
function sanitizeCsvValue(
  value: string | number | boolean,
): string | number | boolean {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  if (["=", "+", "-", "@", "\t", "\r", "\n"].includes(value[0])) {
    return `'${value}`;
  }

  return value;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
