import type { SagaFlight, SagaImportCatalogs } from "./sagaImportDb";

export function sagaMissionCode(value: string): string {
  const normalized = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const pieces = normalized.split(/\s+[-–—]\s+/).reverse();
  for (const piece of pieces) {
    const match = piece.match(/\b([A-Z]{1,5})\s*[- ]?\s*(\d{1,3}[A-Z]?)\b/);
    if (match) return `${match[1]}${match[2]}`;
  }
  const match = normalized.match(/\b([A-Z]{1,5})\s*[- ]?\s*(\d{1,3}[A-Z]?)\b/);
  return match ? `${match[1]}${match[2]}` : "";
}

export function sagaMissionKey(value: string): string {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function sagaMissionLookupKey(rawMission: string): string {
  const raw = String(rawMission || "").trim();
  if (!raw) return "";
  const code = sagaMissionCode(raw);
  return sagaMissionKey(code || raw);
}

export function collectMissionLookupKeysFromFlights(flights: SagaFlight[]): string[] {
  const keys = new Set<string>();
  for (const flight of flights) {
    const key = sagaMissionLookupKey(flight.missaoDoAluno);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function missionOptionsForTrack(catalogs: SagaImportCatalogs, trainingTrackId: string) {
  const track = catalogs.trainingTracks.find((row) => row.id === trainingTrackId);
  if (!track || !Array.isArray(track.stages)) return [];
  const options: Array<{ value: string; label: string }> = [];
  for (const stage of track.stages) {
    const stageName = typeof stage === "object" && stage && "name" in stage ? String((stage as { name?: string }).name || "") : "";
    const missions =
      typeof stage === "object" && stage && "missions" in stage
        ? (stage as { missions?: Array<Record<string, unknown>> }).missions
        : [];
    if (!Array.isArray(missions)) continue;
    for (const mission of missions) {
      const id = String(mission.id || "").trim();
      if (!id) continue;
      const type = String(mission.type || "").trim();
      const order = String(mission.order ?? "").trim();
      const name = String(mission.name || mission.title || "").trim();
      const code = type && order ? `${type}${order}` : "";
      options.push({
        value: id,
        label: [code, name, stageName].filter(Boolean).join(" — "),
      });
    }
  }
  return options;
}

export function allMissionOptions(catalogs: SagaImportCatalogs) {
  const options: Array<{ value: string; label: string }> = [];
  for (const track of catalogs.trainingTracks) {
    for (const option of missionOptionsForTrack(catalogs, track.id)) {
      options.push({
        value: option.value,
        label: `${track.name}: ${option.label}`,
      });
    }
  }
  return options;
}

export function missionLabelFromCatalogs(catalogs: SagaImportCatalogs, missionId: string): string {
  const cleanId = String(missionId || "").trim();
  if (!cleanId) return "";
  for (const option of allMissionOptions(catalogs)) {
    if (option.value === cleanId) return option.label;
  }
  return cleanId;
}
