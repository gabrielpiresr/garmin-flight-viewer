const AISWEB_ORIGIN = "https://aisweb.decea.gov.br";

function fourLetterCode(value: string | null | undefined): string | null {
  const match = String(value || "")
    .trim()
    .toUpperCase()
    .match(/[A-Z]{4}/);
  return match ? match[0]! : null;
}

export function aiswebAerodromeUrl(icao: string | null | undefined): string | null {
  const code = fourLetterCode(icao);
  if (!code) return null;
  return `${AISWEB_ORIGIN}/?i=aerodromos&codigo=${encodeURIComponent(code)}`;
}

export function aiswebNotamUrl(location?: string | null): string {
  const code = fourLetterCode(location);
  if (code) return `${AISWEB_ORIGIN}/?i=notam&icao=${encodeURIComponent(code)}`;
  return `${AISWEB_ORIGIN}/?i=notam`;
}

export function aiswebAirspaceUrl(input: {
  ident?: string | null;
  fir?: string | null;
}): string {
  return aiswebAerodromeUrl(input.ident) || aiswebAerodromeUrl(input.fir) || aiswebNotamUrl(input.ident || input.fir);
}
