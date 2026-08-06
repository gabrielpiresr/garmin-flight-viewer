import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  deleteSoloFlightEndorsement,
  listSoloFlightEndorsements,
  uploadSoloFlightEndorsement,
} from "../lib/soloFlightDb";
import type { SoloFlightEndorsement } from "../types/soloFlight";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/ToastProvider";

function formatBytes(value: number): string {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function StudentEndorsementsTab() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [endorsements, setEndorsements] = useState<SoloFlightEndorsement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setEndorsements(await listSoloFlightEndorsements(user.id));
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao carregar endossos." });
    } finally {
      setLoading(false);
    }
  }, [showToast, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File | null) {
    if (!file || !user) return;
    setUploading(true);
    try {
      await uploadSoloFlightEndorsement({ studentUserId: user.id, uploaderUserId: user.id, uploaderRole: user.role, file, notes });
      setNotes("");
      showToast({ variant: "success", message: "Endosso anexado." });
      await load();
    } catch (error) {
      showToast({ variant: "error", message: error instanceof Error ? error.message : "Falha ao anexar endosso." });
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este endosso?")) return;
    await deleteSoloFlightEndorsement(id);
    await load();
  }

  if (loading) return <Skeleton className="h-72 rounded-2xl" />;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <h1 className="text-lg font-semibold text-slate-100">Endossos</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="text-xs font-medium text-slate-400">
            Observação
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          </label>
          <label className="inline-flex cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            {uploading ? "Enviando..." : "Enviar PDF/imagem"}
            <input type="file" accept="application/pdf,image/*" disabled={uploading} onChange={(e) => void upload(e.target.files?.[0] ?? null)} className="hidden" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        {endorsements.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nenhum endosso anexado.</p>
        ) : endorsements.map((item) => (
          <article key={item.id} className="flex flex-col gap-3 border-b border-slate-800 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-medium text-slate-100">{item.fileName}</h2>
                {item.active ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">ativo</span> : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">v{item.version} · {formatBytes(item.fileSize)} · {new Date(item.uploadedAt).toLocaleString("pt-BR")}</p>
              {item.notes ? <p className="mt-1 text-sm text-slate-400">{item.notes}</p> : null}
            </div>
            <div className="flex gap-2">
              <a href={item.fileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Abrir</a>
              <button type="button" onClick={() => void remove(item.id)} className="rounded-lg border border-red-900/50 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-950/30">Excluir</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
