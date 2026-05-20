import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { deleteSavedFlight, listSavedFlights, type SavedFlightListItem } from "../lib/flightsDb";

const FLIGHT_PAGE_SIZE = 50;

type Props = {
  onOpen: (id: string) => void;
  refreshKey: number;
};

export function SavedFlightsPanel({ onOpen, refreshKey }: Props) {
  const { user, configured } = useAuth();
  const [items, setItems] = useState<SavedFlightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !configured) {
      setItems([]);
      setNextCursor(null);
      setTotal(0);
      return;
    }
    setLoading(true);
    setErr(null);
    const { data, error, nextCursor: cursor, total: nextTotal } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: FLIGHT_PAGE_SIZE },
    );
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems(data ?? []);
    setNextCursor(cursor);
    setTotal(nextTotal);
  }, [user, configured]);

  const loadMore = useCallback(async () => {
    if (!user || !configured || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    const { data, error, nextCursor: cursor, total: nextTotal } = await listSavedFlights(
      { userId: user.id, role: user.role },
      { limit: FLIGHT_PAGE_SIZE, cursor: nextCursor },
    );
    setLoadingMore(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setItems((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      for (const item of data ?? []) byId.set(item.id, item);
      return [...byId.values()];
    });
    setNextCursor(cursor);
    setTotal(nextTotal);
  }, [configured, loadingMore, nextCursor, user]);

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
      {err ? <p className="mt-2 text-xs text-amber-400">{err}</p> : null}
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
                Abrir voo
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
      {nextCursor ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          {total > 0 ? (
            <span className="text-xs text-slate-500">
              {Math.min(items.length, total)} de {total}
            </span>
          ) : null}
          <button
            type="button"
            className="text-xs font-medium text-sky-400 hover:underline disabled:cursor-wait disabled:opacity-60"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
