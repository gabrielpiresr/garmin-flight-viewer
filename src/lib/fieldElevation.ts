/**
 * Parse published field elevation to feet MSL.
 * Accepts "49 ft", "15 m", bare numbers (ANAC altitude columns are typically meters).
 */
export function parseFieldElevationFt(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    // Numeric-only from ROTAER/AISWEB is already feet when passed as altFt.
    return Math.round(raw);
  }
  const s = String(raw).trim().toLowerCase().replace(/,/g, ".");
  if (!s) return null;
  const match = s.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  if (/\bft\b|pés|pes\b|feet\b/.test(s)) return Math.round(n);
  if (/\bm\b|metros?\b/.test(s)) return Math.round(n * 3.28084);
  // Bare values: ANAC sheets are usually meters; large figures (>2000) are almost always feet.
  if (Math.abs(n) > 2000) return Math.round(n);
  return Math.round(n * 3.28084);
}
