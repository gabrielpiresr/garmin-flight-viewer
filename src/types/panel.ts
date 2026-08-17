export type InstrumentShape = "circle" | "rect";

/** Hotspot de instrumento no painel — coordenadas em % (0–100) relativos à imagem. */
export type PanelInstrument = {
  id: string;
  name: string;
  description: string;
  shape: InstrumentShape;
  x: number;
  y: number;
  w: number;
  h: number;
  zoom_image_url: string | null;
  sort_order: number;
  /** Posição do hotspot no modelo GLB (espaço do modelo). */
  pos_x?: number | null;
  pos_y?: number | null;
  pos_z?: number | null;
};

export type AircraftPanel = {
  id: string;
  school_id: string;
  aircraft_id: string;
  title: string;
  panel_image_url: string;
  panel_image_file_id: string | null;
  panel_model_url: string | null;
  panel_model_file_id: string | null;
  instruments: PanelInstrument[];
  published: boolean;
  updated_at: string;
  created_at: string;
};

export type AircraftPanelInput = {
  school_id: string;
  aircraft_id: string;
  title: string;
  panel_image_url: string;
  panel_image_file_id?: string | null;
  panel_model_url?: string | null;
  panel_model_file_id?: string | null;
  instruments: PanelInstrument[];
  published?: boolean;
};

export type PanelSeedTemplate = {
  id: string;
  title: string;
  panel_image_url: string;
  instruments: PanelInstrument[];
};
