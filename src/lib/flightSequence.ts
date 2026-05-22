export function buildAnacFlightSequence(params: {
  aircraft?: string | null;
  date?: string | null;
  time?: string | null;
}): string {
  const aircraft = String(params.aircraft ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const dateMatch = String(params.date ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = String(params.time ?? "").trim().match(/^(\d{1,2}):?(\d{2})$/);

  if (!aircraft || !dateMatch || !timeMatch) return "";

  const year = dateMatch[1]!.slice(2);
  const month = dateMatch[2]!;
  const day = dateMatch[3]!;
  const hour = String(Math.min(23, Math.max(0, Number(timeMatch[1])))).padStart(2, "0");
  const minute = String(Math.min(59, Math.max(0, Number(timeMatch[2])))).padStart(2, "0");

  return `${aircraft}-${year}${month}${day}-${hour}${minute}`;
}
