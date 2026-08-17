import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SCHOOL_ID } from "../lib/appwrite";
import { listAircrafts } from "../lib/aircraftDb";
import { listPublishedAircraftPanels } from "../lib/aircraftPanelsDb";
import { PANEL_SEED_TEMPLATES } from "../lib/panelSeeds";
import type { AircraftPanel } from "../types/panel";
import { InteractivePanelViewer } from "./InteractivePanelViewer";
import { Skeleton } from "./ui/Skeleton";

function demoPanelsFromSeeds(): { panels: AircraftPanel[]; options: Array<{ id: string; label: string }> } {
  const panels = PANEL_SEED_TEMPLATES.map((t) => ({
    id: `demo-${t.id}`,
    school_id: DEFAULT_SCHOOL_ID,
    aircraft_id: `demo-ac-${t.id}`,
    title: t.title,
    panel_image_url: t.panel_image_url,
    panel_image_file_id: null,
    panel_model_url: null,
    panel_model_file_id: null,
    instruments: t.instruments.map((i) => ({ ...i })),
    published: true,
    updated_at: "",
    created_at: "",
  }));
  const options = panels.map((p, idx) => ({
    id: p.aircraft_id,
    label: idx === 0 ? "Demo Glass (G3X)" : "Demo Analógico",
  }));
  return { panels, options };
}

export function PanelTab() {
  const [loading, setLoading] = useState(true);
  const [panels, setPanels] = useState<AircraftPanel[]>([]);
  const [aircraftOptions, setAircraftOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pRes, aircraftRows] = await Promise.all([
        listPublishedAircraftPanels(DEFAULT_SCHOOL_ID),
        listAircrafts(DEFAULT_SCHOOL_ID).catch(() => []),
      ]);
      if (cancelled) return;

      const published = pRes.data ?? [];
      if (published.length > 0) {
        setError(null);
        setUsingDemo(false);
        setPanels(published);
        setAircraftOptions(
          aircraftRows.map((a) => ({
            id: a.id,
            label: `${a.registration}${a.nickname ? ` — ${a.nickname}` : ""}`,
          })),
        );
      } else {
        const demo = demoPanelsFromSeeds();
        setUsingDemo(true);
        setError(pRes.error ? pRes.error.message : null);
        setPanels(demo.panels);
        setAircraftOptions(demo.options);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emptyMessage = useMemo(
    () =>
      error
        ? `Não foi possível carregar os painéis: ${error}`
        : "Nenhum painel publicado ainda. Peça ao admin para cadastrar o painel das aeronaves.",
    [error],
  );

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-1">
      {usingDemo ? (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          Modo demonstração com os mockups locais. No admin (Conteúdos → Painel) aplique o seed em uma aeronave real para publicar.
        </div>
      ) : null}
      <InteractivePanelViewer panels={panels} aircraftOptions={aircraftOptions} emptyMessage={emptyMessage} />
    </div>
  );
}
