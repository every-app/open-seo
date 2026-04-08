import Papa from "papaparse";

type CsvValue = string | number | boolean | null | undefined;

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const normalizedRows = rows.map((row) =>
    row.map((value) => sanitizeCsvValue(value ?? "")),
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

// Prevent CSV injection (formula injection) by prefixing dangerous characters
// with a single quote. See OWASP guidance:
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
