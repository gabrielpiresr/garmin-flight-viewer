import type { SagaFlight, SagaImportCatalogs } from "./sagaImportDb";
import type { TrainingMissionType } from "../types/trainingTrack";

const TRAINING_MISSION_TYPE_LABEL: Record<TrainingMissionType, string> = {
  DC: "Duplo comando",
  SL: "Solo",
  PIC: "Piloto em comando",
};

export function trainingMissionTypeLabel(type: unknown): string {
  const normalized = String(type || "").trim().toUpperCase();
  if (normalized === "DC" || normalized === "SL" || normalized === "PIC") {
    return TRAINING_MISSION_TYPE_LABEL[normalized];
  }
  return normalized;
}

export function formatMissionDurationMinutes(minutes: unknown): string {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value <= 0) return "";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, "0")}min`;
}

export function formatSagaMissionOptionLabel(parts: {
  type?: unknown;
  order?: unknown;
  name?: unknown;
  title?: unknown;
  durationMinutes?: unknown;
  stageName?: unknown;
}): string {
  const type = String(parts.type || "").trim().toUpperCase();
  const order = String(parts.order ?? "").trim();
  const name = String(parts.name || parts.title || "").trim();
  const stageName = String(parts.stageName || "").trim();
  const code = type && order ? `${type}${order}` : "";
  const meta = [trainingMissionTypeLabel(type), formatMissionDurationMinutes(parts.durationMinutes)]
    .filter(Boolean)
    .join(" · ");
  return [code, name, meta, stageName].filter(Boolean).join(" — ");
}

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

export function isScopedSagaMissionKey(value: string): boolean {
  return String(value || "").includes("::");
}

export function collectMissionLookupKeysFromFlights(flights: SagaFlight[]): string[] {
  const keys = new Set<string>();
  for (const flight of flights) {
    const key = sagaMissionLookupKey(flight.missaoDoAluno);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function parseCatalogStages(stages: unknown): unknown[] {
  if (!stages) return [];
  if (Array.isArray(stages)) return stages;
  if (typeof stages === "string") {
    try {
      const parsed = JSON.parse(stages) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cleanCatalogId(value: string): string {
  return String(value || "").trim();
}

export function missionOptionsForTrack(catalogs: SagaImportCatalogs, trainingTrackId: string) {
  const trackId = cleanCatalogId(trainingTrackId);
  const track = catalogs.trainingTracks.find((row) => cleanCatalogId(row.id) === trackId);
  const stages = parseCatalogStages(track?.stages);
  if (!track || stages.length === 0) return [];
  const options: Array<{ value: string; label: string }> = [];
  for (const stage of stages) {
    const stageName = typeof stage === "object" && stage && "name" in stage ? String((stage as { name?: string }).name || "") : "";
    const missions =
      typeof stage === "object" && stage && "missions" in stage
        ? (stage as { missions?: Array<Record<string, unknown>> }).missions
        : [];
    if (!Array.isArray(missions)) continue;
    for (const mission of missions) {
      const id = String(mission.id || "").trim();
      if (!id) continue;
      options.push({
        value: id,
        label: formatSagaMissionOptionLabel({
          type: mission.type,
          order: mission.order,
          name: mission.name,
          title: mission.title,
          durationMinutes: mission.durationMinutes,
          stageName,
        }),
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
