import Papa from "papaparse";

type CsvValue = string | number | boolean | null | undefined;

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const normalizedRows = rows.map((row) => row.map((value) => value ?? ""));

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

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
