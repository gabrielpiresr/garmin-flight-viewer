const CSV_MIME = "text/csv;charset=utf-8";
const CSV_BOM = "\uFEFF";
const DEFAULT_SEPARATOR = ";";

export function csvEscape(value: unknown, separator = DEFAULT_SEPARATOR): string {
  const text = value == null ? "" : String(value);
  const escaped = text.replace(/"/g, '""');
  return escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r") || escaped.includes(separator)
    ? `"${escaped}"`
    : escaped;
}

export function buildCsv(rows: unknown[][], separator = DEFAULT_SEPARATOR): string {
  return rows.map((row) => row.map((cell) => csvEscape(cell, separator)).join(separator)).join("\n");
}

export function downloadCsv(rows: unknown[][], filename: string, separator = DEFAULT_SEPARATOR): void {
  const blob = new Blob([`${CSV_BOM}${buildCsv(rows, separator)}`], { type: CSV_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
