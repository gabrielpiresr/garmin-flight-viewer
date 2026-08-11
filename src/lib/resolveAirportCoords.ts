import { lookupAiswebIcao } from "./aiswebDb";
import { listAerodromesByCodes } from "./aerodromesDb";
import { normalizeIcao } from "./aiswebMetar";

export type AirportCoords = { lat: number; lng: number; label: string };

/** Prefer AISWEB ROTAER ARP; fall back to Appwrite aerodromes catalog. */
export async function resolveAirportCoords(icao: string): Promise<AirportCoords | null> {
  const code = normalizeIcao(icao);
  if (code.length !== 4) return null;
  try {
    const bundle = await lookupAiswebIcao(code);
    const lat = bundle.rotaer?.lat;
    const lng = bundle.rotaer?.lng;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: code };
    }
  } catch {
    // fall through
  }
  try {
    const fromDb = await listAerodromesByCodes([code]);
    const hit = fromDb.find(
      (a) =>
        a.icao === code &&
        a.latitudeGeoPoint != null &&
        a.longitudeGeoPoint != null &&
        Number.isFinite(a.latitudeGeoPoint) &&
        Number.isFinite(a.longitudeGeoPoint),
    );
    if (hit) {
      return { lat: hit.latitudeGeoPoint!, lng: hit.longitudeGeoPoint!, label: code };
    }
  } catch {
    return null;
  }
  return null;
}
