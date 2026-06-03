import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InstallPwaButton } from "../InstallPwaButton";
import { listAircrafts } from "../../lib/aircraftDb";
import { SCHOOL_ID } from "../../lib/appwrite";
import {
  getOfflineAircraftPackage,
  listOfflineAircraftPackages,
  syncOfflineAircraftLogbookPackage,
  validateOfflinePackageCoverage,
  type OfflineAircraftLogbookPackage,
} from "../../lib/offlineLogbookDb";
import type { Aircraft } from "../../types/admin";
import { useToast } from "../ui/ToastProvider";

const schoolId = SCHOOL_ID ?? "escola_principal";

async function warmOfflineViewerCache(): Promise<void> {
  await Promise.allSettled([
    import("../../pages/OfflineLogbookPage"),
    fetch("/offline/diario-bordo", { cache: "reload" }),
    fetch("/manifest.webmanifest", { cache: "reload" }),
  ]);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusClass(state: "ok" | "warning" | "error"): string {
  if (state === "ok") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (state === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

export function OfflineLogbookAdminPanel() {
  const { showToast } = useToast();
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [selectedIdent, setSelectedIdent] = useState("");
  const [packages, setPackages] = useState<OfflineAircraftLogbookPackage[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const autoSyncedOnceRef = useRef(false);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.aircraft_ident === selectedIdent) ?? null,
    [packages, selectedIdent],
  );
  const selectedStatus = validateOfflinePackageCoverage(selectedPackage);

  const refreshLocalPackages = useCallback(async () => {
    const localPackages = await listOfflineAircraftPackages();
    setPackages(localPackages);
    return localPackages;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listAircrafts(schoolId), listOfflineAircraftPackages()])
      .then(([aircraftList, packageList]) => {
        if (cancelled) return;
        const avioes = aircraftList.filter((a) => a.type === "aviao");
        setAircrafts(avioes);
        setPackages(packageList);
        setSelectedIdent((current) => current || (avioes[0]?.registration ?? ""));
      })
      .catch((err) => {
        if (!cancelled) showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao carregar offline." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const autoSyncStalePackages = useCallback(async () => {
    if (autoSyncing || syncing || !navigator.onLine) return;
    const stalePackages = packages.filter((pkg) => validateOfflinePackageCoverage(pkg).state !== "ok");
    if (stalePackages.length === 0) return;
    setAutoSyncing(true);
    try {
      for (const pkg of stalePackages) {
        await syncOfflineAircraftLogbookPackage(pkg.aircraft_ident);
      }
      await warmOfflineViewerCache();
      await refreshLocalPackages();
      showToast({ variant: "success", message: "Pacotes offline vencidos foram atualizados automaticamente." });
    } catch (err) {
      showToast({ variant: "warning", message: err instanceof Error ? err.message : "Nao foi possivel atualizar o offline automaticamente." });
    } finally {
      setAutoSyncing(false);
    }
  }, [autoSyncing, packages, refreshLocalPackages, showToast, syncing]);

  useEffect(() => {
    if (loading || autoSyncedOnceRef.current || packages.length === 0) return;
    autoSyncedOnceRef.current = true;
    void autoSyncStalePackages();
  }, [autoSyncStalePackages, loading, packages.length]);

  useEffect(() => {
    const onOnline = () => void autoSyncStalePackages();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [autoSyncStalePackages]);

  async function handleSync() {
    if (!selectedIdent) {
      showToast({ variant: "warning", message: "Selecione uma aeronave." });
      return;
    }
    setSyncing(true);
    try {
      const pkg = await syncOfflineAircraftLogbookPackage(selectedIdent);
      await warmOfflineViewerCache();
      await refreshLocalPackages();
      showToast({
        variant: "success",
        message: `Pacote offline ${pkg.aircraft_ident} sincronizado: ${pkg.entries.length} entrada(s).`,
      });
    } catch (err) {
      showToast({ variant: "error", message: err instanceof Error ? err.message : "Falha ao sincronizar pacote offline." });
    } finally {
      setSyncing(false);
    }
  }

  async function handleRefreshSelected() {
    if (!selectedIdent) return;
    const pkg = await getOfflineAircraftPackage(schoolId, selectedIdent);
    setPackages((current) => {
      const rest = current.filter((item) => item.aircraft_ident !== selectedIdent);
      return pkg ? [...rest, pkg] : rest;
    });
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="h-5 w-56 animate-pulse rounded bg-slate-800" />
        <div className="mt-4 h-24 animate-pulse rounded bg-slate-800/60" />
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">A bordo</p>
          <h2 className="text-lg font-semibold text-slate-100">Diario de bordo offline</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Sincroniza neste dispositivo os voos assinados pelo instrutor nos ultimos 30 dias da aeronave.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <InstallPwaButton />
          <a
            href="/offline/diario-bordo"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Abrir modo offline
          </a>
        </div>
      </div>

      {autoSyncing ? (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          Atualizando automaticamente pacotes offline vencidos neste dispositivo...
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1fr)]">
        <label>
          <span className="mb-1 block text-xs text-slate-500">Aeronave</span>
          <select
            value={selectedIdent}
            onChange={(event) => setSelectedIdent(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          >
            {aircrafts.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.registration}>
                {aircraft.registration}{aircraft.nickname ? ` - ${aircraft.nickname}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className={`rounded-lg border px-4 py-3 ${statusClass(selectedStatus.state)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{selectedStatus.label}</p>
            <p className="font-mono text-xs">{selectedPackage?.package_hash.slice(0, 12) ?? "sem pacote"}</p>
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            {selectedStatus.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      </div>

      {selectedPackage ? (
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Gerado em</p>
            <p className="mt-1 font-semibold text-slate-100">{formatDateTime(selectedPackage.generated_at)}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Janela</p>
            <p className="mt-1 font-semibold text-slate-100">{selectedPackage.valid_from} a {selectedPackage.valid_to}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Voos / entradas</p>
            <p className="mt-1 font-semibold text-slate-100">{selectedPackage.flights.length} / {selectedPackage.entries.length}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Expira em</p>
            <p className="mt-1 font-semibold text-slate-100">{formatDateTime(selectedPackage.expires_at)}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleRefreshSelected()}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          Recarregar status
        </button>
        <button
          type="button"
          disabled={syncing || !selectedIdent}
          onClick={() => void handleSync()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {syncing ? "Sincronizando..." : "Sincronizar para bordo"}
        </button>
      </div>
    </section>
  );
}
