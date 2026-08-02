export type PublicDisplayPanelId =
  | "escala"
  | "jornada"
  | "aisweb"
  | "manuais"
  | "manobras"
  | "painel";

export type PublicDisplayZoomId = "sm" | "md" | "lg";

export type PublicDisplayBoardConfig = {
  columns: PublicDisplayPanelId[];
  zoom: PublicDisplayZoomId;
};

export const PUBLIC_DISPLAY_ZOOM_OPTIONS: Array<{
  id: PublicDisplayZoomId;
  label: string;
  shortLabel: string;
  /** Tamanho base do html só enquanto /escala-publica estiver aberta. */
  rootFontSize: string;
}> = [
  { id: "sm", label: "Menor", shortLabel: "A−", rootFontSize: "13px" },
  { id: "md", label: "Médio", shortLabel: "A", rootFontSize: "14.5px" },
  { id: "lg", label: "Maior", shortLabel: "A+", rootFontSize: "16px" },
];

export const DEFAULT_PUBLIC_DISPLAY_ZOOM: PublicDisplayZoomId = "md";

export const PUBLIC_DISPLAY_PANEL_OPTIONS: Array<{
  id: PublicDisplayPanelId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "escala",
    label: "Escala",
    shortLabel: "Escala",
    description: "Agenda de voos da escola em somente leitura.",
  },
  {
    id: "jornada",
    label: "Jornada",
    shortLabel: "Jornada",
    description: "Missões e conteúdo das trilhas, sem percentual de progresso.",
  },
  {
    id: "aisweb",
    label: "AISWEB",
    shortLabel: "AISWEB",
    description: "Condições meteorológicas e NOTAMs da watchlist.",
  },
  {
    id: "manuais",
    label: "Manuais",
    shortLabel: "Manuais",
    description: "Materiais e manuais publicados para consulta.",
  },
  {
    id: "manobras",
    label: "Manobras",
    shortLabel: "Manobras",
    description: "Catálogo de manobras e conteúdos de estudo.",
  },
  {
    id: "painel",
    label: "Painel interativo",
    shortLabel: "Painel",
    description: "Painel da aeronave com instrumentos interativos.",
  },
];

export const PUBLIC_DISPLAY_MAX_COLUMNS = 4;
export const PUBLIC_DISPLAY_STORAGE_KEY = "public-display-board-v1";

export const DEFAULT_PUBLIC_DISPLAY_BOARD: PublicDisplayBoardConfig = {
  columns: ["escala"],
  zoom: DEFAULT_PUBLIC_DISPLAY_ZOOM,
};

function isPanelId(value: unknown): value is PublicDisplayPanelId {
  return (
    value === "escala" ||
    value === "jornada" ||
    value === "aisweb" ||
    value === "manuais" ||
    value === "manobras" ||
    value === "painel"
  );
}

function isZoomId(value: unknown): value is PublicDisplayZoomId {
  return value === "sm" || value === "md" || value === "lg";
}

export function publicDisplayRootFontSize(zoom: PublicDisplayZoomId): string {
  return PUBLIC_DISPLAY_ZOOM_OPTIONS.find((option) => option.id === zoom)?.rootFontSize
    ?? PUBLIC_DISPLAY_ZOOM_OPTIONS.find((option) => option.id === DEFAULT_PUBLIC_DISPLAY_ZOOM)!.rootFontSize;
}

export function normalizePublicDisplayBoard(raw: unknown): PublicDisplayBoardConfig {
  const columnsRaw =
    raw && typeof raw === "object" && Array.isArray((raw as { columns?: unknown }).columns)
      ? (raw as { columns: unknown[] }).columns
      : [];
  const columns = columnsRaw.filter(isPanelId).slice(0, PUBLIC_DISPLAY_MAX_COLUMNS);
  const zoomRaw = raw && typeof raw === "object" ? (raw as { zoom?: unknown }).zoom : undefined;
  return {
    columns: columns.length > 0 ? columns : [...DEFAULT_PUBLIC_DISPLAY_BOARD.columns],
    zoom: isZoomId(zoomRaw) ? zoomRaw : DEFAULT_PUBLIC_DISPLAY_ZOOM,
  };
}

export function loadPublicDisplayBoard(): PublicDisplayBoardConfig {
  if (typeof window === "undefined") {
    return {
      columns: [...DEFAULT_PUBLIC_DISPLAY_BOARD.columns],
      zoom: DEFAULT_PUBLIC_DISPLAY_BOARD.zoom,
    };
  }
  try {
    const raw = window.localStorage.getItem(PUBLIC_DISPLAY_STORAGE_KEY);
    if (!raw) {
      return {
        columns: [...DEFAULT_PUBLIC_DISPLAY_BOARD.columns],
        zoom: DEFAULT_PUBLIC_DISPLAY_BOARD.zoom,
      };
    }
    return normalizePublicDisplayBoard(JSON.parse(raw) as unknown);
  } catch {
    return {
      columns: [...DEFAULT_PUBLIC_DISPLAY_BOARD.columns],
      zoom: DEFAULT_PUBLIC_DISPLAY_BOARD.zoom,
    };
  }
}

export function savePublicDisplayBoard(config: PublicDisplayBoardConfig): void {
  if (typeof window === "undefined") return;
  const normalized = normalizePublicDisplayBoard(config);
  window.localStorage.setItem(PUBLIC_DISPLAY_STORAGE_KEY, JSON.stringify(normalized));
}

export function panelLabel(id: PublicDisplayPanelId): string {
  return PUBLIC_DISPLAY_PANEL_OPTIONS.find((option) => option.id === id)?.label ?? id;
}
