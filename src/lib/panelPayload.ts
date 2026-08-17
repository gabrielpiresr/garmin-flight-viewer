import type { AircraftPanel, PanelInstrument } from "../types/panel";

export const PANEL_PAYLOAD_VERSION = 2;

type PanelPayloadV2 = {
  v: typeof PANEL_PAYLOAD_VERSION;
  model_url: string | null;
  model_file_id: string | null;
  instruments: PanelInstrument[];
};

export type ParsedPanelPayload = {
  instruments: PanelInstrument[];
  model_url: string | null;
  model_file_id: string | null;
};

function asInstrument(raw: unknown, index: number): PanelInstrument | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" && item.id.trim() ? item.id : `inst_${index}`;
  const name = typeof item.name === "string" ? item.name : "Instrumento";
  const pos = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    id,
    name,
    description: typeof item.description === "string" ? item.description : "",
    shape: item.shape === "circle" ? "circle" : "rect",
    x: typeof item.x === "number" ? item.x : 40,
    y: typeof item.y === "number" ? item.y : 35,
    w: typeof item.w === "number" ? item.w : 14,
    h: typeof item.h === "number" ? item.h : 12,
    zoom_image_url: typeof item.zoom_image_url === "string" ? item.zoom_image_url : null,
    sort_order: typeof item.sort_order === "number" ? item.sort_order : index + 1,
    pos_x: pos(item.pos_x),
    pos_y: pos(item.pos_y),
    pos_z: pos(item.pos_z),
  };
}

export function parsePanelPayload(raw: unknown): ParsedPanelPayload {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { instruments: [], model_url: null, model_file_id: null };
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return { instruments: [], model_url: null, model_file_id: null };
    }
  }

  if (Array.isArray(parsed)) {
    return {
      instruments: parsed.map(asInstrument).filter((item): item is PanelInstrument => Boolean(item)),
      model_url: null,
      model_file_id: null,
    };
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const list = Array.isArray(obj.instruments) ? obj.instruments : [];
    return {
      instruments: list.map(asInstrument).filter((item): item is PanelInstrument => Boolean(item)),
      model_url: typeof obj.model_url === "string" && obj.model_url.trim() ? obj.model_url : null,
      model_file_id: typeof obj.model_file_id === "string" && obj.model_file_id.trim() ? obj.model_file_id : null,
    };
  }

  return { instruments: [], model_url: null, model_file_id: null };
}

export function serializePanelPayload(
  instruments: PanelInstrument[],
  modelUrl: string | null = null,
  modelFileId: string | null = null,
): string {
  const payload: PanelPayloadV2 = {
    v: PANEL_PAYLOAD_VERSION,
    model_url: modelUrl?.trim() ? modelUrl : null,
    model_file_id: modelFileId?.trim() ? modelFileId : null,
    instruments,
  };
  return JSON.stringify(payload);
}

export function createPanelInstrument(
  partial: Partial<PanelInstrument> & { sort_order?: number } = {},
): PanelInstrument {
  return {
    id: partial.id ?? `inst_${Math.random().toString(36).slice(2, 10)}`,
    name: partial.name ?? "Novo instrumento",
    description: partial.description ?? "",
    shape: partial.shape ?? "rect",
    x: partial.x ?? 40,
    y: partial.y ?? 35,
    w: partial.w ?? 14,
    h: partial.h ?? 12,
    zoom_image_url: partial.zoom_image_url ?? null,
    sort_order: partial.sort_order ?? 1,
    pos_x: partial.pos_x ?? null,
    pos_y: partial.pos_y ?? null,
    pos_z: partial.pos_z ?? null,
  };
}

export function hasPanelModel(panel: Pick<AircraftPanel, "panel_model_url"> | { panel_model_url?: string | null }): boolean {
  return Boolean(panel.panel_model_url?.trim());
}

export function has3dHotspot(instrument: PanelInstrument): boolean {
  return [instrument.pos_x, instrument.pos_y, instrument.pos_z].every(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
}

export function isGlbFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".glb") || file.type === "model/gltf-binary";
}
