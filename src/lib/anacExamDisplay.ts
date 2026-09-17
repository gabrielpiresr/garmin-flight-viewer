const ANAC_EXAM_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatAnacExamDate(value: string | null | undefined): string {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})(\d{2})$/);
  if (!match) return text || "-";

  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return text;

  return `${ANAC_EXAM_MONTHS[month - 1]}-${year}`;
}

export function formatAnacExamFinalResult(value: string | null | undefined): string {
  const text = String(value || "").trim();
  const normalized = text.toUpperCase();
  if (normalized === "APR" || normalized === "APP") return "Aprovado";
  if (normalized === "2EP") return "Segunda época";
  return text || "-";
}
