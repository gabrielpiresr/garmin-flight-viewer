import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { deleteSavedFlight, listSavedFlights, type SavedFlightListItem } from "../lib/flightsDb";

type Props = {
  onOpen: (id: string) => void;
  refreshKey: number;
};

export function SavedFlightsPanel({ onOpen, refreshKey }: Props) {
  const { user, configured } = useAuth();
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      return;
    }
    setLoading(true);
    setErr(null);
    const { data, error } = await listSavedFlights();
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems(data ?? []);
  }, [user, configured]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  if (!configured || !user) return null;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-200">Voos salvos na nuvem</h2>
        <button
          type="button"
          className="text-xs text-sky-400 hover:underline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>
      {err ? <p className="mt-2 text-xs text-amber-200">{err}</p> : null}
      {loading && items.length === 0 ? <p className="mt-2 text-xs text-slate-500">Carregando…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhum voo salvo ainda. Importe um CSV e use “Salvar na nuvem”.</p>
      ) : null}
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
        {items.map((f) => (
          <li
            key={f.id}
            className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button
                type="button"
                className="text-left text-sky-300 hover:underline"
                onClick={() => onOpen(f.id)}
                title={f.source_filename}
              >
                {f.name}
              </button>
              <button
                type="button"
                className="shrink-0 text-xs text-red-400/90 hover:underline"
                onClick={async () => {
                  if (!confirm("Apagar este voo da nuvem?")) return;
                  const { error } = await deleteSavedFlight(f.id);
                  if (error) setErr(error.message);
                  else void refresh();
                }}
              >
                Apagar
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(f.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
              {f.source_filename}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
